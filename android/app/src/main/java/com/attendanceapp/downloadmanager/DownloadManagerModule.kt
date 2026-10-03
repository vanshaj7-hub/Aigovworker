package com.attendanceapp.downloadmanager

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

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
 *
 * Also tracks the IDs it enqueues and listens for the system's
 * ACTION_DOWNLOAD_COMPLETE broadcast, emitting the real outcome (success or
 * the DownloadManager/HTTP failure reason) back to JS — the OS notification
 * alone only ever says "Download unsuccessful" with no detail.
 */
class DownloadManagerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val pendingIds = mutableSetOf<Long>()

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
      if (id == -1L || !pendingIds.remove(id)) {
        return
      }
      val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
        if (!cursor.moveToFirst()) {
          return@use
        }
        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
        val params = Arguments.createMap()
        params.putDouble("id", id.toDouble())
        params.putBoolean("successful", status == DownloadManager.STATUS_SUCCESSFUL)
        params.putInt("reason", reason)
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("RNDownloadManagerComplete", params)
      }
    }
  }

  init {
    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(receiver, filter)
    }
  }

  override fun getName() = "RNDownloadManager"

  override fun invalidate() {
    super.invalidate()
    try {
      reactContext.unregisterReceiver(receiver)
    } catch (e: IllegalArgumentException) {
      // Already unregistered (e.g. bridge torn down before onReceive ran) — fine.
    }
  }

  @ReactMethod
  fun download(url: String, filename: String, mimeType: String?, title: String?, headers: ReadableMap?, promise: Promise) {
    try {
      val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val request = DownloadManager.Request(Uri.parse(url))
      request.setTitle(if (title.isNullOrEmpty()) filename else title)
      request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      if (!mimeType.isNullOrEmpty()) {
        request.setMimeType(mimeType)
      }
      headers?.let { map ->
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
          val key = iterator.nextKey()
          val value = map.getString(key)
          if (value != null) {
            request.addRequestHeader(key, value)
          }
        }
      }
      request.setAllowedOverMetered(true)
      request.setAllowedOverRoaming(true)
      val id = manager.enqueue(request)
      pendingIds.add(id)
      promise.resolve(id.toString())
    } catch (e: Exception) {
      promise.reject("DOWNLOAD_ERROR", e.message, e)
    }
  }
}
