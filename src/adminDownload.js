// Report-file download — the approved simplification over the admin spec's
// Firebase JS SDK approach (§5.5): a plain authenticated-URL fetch via
// RNFS.downloadFile, the same mechanism App.js already uses to pull a
// worker's reference photo (see buildReferenceEmbedding). Saved under the
// app's own external files directory — writable on every supported Android
// version with no storage permission, unlike the public Downloads folder
// under modern scoped storage.
import RNFS from 'react-native-fs';

const REPORTS_DIR = `${RNFS.ExternalDirectoryPath}/reports`;

/** Downloads `fileUrl` to <app external files>/reports/<filename>, returning
 * the saved path. Throws on a non-2xx response or a network failure. */
export async function downloadReportFile(fileUrl, filename) {
  await RNFS.mkdir(REPORTS_DIR).catch(() => {});
  const dest = `${REPORTS_DIR}/${filename}`;
  const res = await RNFS.downloadFile({fromUrl: fileUrl, toFile: dest}).promise;
  if (!res || res.statusCode !== 200) {
    throw new Error('Download failed.');
  }
  return dest;
}
