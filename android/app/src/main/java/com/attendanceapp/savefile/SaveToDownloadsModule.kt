package com.attendanceapp.savefile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads a report file straight from its storage-bucket URL and saves it
 * into the public Downloads folder, showing a completion notification that
 * opens it on tap.
 *
 * This is the third approach for this one feature, after DownloadManager
 * (its own HTTP fetch never reliably completed against the report-file
 * host) and RNFS.downloadFile in JS (stalled with no timeout — a "download
 * started" toast and then nothing, forever). This version does the fetch
 * itself with a plain HttpURLConnection, explicit timeouts, and — because
 * guessing blind has failed twice already — emits a log event at every
 * step via RNSaveFileLog, so a run that still goes wrong is something the
 * app can show rather than something nobody can see. The outer catch is
 * Throwable, not Exception: the previous version's silent hang was exactly
 * the failure mode of a promise that never settles, and an uncaught Error
 * (not an Exception) on this thread would have been invisible the same way.
 */
class SaveToDownloadsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "RNSaveFile"

  private fun log(message: String) {
    try {
      val params = Arguments.createMap()
      params.putString("message", message)
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("RNSaveFileLog", params)
    } catch (e: Throwable) {
      // Logging must never be the thing that breaks the download.
    }
  }

  @ReactMethod
  fun downloadAndSave(url: String, filename: String, mimeType: String, promise: Promise) {
    Thread {
      var settled = false
      fun resolve(value: String) {
        if (!settled) {
          settled = true
          promise.resolve(value)
        }
      }
      fun reject(code: String, message: String, cause: Throwable? = null) {
        log("FAILED: $code: $message")
        if (!settled) {
          settled = true
          promise.reject(code, message, cause)
        }
      }

      var connection: HttpURLConnection? = null
      try {
        log("connecting (sdk=${Build.VERSION.SDK_INT}, filename=$filename, mimeType=$mimeType)")
        connection = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 30000
          readTimeout = 30000
          requestMethod = "GET"
        }
        connection.connect()
        val code = connection.responseCode
        val length = connection.contentLengthLong
        log("connected: HTTP $code, content-length=$length")
        if (code !in 200..299) {
          reject("HTTP_ERROR", "The file host rejected the request (HTTP $code).")
          return@Thread
        }

        val savedUri = connection.inputStream.use { input ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            log("saving via MediaStore")
            saveViaMediaStore(input, filename, mimeType)
          } else {
            log("saving via legacy public-Downloads file path")
            saveLegacy(input, filename)
          }
        }
        log("save complete: $savedUri")

        try {
          showCompletionNotification(filename, mimeType, savedUri)
          log("notification shown")
        } catch (e: Throwable) {
          // The file is already saved — a notification failure shouldn't
          // turn into a reported download failure.
          log("notification failed (file still saved): ${e.javaClass.simpleName}: ${e.message}")
        }
        resolve(savedUri.toString())
      } catch (e: Throwable) {
        reject("DOWNLOAD_ERROR", "${e.javaClass.simpleName}: ${e.message}", e)
      } finally {
        connection?.disconnect()
        // Safety net: if something above returned or threw in a way that
        // skipped both resolve() and reject() (shouldn't happen, but a
        // silently hung promise is exactly the bug this rewrite exists to
        // kill), the caller still gets an answer instead of waiting forever.
        if (!settled) {
          reject("UNKNOWN_ERROR", "The download ended without a result.")
        }
      }
    }.start()
  }

  /** Android 10+: a plain file path into the public Downloads folder is
   * blocked by scoped storage — MediaStore is the sanctioned way in. */
  private fun saveViaMediaStore(input: InputStream, filename: String, mimeType: String): Uri {
    val resolver = reactContext.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, filename)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("Could not create a file in Downloads.")
    val out: OutputStream = resolver.openOutputStream(uri)
      ?: throw IllegalStateException("Could not open Downloads for writing.")
    val bytes = out.use { stream -> input.copyTo(stream) }
    log("wrote $bytes bytes via MediaStore")
    values.clear()
    values.put(MediaStore.Downloads.IS_PENDING, 0)
    resolver.update(uri, values, null, null)
    return uri
  }

  /** Below Android 10: scoped storage doesn't apply — WRITE_EXTERNAL_STORAGE
   * (declared maxSdkVersion 28) lets a plain file path reach the public
   * Downloads folder directly. */
  private fun saveLegacy(input: InputStream, filename: String): Uri {
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    dir.mkdirs()
    val dest = File(dir, filename)
    val bytes = FileOutputStream(dest).use { out -> input.copyTo(out) }
    log("wrote $bytes bytes via legacy file path")
    return FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.fileprovider", dest)
  }

  private fun showCompletionNotification(filename: String, mimeType: String, uri: Uri) {
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channelId = "downloads"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(channelId, "Downloads", NotificationManager.IMPORTANCE_DEFAULT),
      )
    }
    val viewIntent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, mimeType)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val pendingIntent = PendingIntent.getActivity(
      reactContext,
      filename.hashCode(),
      viewIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = Notification.Builder(reactContext, channelId)
      .setContentTitle(filename)
      .setContentText("Download complete. Tap to open.")
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()
    manager.notify(filename.hashCode(), notification)
  }
}
