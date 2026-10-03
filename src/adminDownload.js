// Report-file download for the admin Reports screen. The backend hands back
// a Firebase Storage bucket object URL for a generated report — the same
// kind of public, token-authenticated download URL this app already uses
// for worker photos (see upload.js's downloadUrl()), fetchable with a plain
// GET and no credentials. The native module does the actual fetch and the
// save into the public Downloads folder in one step (downloadManager.js).
import {downloadToDownloads} from './downloadManager';

const MIME_BY_FORMAT = {csv: 'text/csv', pdf: 'application/pdf'};

/** Downloads `fileUrl` straight into the public Downloads folder under
 * `filename`. Throws with the real reason (the HTTP status the file host
 * returned, or the native save error) rather than leaving a failure a
 * mystery. */
export async function downloadReportFile(fileUrl, filename, format) {
  if (!fileUrl) {
    throw new Error('This report has no file to download yet.');
  }
  await downloadToDownloads({url: fileUrl, filename, mimeType: MIME_BY_FORMAT[format]});
}
