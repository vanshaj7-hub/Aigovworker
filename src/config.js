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
 * Firebase Storage bucket. Photos are uploaded straight to the Storage REST API
 * and the returned download URL is what the attendance endpoints receive. Leave
 * null and the app will say plainly that uploads are not configured rather than
 * failing in an obscure way.
 *
 * This is the bucket host, not the gs:// URL: gs://<bucket> → <bucket>.
 */
export const FIREBASE_BUCKET = 'project-331083a5-d3a3-42fa-ab2.firebasestorage.app';

/**
 * Every image lives in this one folder inside the bucket. The object name inside
 * it is built dynamically as  SupervisorID_WardID_workerID_datetime  (see
 * upload.js), so a single flat folder stays self-describing.
 */
export const STORAGE_FOLDER = 'test-app';

/**
 * Master switch. While false the app runs entirely on the device, which is how
 * it is being demonstrated today. Turn it on once AUTH_HEADER and
 * FIREBASE_BUCKET are filled in.
 */
export const USE_BACKEND = true;

export const isBackendConfigured = () => !!(AUTH_HEADER && AUTH_VALUE);
export const isUploadConfigured = () => !!FIREBASE_BUCKET;
