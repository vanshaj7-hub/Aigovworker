// Report-file download — the approved simplification over the admin spec's
// Firebase JS SDK approach (§5.5): a plain authenticated-URL fetch via
// RNFS.downloadFile, the same mechanism App.js already uses to pull a
// worker's reference photo (see buildReferenceEmbedding).
//
// The file is fetched to a private cache path and then handed to the native
// share sheet (react-native-share) rather than just saved silently: a plain
// RNFS save has nowhere a user can actually find it without a file manager
// (the public Downloads folder needs MediaStore/scoped-storage handling
// RNFS doesn't do), so "download" with no visible result read as broken.
// The share sheet is itself the confirmation — the user picks "Save to
// device", a PDF/Excel viewer, Drive, etc.
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

const REPORTS_DIR = `${RNFS.CachesDirectoryPath}/reports`;

/** Downloads `fileUrl` and opens the native share sheet on it. Throws with a
 * clear message on a missing URL, a non-2xx response, or a network failure;
 * the user dismissing the share sheet itself is not an error. */
export async function downloadReportFile(fileUrl, filename) {
  if (!fileUrl) {
    throw new Error('This report has no file to download yet.');
  }
  await RNFS.mkdir(REPORTS_DIR).catch(() => {});
  const dest = `${REPORTS_DIR}/${filename}`;
  const res = await RNFS.downloadFile({fromUrl: fileUrl, toFile: dest}).promise;
  if (!res || res.statusCode !== 200) {
    throw new Error(`Download failed${res ? ` (${res.statusCode})` : ''}.`);
  }
  await Share.open({url: `file://${dest}`, filename, failOnCancel: false});
  return dest;
}
