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
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
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
 * This is the third approach for this one feature. The first used
 * android.app.DownloadManager to do the whole download itself; its HTTP
 * fetch never reliably completed against the report-file host (two rounds
 * of a bare "Download unsuccessful" with no real diagnostic, even after
 * adding an auth header it turned out not to need — the file lives in
 * Firebase Storage and is fetched with a plain, unauthenticated GET, same
 * as this app's existing photo download URLs; see upload.js). The second
 * moved the transfer to RNFS.downloadFile in JS, which then stalled
 * silently (a "download started" toast and then nothing — no success, no
 * error) with no timeout to fall back on. This version does the fetch
 * itself with a plain HttpURLConnection and explicit connect/read
 * timeouts, streaming the response straight into the destination — no
 * intermediate file, and a hang can no longer look like silent nothing.
 */
class SaveToDownloadsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "RNSaveFile"

  @ReactMethod
  fun downloadAndSave(url: String, filename: String, mimeType: String, promise: Promise) {
    Thread {
      var connection: HttpURLConnection? = null
      try {
        connection = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 30000
          readTimeout = 30000
          requestMethod = "GET"
        }
        connection.connect()
        val code = connection.responseCode
        if (code !in 200..299) {
          promise.reject("HTTP_ERROR", "The file host rejected the request (HTTP $code).")
          return@Thread
        }
        connection.inputStream.use { input ->
          val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(input, filename, mimeType)
          } else {
            saveLegacy(input, filename)
          }
          showCompletionNotification(filename, mimeType, uri)
          promise.resolve(uri.toString())
        }
      } catch (e: Exception) {
        promise.reject("DOWNLOAD_ERROR", e.message, e)
      } finally {
        connection?.disconnect()
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
    out.use { stream -> input.copyTo(stream) }
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
    FileOutputStream(dest).use { out -> input.copyTo(out) }
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
    try {
      manager.notify(filename.hashCode(), notification)
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS was denied — the file is still saved either way.
    }
  }
}
