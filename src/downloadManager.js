// JS wrapper for the native RNSaveFile module (see
// android/.../savefile/SaveToDownloadsModule.kt). Android's own
// DownloadManager turned out not to reliably fetch these report files
// itself — two rounds of a bare "Download unsuccessful" with no real
// diagnostic, even after adding the backend's auth header — so the actual
// HTTP transfer now happens in JS via RNFS (see adminDownload.js), which
// had already proven it could fetch these exact files. This native module
// only does the part that still needs native APIs: writing the
// already-downloaded bytes into the public Downloads folder (via
// MediaStore on Android 10+, where a plain file path is otherwise blocked)
// and showing the "tap to open" completion notification.
import {NativeModules} from 'react-native';

const {RNSaveFile} = NativeModules;

/** Copies the already-downloaded file at `sourcePath` into the public
 * Downloads folder under `filename` and shows a completion notification
 * that opens it on tap. Resolves/rejects once the save itself finishes. */
export function saveToDownloads({sourcePath, filename, mimeType}) {
  if (!RNSaveFile) {
    return Promise.reject(new Error('Save-to-Downloads is not available on this build.'));
  }
  return RNSaveFile.save(sourcePath, filename, mimeType || 'application/octet-stream');
}
