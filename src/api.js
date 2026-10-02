import {sha3_512} from 'js-sha3';
import {API_BASE, AUTH_HEADER, AUTH_VALUE} from './config';

/** The backend expects SHA3-512, 128 lowercase hex characters. */
export const hashPassword = plain => sha3_512(String(plain));

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const TIMEOUT = 20000;

async function post(path, payload) {
  const headers = {'Content-Type': 'application/json', Accept: 'application/json'};
  if (AUTH_HEADER && AUTH_VALUE) {
    headers[AUTH_HEADER] = AUTH_VALUE;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ApiError('No response from the server. Check the connection.', 0, null);
  }
  clearTimeout(timer);

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = {raw: text};
  }

  if (!res.ok) {
    // The backend puts its own wording in `detail` or `message`; show that
    // rather than inventing our own text.
    const detail =
      (body && (body.detail || body.message)) ||
      `Request failed (${res.status}).`;
    throw new ApiError(String(detail), res.status, body);
  }
  return body;
}

/* ------------------------------------------------------------------ 1 login */
export const login = (email, password) =>
  post('/login', {
    email: String(email).trim(),
    role: 'Supervisor',
    password_hash: hashPassword(password),
  });

/* -------------------------------------------------------- admin (DH/CSI/SI) */
//
// Shares /login and /update-password with the supervisor flow, but the admin
// request shapes differ (no `role` field sent on login — the backend returns
// whichever role the account actually has) per the admin app spec. These are
// kept entirely separate from the supervisor functions above rather than
// parameterizing them, so the supervisor login path can never be affected by
// a change made here.

export const adminLogin = (email, password) =>
  post('/login', {
    email: String(email).trim(),
    password_hash: hashPassword(password),
  });

/**
 * `role` must be the exact raw backend role string from the login response
 * (e.g. "Zonal In-Charge"), not the app's internal normalized id — the
 * backend expects it back verbatim.
 */
export const adminUpdatePassword = ({email, role, oldPassword, newPassword, updatedBy}) =>
  post('/update-password', {
    email: String(email).trim(),
    role,
    old_password_hash: hashPassword(oldPassword),
    new_password_hash: hashPassword(newPassword),
    updated_by: updatedBy || String(email).trim(),
  });

/**
 * One shared endpoint for all three admin roles — the account's role is never
 * sent; the backend infers scope from `email` alone. Exactly one of
 * zoneCode/wardCode is ever populated (department_head filters by zone,
 * csi/sanitary_inspector by ward); omit the key entirely for "every
 * zone/ward in scope" rather than sending an empty string.
 */
export const adminDashboardHome = ({email, zoneCode, wardCode}) =>
  post('/admin-dashboard-home', {
    email: String(email).trim(),
    ...(zoneCode ? {zone_code: zoneCode} : null),
    ...(wardCode ? {ward_code: wardCode} : null),
  });

/**
 * Zone/ward directory — populates the Department Head's zone dropdown and
 * the CSI's ward dropdown (scoped to their own zone). `zoneCode` is optional:
 * omit it for every zone with its wards, or pass it for just that zone's
 * wards. Sanitary Inspector never calls this — its ward options come
 * straight from the login response's scope (domain/adminAuth.js).
 */
export const getZoneWardList = ({email, zoneCode}) =>
  post('/get-zone-ward-list', {
    email: String(email).trim(),
    ...(zoneCode ? {zone_code: zoneCode} : null),
  });

/**
 * The Worker Records screen's one network call — a full day's attendance for
 * every worker in the account's scope. Search, status, and ward/zone
 * filtering are all client-side over this response (spec §7.1); only `day`
 * (or the logged-in user) should trigger a re-fetch.
 */
export const adminWorkers = ({email, day}) =>
  post('/workers', {email: String(email).trim(), day});

/**
 * The Ward Map screen's one network call. The shift selector is never sent —
 * it only changes which client-side percentage is derived per ward (spec
 * §8.1); only the date range genuinely changes what comes back.
 */
export const adminWardAttendanceReport = ({email, fromDate, toDate}) =>
  post('/ward-attendance-report', {
    email: String(email).trim(),
    from_date: fromDate,
    to_date: toDate,
  });

/* -------------------------------------------------------- 2 update password */
export const updatePassword = ({email, oldPassword, newPassword, updatedBy}) =>
  post('/update-password', {
    email: String(email).trim(),
    role: 'Supervisor',
    old_password_hash: hashPassword(oldPassword),
    new_password_hash: hashPassword(newPassword),
    updated_by: updatedBy || String(email).trim(),
  });

