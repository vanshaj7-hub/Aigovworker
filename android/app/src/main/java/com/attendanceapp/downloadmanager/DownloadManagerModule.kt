package com.attendanceapp.downloadmanager

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Thin wrapper over Android's own DownloadManager — used for admin report
 * downloads (Reports screen) instead of a plain RNFS fetch, specifically
 * because DownloadManager is the one mechanism that satisfies all three of
 * what was asked: the file lands in the real public Downloads folder (and
 * nowhere else — no app-private copy at all), Android shows its own
 * in-progress and "download complete, tap to open" notifications with zero
 * extra code, and this still works on API 29+ without WRITE_EXTERNAL_STORAGE
 * (DownloadManager writes to the public Downloads dir on the app's behalf;
 * that permission is declared maxSdkVersion 28 for the handful of older
 * devices this pilot might still see).
 */
class DownloadManagerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "RNDownloadManager"

  @ReactMethod
  fun download(url: String, filename: String, mimeType: String?, title: String?, promise: Promise) {
    try {
      val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val request = DownloadManager.Request(Uri.parse(url))
      request.setTitle(if (title.isNullOrEmpty()) filename else title)
      request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      if (!mimeType.isNullOrEmpty()) {
        request.setMimeType(mimeType)
      }
      request.setAllowedOverMetered(true)
      request.setAllowedOverRoaming(true)
      val id = manager.enqueue(request)
      promise.resolve(id.toString())
    } catch (e: Exception) {
      promise.reject("DOWNLOAD_ERROR", e.message, e)
    }
  }
}
