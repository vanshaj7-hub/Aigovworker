// Report-file download for the admin Reports screen. Android's own
// DownloadManager turned out not to reliably fetch these report files
// itself — two rounds of a bare "Download unsuccessful" with no real
// diagnostic, even after adding the backend's own auth header to the
// request. RNFS already proved it *can* fetch these exact files: it did
// the transfer in the very first version of this feature, and the only bug
// back then was where it saved the result (an app-private folder instead
// of Downloads). So the transfer happens here, in JS, with RNFS — and only
// the final "put it in the public Downloads folder and show a completion
// notification" step is native (saveToDownloads, downloadManager.js).
import RNFS from 'react-native-fs';
import {API_BASE, AUTH_HEADER, AUTH_VALUE} from './config';
import {isSameHost} from './domain/adminReports';
import {saveToDownloads} from './downloadManager';

const MIME_BY_FORMAT = {csv: 'text/csv', pdf: 'application/pdf'};

// The generate-report call itself (api.js's attendanceReport) already needs
// AUTH_HEADER/AUTH_VALUE, because the backend rejects every route without
// it (see config.js) — attach the same credential to the file fetch, but
// only when the file is actually served from our own backend host: a
// signed storage URL (Firebase/GCS) carries its own auth in the query
// string, and an unrelated header there can invalidate the signature
// instead of helping.
function authHeadersFor(fileUrl) {
  if (!AUTH_HEADER || !AUTH_VALUE || !isSameHost(fileUrl, API_BASE)) {
    return undefined;
  }
  return {[AUTH_HEADER]: AUTH_VALUE};
}

/** Downloads `fileUrl` to a private temp file, then hands it to the native
 * module to copy into the public Downloads folder and show the completion
 * notification. Throws with the real reason (the HTTP status the file host
 * returned, or the native save error) rather than leaving a failure a
 * mystery. */
export async function downloadReportFile(fileUrl, filename, format) {
  if (!fileUrl) {
    throw new Error('This report has no file to download yet.');
  }
  const tempPath = `${RNFS.CachesDirectoryPath}/report_${Date.now()}_${filename}`;
  try {
    const {statusCode} = await RNFS.downloadFile({
      fromUrl: fileUrl,
      toFile: tempPath,
      headers: authHeadersFor(fileUrl),
    }).promise;
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`The file host rejected the request (HTTP ${statusCode}).`);
    }
    await saveToDownloads({sourcePath: tempPath, filename, mimeType: MIME_BY_FORMAT[format]});
  } finally {
    RNFS.unlink(tempPath).catch(() => {});
  }
}
