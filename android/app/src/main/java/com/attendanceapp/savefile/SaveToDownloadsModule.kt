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
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Copies an already-downloaded file (fetched in JS via RNFS — see
 * adminDownload.js) into the public Downloads folder and shows a
 * completion notification that opens it on tap.
 *
 * This replaced a version that used android.app.DownloadManager to do the
 * whole download itself; DownloadManager's own HTTP fetch would not
 * reliably complete against the report-file host (two rounds of a bare
 * "Download unsuccessful" with no real diagnostic, even after adding the
 * right auth header), while RNFS had already proven it could fetch these
 * exact files — the very first version of this feature used it, and its
 * only bug was where it saved the result, not whether it could fetch it.
 * So the transfer happens in JS now, and this module only does the part
 * that needs native APIs: Android 10+'s scoped storage requires MediaStore
 * (not a plain file path) to put a new file in the public Downloads
 * folder, and a channel + PendingIntent to show our own notification
 * (DownloadManager showed its own for free; doing our own save means doing
 * our own notification too).
 */
class SaveToDownloadsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "RNSaveFile"

  @ReactMethod
  fun save(sourcePath: String, filename: String, mimeType: String, promise: Promise) {
    try {
      val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveViaMediaStore(sourcePath, filename, mimeType)
      } else {
        saveLegacy(sourcePath, filename)
      }
      showCompletionNotification(filename, mimeType, uri)
      promise.resolve(uri.toString())
    } catch (e: Exception) {
      promise.reject("SAVE_ERROR", e.message, e)
    }
  }

  /** Android 10+: a plain file path into the public Downloads folder is
   * blocked by scoped storage — MediaStore is the sanctioned way in. */
  private fun saveViaMediaStore(sourcePath: String, filename: String, mimeType: String): Uri {
    val resolver = reactContext.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, filename)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("Could not create a file in Downloads.")
    val out = resolver.openOutputStream(uri)
      ?: throw IllegalStateException("Could not open Downloads for writing.")
    out.use { stream -> FileInputStream(sourcePath).use { input -> input.copyTo(stream) } }
    values.clear()
    values.put(MediaStore.Downloads.IS_PENDING, 0)
    resolver.update(uri, values, null, null)
    return uri
  }

  /** Below Android 10: scoped storage doesn't apply — WRITE_EXTERNAL_STORAGE
   * (declared maxSdkVersion 28) lets a plain file path reach the public
   * Downloads folder directly. */
  private fun saveLegacy(sourcePath: String, filename: String): Uri {
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    dir.mkdirs()
    val dest = File(dir, filename)
    FileInputStream(sourcePath).use { input ->
      FileOutputStream(dest).use { out -> input.copyTo(out) }
    }
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
