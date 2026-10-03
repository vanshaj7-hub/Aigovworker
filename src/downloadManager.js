// JS wrapper for the native RNDownloadManager module (see
// android/.../downloadmanager/DownloadManagerModule.kt) — Android's own
// DownloadManager, not a JS-side file fetch: it deposits the file in the
// public Downloads folder (and nowhere else), and Android shows its own
// in-progress and "download complete, tap to open" notifications with no
// extra code on this side.
import {NativeModules} from 'react-native';

const {RNDownloadManager} = NativeModules;

/** Enqueues a download; resolves once Android has accepted the request (not
 * once the download finishes — that's reported via the OS notification). */
export function enqueueDownload({url, filename, mimeType, title}) {
  if (!RNDownloadManager) {
    return Promise.reject(new Error('Download manager is not available on this build.'));
  }
  return RNDownloadManager.download(url, filename, mimeType || null, title || filename);
}
