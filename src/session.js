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
  return {
    code: `W${sup.ward_id}`,
    wardId: sup.ward_id,
    number: sup.ward_id,
    name: sup.ward_name || `Ward ${sup.ward_id}`,
    shortName: sup.ward_name || `Ward ${sup.ward_id}`,
    center: g.geo_lat != null && g.geo_long != null ? {lat: g.geo_lat, lng: g.geo_long} : null,
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

export async function submitAttendance(payload) {
  // payload: {workerId, shiftId, faceMatchScore, capturedPhotoUrl, lat, lng, distanceFromWard, inside}
  if (USE_BACKEND) {
    return api.markAttendance(payload);
  }
  return {message: 'Saved on device', local: true};
}

export async function submitLeave(payload) {
  if (USE_BACKEND) {
    return api.addLeave(payload);
  }
  return {message: 'Saved on device', local: true};
}

export async function submitWorker(payload) {
  if (USE_BACKEND) {
    return api.addWorker(payload);
  }
  return {message: 'Saved on device', local: true};
}

export async function submitProfile(payload) {
  // {email, fullName, phone, profilePhotoUrl}
  if (USE_BACKEND && isUploadConfigured()) {
    return api.completeProfile(payload);
  }
  return {message: 'Saved on device', local: true};
}
