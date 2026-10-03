// JS wrapper for the native RNSaveFile module (see
// android/.../savefile/SaveToDownloadsModule.kt). The module does the whole
// job itself — fetching the report straight from its storage-bucket URL
// and saving it into the public Downloads folder — rather than JS handing
// it an already-downloaded file. It also emits a log line at every step
// (RNSaveFileLog) which this file forwards into debugLog.js, since repeated
// silent failures with no way to see what actually happened on the device
// made guessing at fixes unreliable — the "Export logs" button on the
// Reports screen lets whoever is testing send back exactly what happened.
import {DeviceEventEmitter, NativeModules} from 'react-native';
import {logEvent} from './debugLog';

const {RNSaveFile} = NativeModules;

DeviceEventEmitter.addListener('RNSaveFileLog', e => {
  logEvent('native', (e && e.message) || '');
});

/** Downloads `url` straight to the public Downloads folder under `filename`
 * and shows a completion notification that opens it on tap. Resolves/
 * rejects once the whole download + save finishes. */
export function downloadToDownloads({url, filename, mimeType}) {
  if (!RNSaveFile) {
    logEvent('js', 'RNSaveFile native module is not present on this build');
    return Promise.reject(new Error('Save-to-Downloads is not available on this build.'));
  }
  return RNSaveFile.downloadAndSave(url, filename, mimeType || 'application/octet-stream');
}
