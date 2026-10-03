// JS wrapper for the native RNDownloadManager module (see
// android/.../downloadmanager/DownloadManagerModule.kt) — Android's own
// DownloadManager, not a JS-side file fetch: it deposits the file in the
// public Downloads folder (and nowhere else), and Android shows its own
// in-progress and "download complete, tap to open" notifications with no
// extra code on this side.
import {DeviceEventEmitter, NativeModules} from 'react-native';

const {RNDownloadManager} = NativeModules;

/** Enqueues a download; resolves once Android has accepted the request (not
 * once the download finishes — that's reported via the OS notification, and
 * via `addDownloadCompleteListener` below). `headers` (optional) are sent
 * with the download request, e.g. for a file host that needs the same
 * credential as the rest of the API. */
export function enqueueDownload({url, filename, mimeType, title, headers}) {
  if (!RNDownloadManager) {
    return Promise.reject(new Error('Download manager is not available on this build.'));
  }
  return RNDownloadManager.download(url, filename, mimeType || null, title || filename, headers || null);
}

/** Fires once a download this module enqueued finishes, success or failure,
 * as `{id, successful, reason}` — `reason` is a DownloadManager ERROR_*
 * constant (>=1000) when Android itself gave up, or the raw HTTP status code
 * the file host returned (<1000) otherwise. The OS notification alone only
 * ever says "Download unsuccessful" with no detail, so this is how the app
 * finds out *why*. Returns a subscription with a `.remove()` method. */
export function addDownloadCompleteListener(callback) {
  return DeviceEventEmitter.addListener('RNDownloadManagerComplete', callback);
}
