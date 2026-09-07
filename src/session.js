// High-level operations the screens call. Each one talks to the live backend
// when USE_BACKEND is on and a photo dependency is not blocking, and otherwise
// falls back to the on-device path so the app stays demonstrable.
//
// Photo-upload-dependent writes (complete-profile, add-worker) additionally
// need a Firebase bucket; until FIREBASE_BUCKET is set they are handled locally
// and flagged, rather than failing.
import {USE_BACKEND, isUploadConfigured} from './config';
import * as api from './api';
import * as local from './storage';
import {parseWardPolygon, polygonCentroid} from './domain/geo';
import {
  uploadProfilePhoto,
  uploadWorkerReference,
  uploadAttendancePhoto,
} from './upload';

export const backendOn = () => USE_BACKEND;

/* ------------------------------------------------------------------- auth */

/**
 * Returns a unified session:
 *   {email, supervisorId, fullName, mustResetPassword, profileCompleted, source}
 * or {ok:false, reason} on failure.
 */
export async function authenticate(email, password) {
  if (USE_BACKEND) {
    try {
      const r = await api.login(email, password);
      const session = {
        email: r.email || String(email).trim(),
        supervisorId: r.user_id,
        fullName: r.full_name || '',
        mustResetPassword: r.must_reset_password === 1 || r.must_reset_password === true,
        profileCompleted: r.profile_completed === 1 || r.profile_completed === true,
        passwordPromptDone: false,
        source: 'backend',
      };
      await local.saveSession(session);
      return {ok: true, session};
    } catch (err) {
      // 401 is a real credential failure; anything else is a connection problem
      // the caller should hear about rather than silently dropping to local.
      if (err.status === 401 || err.status === 403) {
        return {ok: false, reason: 'badCredentials', message: err.message};
      }
      return {ok: false, reason: 'network', message: err.message};
    }
  }
  // Local fallback (demo).
  const res = await local.signIn(email, password);
  if (!res.ok) {
    return {ok: false, reason: res.reason === 'noAccount' ? 'noAccount' : 'badCredentials'};
  }
  return {
    ok: true,
    session: {...res.session, profileCompleted: undefined, source: 'local'},
  };
}

export async function changeAccountPassword(email, oldPassword, newPassword) {
  if (USE_BACKEND) {
    try {
      await api.updatePassword({email, oldPassword, newPassword, updatedBy: email});
      await local.markPasswordChanged();
      return {ok: true};
    } catch (err) {
      if (err.status === 400 || err.status === 401) {
        // The backend returns its own wording, e.g. "The old password is not correct."
        return {ok: false, reason: 'badOldPassword', message: err.message};
      }
      return {ok: false, reason: 'network', message: err.message};
    }
  }
  return local.changePassword(email, oldPassword, newPassword);
}

/* -------------------------------------------------------------- workspace */

const wardFromHome = home => {
  const sup = home.supervisor || {};
  const g = sup.geofencing_data || {};
  // The identifier is `ward_code` in the current API (was `ward_id`).
  const wardId = sup.ward_code != null ? sup.ward_code : sup.ward_id;
  // New format: a polygon boundary. Older format: a centre point + radius.
  const polygon = parseWardPolygon(g.coordinates);
  const center = polygon
    ? polygonCentroid(polygon)
    : g.geo_lat != null && g.geo_long != null
    ? {lat: g.geo_lat, lng: g.geo_long}
    : null;
  return {
    code: `W${wardId}`,
    wardId,
    number: wardId,
    name: sup.ward_name || `Ward ${wardId}`,
    shortName: sup.ward_name || `Ward ${wardId}`,
    polygon,
    center,
    radiusM: g.radius_meters || 100,
    fromBackend: true,
  };
};

/**
 * Loads the shift, the ward (with its real geo-fence) and the day's counts.
 * The ward it returns drives the location gate and every fence check.
 */
export async function loadWorkspace(supervisorId) {
  if (USE_BACKEND) {
    const shift = await api.activeShift(); // may be null out of hours
    const shiftId = shift ? shift.shift_id : 1;
    const home = await api.supervisorHome(supervisorId, shiftId);
    return {
      source: 'backend',
      shift,
      shiftId,
      ward: wardFromHome(home),
      counts: home.attendance || null,
    };
  }
  const ward = await local.getWard();
  return {source: 'local', shift: null, shiftId: local.currentShiftId(), ward, counts: null};
}

