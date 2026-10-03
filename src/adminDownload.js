// Report-file download for the admin Reports screen — enqueues the file with
// Android's own DownloadManager (see downloadManager.js / the native
// RNDownloadManager module) instead of a plain RNFS fetch: the brief asked
// for the file to land in the public Downloads folder and nowhere else,
// plus a start toast and a system "download complete, tap to open"
// notification — DownloadManager is the one mechanism Android itself
// provides that does all of that without extra code.
import {API_BASE, AUTH_HEADER, AUTH_VALUE} from './config';
import {isSameHost} from './domain/adminReports';
import {enqueueDownload} from './downloadManager';

const MIME_BY_FORMAT = {csv: 'text/csv', pdf: 'application/pdf'};

// The generate-report call itself (api.js's attendanceReport) already needs
// AUTH_HEADER/AUTH_VALUE, because the backend rejects every route without it
// (see config.js). DownloadManager, unlike fetch(), sends no headers at all
// unless told to, and a GET without this header is exactly the kind of
// request this backend 403s — which is what showed up as the OS's generic
// "Download unsuccessful" notification. Attach the same credential, but only
// when the file is actually served from our own backend host: a signed
// storage URL (Firebase/GCS) carries its own auth in the query string, and
// an unrelated header there can invalidate the signature instead of helping.
function authHeadersFor(fileUrl) {
  if (!AUTH_HEADER || !AUTH_VALUE || !isSameHost(fileUrl, API_BASE)) {
    return null;
  }
  return {[AUTH_HEADER]: AUTH_VALUE};
}

/** Enqueues `fileUrl` for download under `filename`. Resolves once Android
 * has accepted the request — the download itself finishes in the
 * background; listen with `addDownloadCompleteListener` (downloadManager.js)
 * for the real success/failure outcome. */
export async function downloadReportFile(fileUrl, filename, format) {
  if (!fileUrl) {
    throw new Error('This report has no file to download yet.');
  }
  await enqueueDownload({
    url: fileUrl,
    filename,
    mimeType: MIME_BY_FORMAT[format],
    title: filename,
    headers: authHeadersFor(fileUrl),
  });
}

export {addDownloadCompleteListener} from './downloadManager';
export {describeDownloadFailure} from './domain/adminReports';
