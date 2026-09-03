import {FIREBASE_BUCKET, STORAGE_PATHS, isUploadConfigured} from './config';

/**
 * Uploads a local image to Firebase Storage and returns its public download URL,
 * which is what the attendance endpoints expect in their *_photo_url fields.
 *
 * This talks to the Storage REST API directly rather than through the native
 * Firebase SDK. That keeps google-services.json and the Firebase gradle plugin
 * out of the build — nothing here can break the Android build if the project is
 * not configured yet — and it needs only the bucket name.
 *
 * Storage rules must allow the write. For the test environment that means
 * something permissive; before production this should move behind Firebase Auth
 * or a signed upload URL issued by the backend.
 */

const HOST = 'https://firebasestorage.googleapis.com/v0/b';

export class UploadError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'UploadError';
    this.cause = cause;
  }
}

const extensionOf = uri => {
  const clean = String(uri).split('?')[0];
  const dot = clean.lastIndexOf('.');
  const ext = dot > -1 ? clean.slice(dot + 1).toLowerCase() : '';
  return /^(jpg|jpeg|png|webp)$/.test(ext) ? ext : 'jpg';
};

const contentTypeOf = ext => (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

function objectPath(folder, uri) {
  const ext = extensionOf(uri);
  const stamp = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `${folder}/${stamp}_${rand}.${ext}`;
}

/** Turns the returned metadata into the long-lived public download URL. */
function downloadUrl(bucket, path, meta) {
  const token = meta && meta.downloadTokens ? String(meta.downloadTokens).split(',')[0] : null;
  const encoded = encodeURIComponent(path);
  return token
    ? `${HOST}/${bucket}/o/${encoded}?alt=media&token=${token}`
    : `${HOST}/${bucket}/o/${encoded}?alt=media`;
}

/**
 * @param localUri  file:// or content:// URI on the device
 * @param folder    one of STORAGE_PATHS
 * @returns the download URL
 */
export async function uploadImage(localUri, folder) {
  if (!isUploadConfigured()) {
    throw new UploadError('UPLOAD_NOT_CONFIGURED');
  }
  if (!localUri) {
    throw new UploadError('NO_FILE');
  }

  const path = objectPath(folder, localUri);
  const ext = extensionOf(localUri);

  // React Native can read a local file straight into a Blob.
  let blob;
  try {
    const fileRes = await fetch(localUri);
    blob = await fileRes.blob();
  } catch (err) {
    throw new UploadError('READ_FAILED', err);
  }

  const url = `${HOST}/${FIREBASE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': blob.type || contentTypeOf(ext)},
      body: blob,
    });
  } catch (err) {
    throw new UploadError('NETWORK', err);
  } finally {
    if (blob && typeof blob.close === 'function') {
      blob.close();
    }
  }

  const text = await res.text();
  let meta = null;
  try {
    meta = text ? JSON.parse(text) : null;
  } catch (e) {
    meta = null;
  }
  if (!res.ok) {
    const detail = (meta && meta.error && meta.error.message) || `HTTP ${res.status}`;
    throw new UploadError(detail, meta);
  }
  return downloadUrl(FIREBASE_BUCKET, path, meta);
}

export const uploadProfilePhoto = uri => uploadImage(uri, STORAGE_PATHS.profile);
export const uploadWorkerReference = uri => uploadImage(uri, STORAGE_PATHS.workerReference);
export const uploadAttendancePhoto = uri => uploadImage(uri, STORAGE_PATHS.attendance);

/** Human-readable reason, for showing in the interface. */
export function uploadErrorMessage(err, tr) {
  const code = err && err.message;
  if (code === 'UPLOAD_NOT_CONFIGURED') {
    return tr ? tr('uploadNotConfigured') : 'Photo upload is not configured yet.';
  }
  if (code === 'NETWORK') {
    return tr ? tr('uploadNetwork') : 'The photo could not be uploaded. Check the connection.';
  }
  if (code === 'READ_FAILED' || code === 'NO_FILE') {
    return tr ? tr('uploadReadFailed') : 'That photo could not be read from the device.';
  }
  return tr ? `${tr('uploadFailed')} ${code || ''}`.trim() : `Upload failed. ${code || ''}`.trim();
}
