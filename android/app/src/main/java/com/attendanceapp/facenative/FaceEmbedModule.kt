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
 * module takes that already-cropped square photo plus the two eye positions
 * (in the crop's own pixel space) and does the rest natively: a 2-point
 * similarity alignment via Matrix/Canvas (Android's own well-tested affine
 * warp, instead of a hand-rolled per-pixel JS bilinear sampler), pixel
 * normalization, and TFLite inference.
 *
 * The alignment target (TGT_LEFT_EYE/TGT_RIGHT_EYE) matches
 * src/domain/faceMath.js's ArcFace 5-point template exactly, normalization
 * uses the standard ArcFace/InsightFace convention ((pixel - 127.5) / 128.0),
 * and this loads the same bundled model (assets/mobile_face_net.tflite,
 * copied here into the native assets folder) — so existing enrolled
 * reference embeddings stay in the same embedding space; nothing needs
 * re-enrolling because of this change.
 */
class FaceEmbedModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FaceEmbed"

  companion object {
    private const val OUT = 112
    private val TGT_LEFT_EYE = floatArrayOf(38.2946f, 51.6963f)
    private val TGT_RIGHT_EYE = floatArrayOf(73.5318f, 51.5014f)
    private const val MODEL_ASSET = "mobile_face_net.tflite"
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
   * `alignment` carries leftEyeX/leftEyeY/rightEyeX/rightEyeY (offsets from the
   * crop's top-left corner, in the ORIGINAL photo's pixel units — i.e. before
   * any resampling) plus cropSize (the crop box's requested side length in
   * those same units). The actual decoded bitmap can differ slightly from the
   * requested size, so the scale factor is derived from the real decoded
   * width, the same defensive approach face.js used before this change.
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
      val lx = (alignment.getDouble("leftEyeX") * scaleX).toFloat()
      val ly = (alignment.getDouble("leftEyeY") * scaleY).toFloat()
      val rx = (alignment.getDouble("rightEyeX") * scaleX).toFloat()
      val ry = (alignment.getDouble("rightEyeY") * scaleY).toFloat()

      // Order by image position (left-most -> template-left eye), matching
      // faceMath.js's eyeAlignInverseMap: subject-relative left/right doesn't
      // matter here, only which side of the image each point falls on.
      val srcPts: FloatArray =
          if (lx <= rx) floatArrayOf(lx, ly, rx, ry) else floatArrayOf(rx, ry, lx, ly)
      val dstPts =
          floatArrayOf(TGT_LEFT_EYE[0], TGT_LEFT_EYE[1], TGT_RIGHT_EYE[0], TGT_RIGHT_EYE[1])

      val matrix = Matrix()
      if (!matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 2)) {
        throw RuntimeException("ALIGN_FAILED")
      }

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
