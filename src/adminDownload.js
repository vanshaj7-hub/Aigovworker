// Report-file download for the admin Reports screen. The backend's file_url
// is a raw GCS object URL (storage.googleapis.com/<bucket>/<path>) — gated
// by the bucket's IAM, which denies an anonymous read (confirmed directly:
// a plain GET to it returns HTTP 403). The web dashboard never fetches that
// URL either; it goes through the Firebase Storage SDK instead, which talks
// to a different host (firebasestorage.googleapis.com) gated by this
// project's Storage Rules, not bucket IAM. toFirebaseDownloadUrl converts
// one into the other — same object, no credentials needed, just the right
// URL. The native module then does the actual fetch and the save into the
// public Downloads folder in one step (downloadManager.js).
import {logEvent, redactUrl} from './debugLog';
import {toFirebaseDownloadUrl} from './domain/adminReports';
import {downloadToDownloads} from './downloadManager';

const MIME_BY_FORMAT = {csv: 'text/csv', pdf: 'application/pdf'};

/** Downloads `fileUrl` straight into the public Downloads folder under
 * `filename`. Throws with the real reason (the HTTP status the file host
 * returned, or the native save error) rather than leaving a failure a
 * mystery. */
export async function downloadReportFile(fileUrl, filename, format) {
  if (!fileUrl) {
    logEvent('js', 'downloadReportFile called with no fileUrl');
    throw new Error('This report has no file to download yet.');
  }
  const effectiveUrl = toFirebaseDownloadUrl(fileUrl) || fileUrl;
  logEvent('js', 'downloadReportFile: starting', {
    original: redactUrl(fileUrl),
    effective: redactUrl(effectiveUrl),
    filename,
    format,
  });
  try {
    const result = await downloadToDownloads({url: effectiveUrl, filename, mimeType: MIME_BY_FORMAT[format]});
    logEvent('js', 'downloadReportFile: resolved', {result});
  } catch (err) {
    logEvent('js', 'downloadReportFile: rejected', {message: err && err.message});
    throw err;
  }
}
