// JS wrapper for the native RNSaveFile module (see
// android/.../savefile/SaveToDownloadsModule.kt). The module does the whole
// job itself — fetching the report straight from its storage-bucket URL
// and saving it into the public Downloads folder — rather than JS handing
// it an already-downloaded file. An earlier version did the fetch in JS via
// RNFS, which turned out to stall silently against this host with no
// timeout to recover from (a "download started" toast and then nothing);
// the native fetch below has explicit connect/read timeouts so a stall can
// no longer look like silent nothing.
import {NativeModules} from 'react-native';

const {RNSaveFile} = NativeModules;

/** Downloads `url` straight to the public Downloads folder under `filename`
 * and shows a completion notification that opens it on tap. Resolves/
 * rejects once the whole download + save finishes. */
export function downloadToDownloads({url, filename, mimeType}) {
  if (!RNSaveFile) {
    return Promise.reject(new Error('Save-to-Downloads is not available on this build.'));
  }
  return RNSaveFile.downloadAndSave(url, filename, mimeType || 'application/octet-stream');
}