/* ------------------------------------------------------- 3 complete profile */
export const completeProfile = ({email, fullName, phone, profilePhotoUrl}) =>
  post('/complete-profile', {
    email: String(email).trim(),
    full_name: fullName,
    phone: String(phone).replace(/\D/g, ''),
    profile_photo_url: profilePhotoUrl,
  });

/* ------------------------------------------------------------ 4 active shift */
const hhmmss = (d = new Date()) =>
  [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');

/** Resolves {shift_id, shift_name} or null when no shift is open. */
export async function activeShift(now = new Date()) {
  const body = await post('/active-shift', {current_time: hhmmss(now)});
  if (!body || body.shift_id === undefined || body.shift_id === null) {
    return null;
  }
  return body;
}

/* ---------------------------------------------------------- 5 supervisor home */
export const supervisorHome = (supervisorId, shiftId) =>
  post('/supervisor-home', {supervisor_id: supervisorId, shift_id: shiftId});

/* ------------------------------------------------------- 6 supervisor workers */
export async function supervisorWorkers(supervisorId, shiftId, {forLeave = false} = {}) {
  const payload = {supervisor_id: supervisorId, shift_id: shiftId};
  if (forLeave) {
    payload.for_leave = 1;
  }
  const body = await post('/supervisor-workers', payload);
  return (body && body.workers) || [];
}

/* ---------------------------------------------------------- 7 mark attendance */
export const markAttendance = ({
  workerId,
  shiftId,
  faceMatchScore,
  faceMatchStatus,
  capturedPhotoUrl,
  lat,
  lng,
  distanceFromWard,
  inside,
}) =>
  post('/mark-attendance', {
    worker_id: workerId,
    shift_id: shiftId,
    // faceMatchScore arrives as a 0-1 cosine similarity; the backend records a
    // 0-100 percentage (and rejects null), so scale it up (0.95 -> 95) and send
    // 0 when identity could not be verified.
    face_match_score: faceMatchScore == null ? 0 : Math.round(faceMatchScore * 10000) / 100,
    // Required by the backend — "Matched" / "Not Matched".
    face_match_status: faceMatchStatus || 'Not Matched',
    captured_photo_url: capturedPhotoUrl || null,
    geofencing_data: {
      geo_lat: lat,
      geo_long: lng,
      distance_from_ward: distanceFromWard == null ? null : Math.round(distanceFromWard * 10) / 10,
      geofencing_status: inside ? 'Inside' : 'Outside',
    },
  });

/* --------------------------------------------------------------- 8 add worker */
export const addWorker = ({
  fullName,
  relationName,
  relation,
  phone,
  gender,
  dateOfBirth,
  designation,
  wardId,
  supervisorId,
  faceReferencePhotoUrl,
}) =>
  post('/add-worker', {
    full_name: fullName,
    relation_name: relationName,
    relation,
    phone: String(phone || '').replace(/\D/g, ''),
    gender,
    date_of_birth: dateOfBirth || null,
    designation,
    // The backend field is `ward_code` (was `ward_id`); sending the wrong name
    // makes /add-worker reject with 422 and the worker is never saved.
    ward_code: wardId,
    supervisor_id: supervisorId,
    face_reference_photo_url: faceReferencePhotoUrl,
  });

/* -------------------------------------------------------------- 8b edit worker */
// /edit-worker lets the supervisor (or IT admin) attach/replace a worker's face
// reference photo — the only worker field a supervisor can change. `email`
// identifies who is making the edit; `face_reference_photo_url` is optional but
// is the whole point of the call for a supervisor onboarding a worker.
export const editWorker = ({email, workerId, faceReferencePhotoUrl}) =>
  post('/edit-worker', {
    email: String(email || '').trim(),
    worker_id: workerId,
    face_reference_photo_url: faceReferencePhotoUrl || null,
  });

/* ---------------------------------------------------------------- 9 add leave */
export const addLeave = ({
  workerId,
  leaveType,
  shiftId,
  fromDate,
  toDate,
  reason,
  supervisorId,
}) =>
  post('/add-leave', {
    worker_id: workerId,
    leave_type: leaveType,
    shift_id: shiftId === undefined ? null : shiftId, // null applies to both shifts
    from_date: fromDate || null,
    to_date: toDate || null,
    reason: reason || null,
    supervisor_id: supervisorId,
  });

export const _internal = {post};