/** Ward workers for a shift, mapped into the app's worker shape. */
export async function loadWorkers(supervisorId, shiftId) {
  if (USE_BACKEND) {
    const list = await api.supervisorWorkers(supervisorId, shiftId);
    return list.map(w => ({
      id: String(w.worker_id),
      workerId: w.worker_id,
      code: `#${w.worker_id}`,
      name: w.full_name,
      designation: w.designation || 'Worker',
      photoUri: w.face_reference_photo_url || null,
      referenceUrl: w.face_reference_photo_url || null,
      attendanceStatus: w.attendance_status, // present | pending | on_leave
      embedding: null, // built on device from referenceUrl when marking
      fromBackend: true,
    }));
  }
  return local.getWorkers();
}

export async function loadLeaveWorkers(supervisorId, shiftId) {
  if (USE_BACKEND) {
    const list = await api.supervisorWorkers(supervisorId, shiftId, {forLeave: true});
    return list.map(w => ({
      id: String(w.worker_id),
      workerId: w.worker_id,
      code: `#${w.worker_id}`,
      name: w.full_name,
      designation: w.designation || 'Worker',
    }));
  }
  return local.getWorkers();
}

/* ----------------------------------------------------------------- writes */
//
// Each write that carries a photo first uploads the local image to Firebase
// Storage (folder "test-app", name SupervisorID_WardID_workerID_datetime) and
// then sends the returned download URL to the backend. These never throw: they
// return {ok, photoUrl?, message?, skipped?} so the caller can mirror to the
// backend as a best-effort step without breaking the on-device flow.

/**
 * Marks attendance for a known worker. The captured face is uploaded first; if
 * that fails the attendance is still recorded with a null photo rather than lost.
 * payload: {supervisorId, wardId, workerId, photoUri, shiftId, faceMatchScore,
 *           lat, lng, distanceFromWard, inside}
 */
export async function submitAttendance({supervisorId, wardId, workerId, photoUri, ...rest}) {
  if (!USE_BACKEND) {
    return {ok: false, skipped: true, message: 'Saved on device'};
  }
  try {
    let capturedPhotoUrl = null;
    if (photoUri && isUploadConfigured()) {
      try {
        capturedPhotoUrl = await uploadAttendancePhoto(photoUri, {supervisorId, wardId, workerId});
      } catch (e) {
        capturedPhotoUrl = null; // photo is optional for attendance
      }
    }
    const res = await api.markAttendance({workerId, capturedPhotoUrl, ...rest});
    return {ok: true, photoUrl: capturedPhotoUrl, res};
  } catch (err) {
    return {ok: false, error: err, message: err.message};
  }
}

export async function submitLeave(payload) {
  if (!USE_BACKEND) {
    return {ok: false, skipped: true, message: 'Saved on device'};
  }
  try {
    const res = await api.addLeave(payload);
    return {ok: true, res};
  } catch (err) {
    return {ok: false, error: err, message: err.message};
  }
}

/**
 * Adds a worker. The reference face is uploaded to Firebase first and its URL is
 * sent as face_reference_photo_url.
 * payload: {supervisorId, wardId, fullName, relationName, relation, phone,
 *           gender, designation, dateOfBirth, photoUri}
 */
export async function submitWorker({supervisorId, wardId, photoUri, ...fields}) {
  if (!USE_BACKEND) {
    return {ok: false, skipped: true, message: 'Saved on device'};
  }
  if (!isUploadConfigured()) {
    return {ok: false, skipped: true, reason: 'uploadNotConfigured'};
  }
  try {
    let faceReferencePhotoUrl = null;
    if (photoUri) {
      faceReferencePhotoUrl = await uploadWorkerReference(photoUri, {supervisorId, wardId});
    }
    const res = await api.addWorker({...fields, supervisorId, wardId, faceReferencePhotoUrl});
    return {ok: true, photoUrl: faceReferencePhotoUrl, res};
  } catch (err) {
    return {ok: false, error: err, message: err.message};
  }
}

/**
 * Completes the supervisor's own profile. The profile photo is uploaded to
 * Firebase first and its URL is sent as profile_photo_url.
 * payload: {supervisorId, wardId, email, fullName, phone, photoUri}
 */
export async function submitProfile({supervisorId, wardId, photoUri, ...fields}) {
  if (!USE_BACKEND) {
    return {ok: false, skipped: true, message: 'Saved on device'};
  }
  if (!isUploadConfigured()) {
    return {ok: false, skipped: true, reason: 'uploadNotConfigured'};
  }
  try {
    let profilePhotoUrl = null;
    if (photoUri) {
      profilePhotoUrl = await uploadProfilePhoto(photoUri, {supervisorId, wardId});
    }
    const res = await api.completeProfile({...fields, profilePhotoUrl});
    return {ok: true, photoUrl: profilePhotoUrl, res};
  } catch (err) {
    return {ok: false, error: err, message: err.message};
  }
}
