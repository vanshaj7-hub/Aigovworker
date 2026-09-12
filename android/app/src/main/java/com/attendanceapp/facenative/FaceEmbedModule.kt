package com.attendanceapp.facenative

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt
import org.tensorflow.lite.Interpreter

/**
 * Native replacement for the JS-side face alignment + TFLite inference that
 * used to live in face.js's extractFaceEmbedding(). Face detection/landmarks
 * and the initial square crop still happen in JS via ML Kit and
 * ImageEditor.cropImage (already correctly handles EXIF/orientation); this
 * module takes that already-cropped square photo plus the available ArcFace
 * landmarks (eyes always; nose/mouth corners when ML Kit reports them) and
 * does the rest natively: a least-squares similarity alignment via
 * fitSimilarity + Canvas/Matrix (Android's own well-tested affine warp,
 * instead of a hand-rolled per-pixel JS bilinear sampler), pixel
 * normalization, and TFLite inference.
 *
 * Aligning across all 5 landmarks instead of just the 2 eyes spreads
 * detector noise across five measurements rather than the whole alignment
 * being fully (and thus fully noise-sensitively) determined by only two —
 * intended to reduce match-score variance between captures of the same face.
 *
 * The alignment targets (TGT_*) match src/domain/faceMath.js's ArcFace
 * 5-point template exactly, and fitSimilarity here is a direct port of the
 * same function there (unit-tested in faceMath.test.js against known
 * transforms before being ported, since this Kotlin copy itself has no way
 * to be unit-tested in this environment). Normalization uses the standard
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
    private val TGT_NOSE = floatArrayOf(56.0252f, 71.7366f)
    private val TGT_MOUTH_LEFT = floatArrayOf(41.5493f, 92.3655f)
    private val TGT_MOUTH_RIGHT = floatArrayOf(70.7299f, 92.2041f)
    private const val MODEL_ASSET = "mobile_face_net.tflite"

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

  /**
   * `alignment` carries leftEyeX/leftEyeY/rightEyeX/rightEyeY (always) and
   * noseX/noseY/mouthLeftX/mouthLeftY/mouthRightX/mouthRightY (when face.js
   * had them available) — all as offsets from the crop's top-left corner, in
   * the ORIGINAL photo's pixel units, i.e. before any resampling — plus
   * cropSize (the crop box's requested side length in those same units). The
   * actual decoded bitmap can differ slightly from the requested size, so
   * the scale factor is derived from the real decoded width/height, the same
   * defensive approach face.js used before this change.
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
      val hasExtra =
          alignment.hasKey("noseX") && alignment.hasKey("mouthLeftX") && alignment.hasKey("mouthRightX")

      // ML Kit's leftEye/rightEye (and mouthLeft/mouthRight) are labeled from
      // the SUBJECT's perspective, not the image's — a normal, unmirrored
      // photo places the subject's own left eye on the image's right side.
      // Detect that case from the eyes (mirrored <=> ML Kit's "left" landmark
      // is actually on the image's left side) and apply the same swap to the
      // mouth corners, since a photo is mirrored as a whole, not per-landmark.
      val mirrored = leftEye[0] <= rightEye[0]
      val (imgLeftEye, imgRightEye) = if (mirrored) Pair(leftEye, rightEye) else Pair(rightEye, leftEye)

      val src = mutableListOf(imgLeftEye, imgRightEye)
      val dst = mutableListOf(TGT_LEFT_EYE, TGT_RIGHT_EYE)
      if (hasExtra) {
        val nose = point("noseX", "noseY")
        val mouthLeft = point("mouthLeftX", "mouthLeftY")
        val mouthRight = point("mouthRightX", "mouthRightY")
        val (imgMouthLeft, imgMouthRight) =
            if (mirrored) Pair(mouthLeft, mouthRight) else Pair(mouthRight, mouthLeft)
        src.add(nose)
        src.add(imgMouthLeft)
        src.add(imgMouthRight)
        dst.add(TGT_NOSE)
        dst.add(TGT_MOUTH_LEFT)
        dst.add(TGT_MOUTH_RIGHT)
      }

      val fit = fitSimilarity(src, dst)
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
