// Everything that changes between environments lives here.

export const API_BASE = 'https://ats-backend-test-821100264159.asia-south1.run.app';

/**
 * The test backend rejects every route except "/" with
 * 403 {"detail":"Could not validate credentials"}, so a credential is required
 * even for /login. Put it here once the backend team supplies it.
 *
 * Set AUTH_HEADER to the header name they use (for example 'Authorization' or
 * 'X-API-Key') and AUTH_VALUE to the value (for example 'Bearer <key>').
 */
export const AUTH_HEADER = 'X-access-token';
export const AUTH_VALUE = 'ats-secret-api-key';

/**
 * Firebase Storage bucket, e.g. "my-project.appspot.com". Photos are uploaded
 * straight to the Storage REST API and the returned download URL is what the
 * attendance endpoints receive. Leave null and the app will say plainly that
 * uploads are not configured rather than failing in an obscure way.
 */
export const FIREBASE_BUCKET = null;

/** Folders inside the bucket. */
export const STORAGE_PATHS = {
  profile: 'supervisors/profile',
  workerReference: 'workers/reference',
  attendance: 'attendance/captures',
};

/**
 * Master switch. While false the app runs entirely on the device, which is how
 * it is being demonstrated today. Turn it on once AUTH_HEADER and
 * FIREBASE_BUCKET are filled in.
 */
export const USE_BACKEND = true;

export const isBackendConfigured = () => !!(AUTH_HEADER && AUTH_VALUE);
export const isUploadConfigured = () => !!FIREBASE_BUCKET;
