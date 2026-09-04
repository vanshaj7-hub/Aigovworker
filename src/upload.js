import {FIREBASE_BUCKET, STORAGE_FOLDER, isUploadConfigured} from './config';

/**
 * Uploads a local image to Firebase Storage and returns its public download URL,
 * which is what the backend endpoints expect in their *_photo_url fields.
 *
 * This talks to the Storage REST API directly rather than through the native
 * Firebase SDK. That keeps google-services.json and the Firebase gradle plugin
 * out of the build — nothing here can break the Android build if the project is
 * not configured yet — and it needs only the bucket name.
 *
 * Every object goes into the single STORAGE_FOLDER ("test-app") and is named
 *     SupervisorID_WardID_workerID_datetime.<ext>
 * so a file is identifiable from its name alone. The worker slot carries "self"
 * for a supervisor's own profile photo and "new" for a worker being added who
 * does not have an id yet.
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

const contentTypeOf = ext =>
  ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

/** Keeps an id usable inside a filename: letters, digits and single dashes. */
const safe = v =>
  String(v == null ? '' : v)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'na';

/** Compact, sortable local timestamp: 20260904-143512-880. */
function timestamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
    `-${p(d.getMilliseconds(), 3)}`
  );
}

/** Builds  test-app/SupervisorID_WardID_workerID_datetime.ext */
function objectPath({supervisorId, wardId, workerId}, ext) {
  const name =
    `${safe(supervisorId)}_${safe(wardId)}_${safe(workerId)}_${timestamp()}.${ext}`;
  return `${STORAGE_FOLDER}/${name}`;
}

/** Turns the returned metadata into the long-lived public download URL. */
function downloadUrl(bucket, path, meta) {
  const token =
    meta && meta.downloadTokens ? String(meta.downloadTokens).split(',')[0] : null;
  const encoded = encodeURIComponent(path);
  return token
    ? `${HOST}/${bucket}/o/${encoded}?alt=media&token=${token}`
    : `${HOST}/${bucket}/o/${encoded}?alt=media`;
}

/**
 * @param localUri  file:// or content:// URI on the device
 * @param ids       {supervisorId, wardId, workerId} — drives the object name
 * @returns the download URL
 */
export async function uploadImage(localUri, ids) {
  if (!isUploadConfigured()) {
    throw new UploadError('UPLOAD_NOT_CONFIGURED');
  }
  if (!localUri) {
    throw new UploadError('NO_FILE');
  }

  const ext = extensionOf(localUri);
  const path = objectPath(ids || {}, ext);

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

/** Supervisor's own profile photo — no worker, so the worker slot is "self". */
export const uploadProfilePhoto = (uri, {supervisorId, wardId}) =>
  uploadImage(uri, {supervisorId, wardId, workerId: 'self'});

/** A worker's reference face. Before the backend assigns an id the slot is "new". */
export const uploadWorkerReference = (uri, {supervisorId, wardId, workerId}) =>
  uploadImage(uri, {supervisorId, wardId, workerId: workerId || 'new'});

/** A face captured while marking attendance for a known worker. */
export const uploadAttendancePhoto = (uri, {supervisorId, wardId, workerId}) =>
  uploadImage(uri, {supervisorId, wardId, workerId});

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
