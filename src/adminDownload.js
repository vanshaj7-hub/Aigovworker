// Report-file download for the admin Reports screen — enqueues the file with
// Android's own DownloadManager (see downloadManager.js / the native
// RNDownloadManager module) instead of a plain RNFS fetch: the brief asked
// for the file to land in the public Downloads folder and nowhere else,
// plus a start toast and a system "download complete, tap to open"
// notification — DownloadManager is the one mechanism Android itself
// provides that does all of that without extra code.
import {enqueueDownload} from './downloadManager';

const MIME_BY_FORMAT = {csv: 'text/csv', pdf: 'application/pdf'};

/** Enqueues `fileUrl` for download under `filename`. Resolves once Android
 * has accepted the request — the download itself finishes in the
 * background, reported via the OS notification, not this promise. */
export async function downloadReportFile(fileUrl, filename, format) {
  if (!fileUrl) {
    throw new Error('This report has no file to download yet.');
  }
  await enqueueDownload({url: fileUrl, filename, mimeType: MIME_BY_FORMAT[format], title: filename});
}
