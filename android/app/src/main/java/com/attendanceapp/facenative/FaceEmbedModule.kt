package com.attendanceapp.facenative

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt
import org.tensorflow.lite.Interpreter

/**
 * Native module for the face-matching pipeline's two on-device-heavy steps:
 *
 * 1. detectFace(): face + eye-landmark detection via MediaPipe's Face
 *    Landmarker (assets/face_landmarker.task) instead of
 *    @react-native-ml-kit/face-detection. An offline validation (real labeled
 *    same/different-person photos, this exact embedding model + alignment
 *    math) showed a large genuine/impostor separation with MediaPipe's
 *    landmarks vs. a much narrower one with ML Kit's, on real on-device
 *    match-log data — this is that validated fix, not a guess. ML Kit stays
 *    in use in CaptureScreen.js for the live preview indicator and blink-
 *    liveness check, where landmark precision doesn't matter and its
 *    lighter weight suits polling every 2s.
 *
 * 2. extractEmbedding(): takes a square crop (from face.js's
 *    computeSquareCrop + ImageEditor.cropImage, which already handles
 *    EXIF/orientation correctly) plus the two eye positions detectFace()
 *    found, and does the rest natively: a least-squares similarity alignment
 *    via fitSimilarity + Canvas/Matrix (Android's own well-tested affine
 *    warp, instead of a hand-rolled per-pixel JS bilinear sampler), pixel
 *    normalization, and TFLite inference.
 *
 * The alignment targets (TGT_*) match src/domain/faceMath.js's ArcFace
 * template exactly, and fitSimilarity here is a direct port of the same
 * function there (unit-tested in faceMath.test.js against known transforms
 * before being ported, since this Kotlin copy itself has no way to be
 * unit-tested in this environment). Normalization uses the standard
 * ArcFace/InsightFace convention ((pixel - 127.5) / 128.0), and this loads
 * the same bundled model (assets/mobile_face_net.tflite, copied here into
 * the native assets folder) — so existing enrolled reference embeddings stay
 * in the same embedding space; nothing needs re-enrolling because of this.
 */
class FaceEmbedModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FaceEmbed"

  companion object {
    private const val OUT = 112
    private val TGT_LEFT_EYE = floatArrayOf(38.2946f, 51.6963f)
    private val TGT_RIGHT_EYE = floatArrayOf(73.5318f, 51.5014f)
    private const val MODEL_ASSET = "mobile_face_net.tflite"
    private const val LANDMARKER_ASSET = "face_landmarker.task"
    private const val MAX_FACES = 2

    // MediaPipe's 478-point face mesh topology (with iris refinement, which
    // this task model includes): 468 = right iris center, 473 = left iris
    // center, in MediaPipe's own (subject-relative) naming — same as ML
    // Kit's, we don't care which is anatomically which, only the two
    // positions; left/right assignment to the template is resolved by
    // x-sort in extractEmbedding, unchanged from before.
    private const val RIGHT_IRIS_INDEX = 468
    private const val LEFT_IRIS_INDEX = 473

    /**
     * Least-squares similarity transform (uniform scale + rotation +
     * translation, no shear) mapping `src` onto `dst`, solved in closed form.
     * Direct port of faceMath.js's fitSimilarity — see that file for the
     * derivation; keep the two in sync. Returns (a, b, tx, ty) such that
     * u = a*x - b*y + tx, v = b*x + a*y + ty.
     */
    private fun fitSimilarity(src: List<FloatArray>, dst: List<FloatArray>): FloatArray {
      val n = src.size
      var sx = 0.0
      var sy = 0.0
      var su = 0.0
      var sv = 0.0
      var sxxYy = 0.0
      var sxuYv = 0.0
      var svxUy = 0.0
      for (i in 0 until n) {
        val x = src[i][0].toDouble()
        val y = src[i][1].toDouble()
        val u = dst[i][0].toDouble()
        val v = dst[i][1].toDouble()
        sx += x
        sy += y
        su += u
        sv += v
        sxxYy += x * x + y * y
        sxuYv += x * u + y * v
        svxUy += v * x - u * y
      }
      val denom = n * sxxYy - sx * sx - sy * sy
      val a = if (denom != 0.0) (n * sxuYv - sx * su - sy * sv) / denom else 1.0
      val b = if (denom != 0.0) (n * svxUy + sy * su - sx * sv) / denom else 0.0
      val tx = (su - a * sx + b * sy) / n
      val ty = (sv - b * sx - a * sy) / n
      return floatArrayOf(a.toFloat(), b.toFloat(), tx.toFloat(), ty.toFloat())
    }
  }

  @Volatile private var interpreter: Interpreter? = null

  private fun getInterpreter(): Interpreter {
    interpreter?.let {
      return it
    }
    synchronized(this) {
      interpreter?.let {
        return it
      }
      val modelBytes = reactContext.assets.open(MODEL_ASSET).use { it.readBytes() }
      val buffer = ByteBuffer.allocateDirect(modelBytes.size)
      buffer.order(ByteOrder.nativeOrder())
      buffer.put(modelBytes)
      buffer.rewind()
      val options = Interpreter.Options()
      options.setNumThreads(4)
      val created = Interpreter(buffer, options)
      interpreter = created
      return created
    }
  }

  @Volatile private var faceLandmarker: FaceLandmarker? = null

  private fun getFaceLandmarker(): FaceLandmarker {
    faceLandmarker?.let {
      return it
    }
    synchronized(this) {
      faceLandmarker?.let {
        return it
      }
      val baseOptions = BaseOptions.builder().setModelAssetPath(LANDMARKER_ASSET).build()
      val options =
          FaceLandmarker.FaceLandmarkerOptions.builder()
              .setBaseOptions(baseOptions)
              .setRunningMode(RunningMode.IMAGE)
              .setNumFaces(MAX_FACES)
              .setMinFaceDetectionConfidence(0.3f)
              .setMinFacePresenceConfidence(0.3f)
              .build()
      val created = FaceLandmarker.createFromOptions(reactContext, options)
      faceLandmarker = created
      return created
    }
  }

  /**
   * Decodes a bitmap from `path` and rotates it to upright orientation per
   * its EXIF tag. Needed because BitmapFactory.decodeFile ignores EXIF, but
   * every downstream coordinate consumer (computeSquareCrop, ImageEditor.
   * cropImage in face.js) works in the "upright" space a phone photo's EXIF
   * orientation defines — the same convention @react-native-ml-kit/
   * face-detection's InputImage.fromFilePath already followed, which this
   * must match now that detection moved to MediaPipe (which just takes a
   * plain Bitmap with no EXIF awareness of its own).
   */
  private fun decodeUprightBitmap(path: String): Bitmap {
    val bitmap = BitmapFactory.decodeFile(path) ?: throw RuntimeException("DECODE_FAILED")
    val orientation =
        try {
          ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
          ExifInterface.ORIENTATION_NORMAL
        }
    val degrees =
        when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
    if (degrees == 0f) {
      return bitmap
    }
    val matrix = Matrix()
    matrix.postRotate(degrees)
    val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    bitmap.recycle()
    return rotated
  }

  /**
   * Detects the prominent face in the ORIGINAL (uncropped) photo and returns
   * its bounding box plus the two eye positions, all in that upright photo's
   * pixel coordinates — the same shape/space @react-native-ml-kit/
   * face-detection's result used to provide, so face.js's downstream
   * computeSquareCrop/ImageEditor.cropImage/extractEmbedding call sites don't
   * need to change. Rejects with "NO_FACE" when nothing is detected (mapped
   * by face.js to the existing NO_FACE error code); any other failure
   * rejects with "MODEL_ERROR".
   */
  @ReactMethod
  fun detectFace(photoPath: String, promise: Promise) {
    var bitmap: Bitmap? = null
    try {
      val path = photoPath.removePrefix("file://")
      bitmap = decodeUprightBitmap(path)
      val mpImage = BitmapImageBuilder(bitmap).build()
      val result = getFaceLandmarker().detect(mpImage)
      val faces = result.faceLandmarks()
      if (faces.isEmpty()) {
        promise.reject("NO_FACE", "no face detected")
        return
      }

      val bboxes = faces.map { bboxOf(it, bitmap.width, bitmap.height) }
      val areas = bboxes.map { it[2] * it[3] }
      val order = areas.indices.sortedByDescending { areas[it] }
      val primaryIdx = order[0]
      val primary = faces[primaryIdx]
      val primaryBbox = bboxes[primaryIdx]

      val multipleFaces = faces.size > 1 && areas[order[1]] > areas[primaryIdx] * 0.5f

      val leftIris = primary[LEFT_IRIS_INDEX]
      val rightIris = primary[RIGHT_IRIS_INDEX]

      val out: WritableMap = Arguments.createMap()
      val frame: WritableMap = Arguments.createMap()
      frame.putDouble("left", primaryBbox[0].toDouble())
      frame.putDouble("top", primaryBbox[1].toDouble())
      frame.putDouble("width", primaryBbox[2].toDouble())
      frame.putDouble("height", primaryBbox[3].toDouble())
      out.putMap("frame", frame)
      out.putDouble("leftEyeX", (leftIris.x() * bitmap.width).toDouble())
      out.putDouble("leftEyeY", (leftIris.y() * bitmap.height).toDouble())
      out.putDouble("rightEyeX", (rightIris.x() * bitmap.width).toDouble())
      out.putDouble("rightEyeY", (rightIris.y() * bitmap.height).toDouble())
      out.putBoolean("multipleFaces", multipleFaces)
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("MODEL_ERROR", e.message, e)
    } finally {
      bitmap?.recycle()
    }
  }

  /** [left, top, width, height] bounding box from a face's landmark cloud. */
  private fun bboxOf(landmarks: List<NormalizedLandmark>, imgW: Int, imgH: Int): FloatArray {
    var minX = Float.MAX_VALUE
    var minY = Float.MAX_VALUE
    var maxX = -Float.MAX_VALUE
    var maxY = -Float.MAX_VALUE
    for (lm in landmarks) {
      val x = lm.x() * imgW
      val y = lm.y() * imgH
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return floatArrayOf(minX, minY, maxX - minX, maxY - minY)
  }

  /**
   * `alignment` carries leftEyeX/leftEyeY/rightEyeX/rightEyeY — offsets from
   * the crop's top-left corner, in the ORIGINAL photo's pixel units, i.e.
   * before any resampling — plus cropSize (the crop box's requested side
   * length in those same units). The actual decoded bitmap can differ
   * slightly from the requested size, so the scale factor is derived from
   * the real decoded width/height, the same defensive approach face.js used
   * before this change.
   *
   * A nose/mouth-corner 5-point extension was tried here and reverted: it
   * shipped in the same build as a field report of a confident (0.80) match
   * between two different people — worse than this eyes-only fit ever
   * produced. See face.js's extractFaceEmbedding for the fuller account.
   */
  @ReactMethod
  fun extractEmbedding(cropPath: String, alignment: ReadableMap, promise: Promise) {
    var cropBitmap: Bitmap? = null
    var aligned: Bitmap? = null
    try {
      val path = cropPath.removePrefix("file://")
      cropBitmap = BitmapFactory.decodeFile(path) ?: throw RuntimeException("DECODE_FAILED")

      // Use the real decoded width AND height (not a single width-derived
      // scale assuming a perfectly square crop) — the same defensive
      // real-vs-requested-size handling the old JS code did, since a crop
      // library can return a bitmap slightly off-square from what was asked.
      val cropSizeRequested = alignment.getDouble("cropSize")
      val scaleX = if (cropSizeRequested > 0) cropBitmap.width.toDouble() / cropSizeRequested else 1.0
      val scaleY = if (cropSizeRequested > 0) cropBitmap.height.toDouble() / cropSizeRequested else 1.0
      fun point(xKey: String, yKey: String) =
          floatArrayOf(
              (alignment.getDouble(xKey) * scaleX).toFloat(),
              (alignment.getDouble(yKey) * scaleY).toFloat(),
          )

      val leftEye = point("leftEyeX", "leftEyeY")
      val rightEye = point("rightEyeX", "rightEyeY")

      // Order by image position (left-most -> template-left eye), matching
      // faceMath.js's eyeAlignInverseMap: subject-relative left/right doesn't
      // matter here, only which side of the image each point falls on.
      val (imgLeftEye, imgRightEye) =
          if (leftEye[0] <= rightEye[0]) Pair(leftEye, rightEye) else Pair(rightEye, leftEye)

      val fit = fitSimilarity(listOf(imgLeftEye, imgRightEye), listOf(TGT_LEFT_EYE, TGT_RIGHT_EYE))
      val a = fit[0]
      val b = fit[1]
      val tx = fit[2]
      val ty = fit[3]
      if (a.isNaN() || b.isNaN() || tx.isNaN() || ty.isNaN()) {
        throw RuntimeException("ALIGN_FAILED")
      }
      val matrix = Matrix()
      matrix.setValues(floatArrayOf(a, -b, tx, b, a, ty, 0f, 0f, 1f))

      aligned = Bitmap.createBitmap(OUT, OUT, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(aligned)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
      canvas.drawBitmap(cropBitmap, matrix, paint)

      val pixels = IntArray(OUT * OUT)
      aligned.getPixels(pixels, 0, OUT, 0, 0, OUT, OUT)

      val interp = getInterpreter()
      val outputShape = interp.getOutputTensor(0).shape()
      val dim = outputShape[outputShape.size - 1]

      val embedding = runEmbedding(interp, pixels, dim)
      val quality = computeQuality(pixels)

      val result: WritableMap = Arguments.createMap()
      val arr = Arguments.createArray()
      for (v in embedding) {
        arr.pushDouble(v.toDouble())
      }
      result.putArray("embedding", arr)
      result.putDouble("brightness", quality.first.toDouble())
      result.putDouble("sharpness", quality.second.toDouble())
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("MODEL_ERROR", e.message, e)
    } finally {
      cropBitmap?.recycle()
      aligned?.recycle()
    }
  }

  /**
   * Runs the model on the aligned tensor and its horizontal mirror (the same
   * test-time-augmentation the JS pipeline did), averages, and L2-normalizes.
   */
  private fun runEmbedding(interpreter: Interpreter, pixels: IntArray, dim: Int): FloatArray {
    val normal = buildInput(pixels, flip = false)
    val mirrored = buildInput(pixels, flip = true)

    val out1 = runOnce(interpreter, normal, dim)
    val out2 = runOnce(interpreter, mirrored, dim)

    val avg = FloatArray(dim)
    for (i in 0 until dim) {
      avg[i] = (out1[i] + out2[i]) / 2f
    }
    var normSq = 0.0
    for (v in avg) {
      normSq += (v * v).toDouble()
    }
    val norm = sqrt(normSq)
    val normFactor = if (norm == 0.0) 1.0 else norm
    return FloatArray(dim) { i -> (avg[i] / normFactor).toFloat() }
  }

  /**
   * react-native-fast-tflite's native call had occasionally been seen to throw
   * a raw, one-off native error under load (contention with ML Kit calls also
   * in flight); keeping the same single-retry here covers the same class of
   * transient hiccup for this direct TFLite Interpreter call.
   */
  private fun runOnce(
      interpreter: Interpreter,
      input: Array<Array<Array<FloatArray>>>,
      dim: Int,
  ): FloatArray {
    val output = Array(1) { FloatArray(dim) }
    try {
      interpreter.run(input, output)
    } catch (e: Exception) {
      interpreter.run(input, output)
    }
    return output[0]
  }

  private fun buildInput(pixels: IntArray, flip: Boolean): Array<Array<Array<FloatArray>>> {
    return Array(1) {
      Array(OUT) { y ->
        Array(OUT) { x ->
          val srcX = if (flip) OUT - 1 - x else x
          val p = pixels[y * OUT + srcX]
          val r = (p shr 16) and 0xFF
          val g = (p shr 8) and 0xFF
          val b = p and 0xFF
          floatArrayOf((r - 127.5f) / 128.0f, (g - 127.5f) / 128.0f, (b - 127.5f) / 128.0f)
        }
      }
    }
  }

  /**
   * Brightness (mean 0-255 luma) and sharpness (Laplacian-variance edge
   * energy), computed directly on the raw aligned pixels — the same units
   * faceMath.js's MIN_SHARPNESS/MIN_BRIGHTNESS/MAX_BRIGHTNESS thresholds
   * already expect, so those thresholds carry over unchanged.
   */
  private fun computeQuality(pixels: IntArray): Pair<Float, Float> {
    val gray = FloatArray(OUT * OUT)
    var sum = 0.0
    for (i in pixels.indices) {
      val p = pixels[i]
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      val v = (r + g + b) / 3f
      gray[i] = v
      sum += v
    }
    val brightness = (sum / (OUT * OUT)).toFloat()

    var lapSum = 0.0
    var lapSumSq = 0.0
    var n = 0
    for (y in 1 until OUT - 1) {
      for (x in 1 until OUT - 1) {
        val i = y * OUT + x
        val lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - OUT] - gray[i + OUT]
        lapSum += lap
        lapSumSq += lap.toDouble() * lap.toDouble()
        n++
      }
    }
    val mean = if (n > 0) lapSum / n else 0.0
    val variance = if (n > 0) lapSumSq / n - mean * mean else 0.0
    return Pair(brightness, variance.toFloat())
  }
}
