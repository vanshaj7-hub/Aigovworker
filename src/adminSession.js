// High-level admin (Department Head / CSI / Sanitary Inspector) operations —
// the admin-flow counterpart to session.js. Kept in its own file/storage key
// throughout rather than extending the supervisor session, so nothing here
// can affect the supervisor flow.
import * as api from './api';
import {buildAdminUser, primaryFilterFor} from './domain/adminAuth';
import {buildGenerateRequest, mapRecentReports} from './domain/adminReports';
import {normalizeZoneWardList} from './domain/zoneWard';
import {getAdminSession, saveAdminSession, signOutAdmin} from './storage';

/**
 * Returns {ok: true, user} on success or {ok: false, reason, message}.
 * reason is one of: 'badCredentials' | 'network' | 'unrecognizedRole'.
 */
export async function adminAuthenticate(email, password) {
  let raw;
  try {
    raw = await api.adminLogin(email, password);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return {ok: false, reason: 'badCredentials', message: err.message};
    }
    return {ok: false, reason: 'network', message: err.message};
  }
  let user;
  try {
    user = buildAdminUser(raw);
  } catch (err) {
    return {ok: false, reason: 'unrecognizedRole', message: err.message};
  }
  await saveAdminSession(user);
  return {ok: true, user};
}

/**
 * First-sign-in (or voluntary) password change. `oldPassword` must be the
 * password the user actually just authenticated with — the set-password step
 * never re-asks for it, so the caller must have kept it in memory since
 * login (never persisted).
 */
export async function adminChangePassword({user, oldPassword, newPassword}) {
  try {
    await api.adminUpdatePassword({
      email: user.email,
      role: user.rawRole,
      oldPassword,
      newPassword,
      updatedBy: user.email,
    });
  } catch (err) {
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      return {ok: false, reason: 'badOldPassword', message: err.message};
    }
    return {ok: false, reason: 'network', message: err.message};
  }
  // /update-password's response body is not a confirmed contract (spec §3.5)
  // — a 2xx means success, nothing else to parse. Construct the updated user
  // client-side, same as the reference app.
  const updated = {...user, mustChangePassword: false};
  await saveAdminSession(updated);
  return {ok: true, user: updated};
}

export const getStoredAdminUser = async () => {
  const stored = await getAdminSession();
  return stored ? stored.user : null;
};

export const adminSignOut = () => signOutAdmin();

/**
 * Dashboard data for whichever zone/ward filter is currently selected.
 * `filterValue` is a single zone or ward code, or null/undefined for "every
 * zone/ward in scope" — never send an empty string, per the spec's "omit the
 * key entirely" contract.
 */
export async function fetchAdminDashboard(user, filterValue) {
  const filter = primaryFilterFor(user.role);
  const params =
    filter === 'zone'
      ? {email: user.email, zoneCode: filterValue || undefined}
      : {email: user.email, wardCode: filterValue || undefined};
  return api.adminDashboardHome(params);
}

/**
 * Zone/ward directory for the Department Head zone dropdown and the CSI ward
 * dropdown. `zoneCode` scopes to one zone's wards; omit it for every zone.
 */
export async function fetchZoneWardList(user, zoneCode) {
  const raw = await api.getZoneWardList({email: user.email, zoneCode: zoneCode || undefined});
  return normalizeZoneWardList(raw);
}

/** The Worker Records screen's one fetch — a full day's attendance. */
export async function fetchAdminWorkers(user, day) {
  return api.adminWorkers({email: user.email, day});
}

/** The Ward Map screen's one fetch — a date-range attendance report. */
export async function fetchWardAttendanceReport(user, {fromDate, toDate}) {
  return api.adminWardAttendanceReport({email: user.email, fromDate, toDate});
}

/** The Reports screen's "previously generated" list. */
export async function fetchRecentReports(user) {
  const raw = await api.recentAttendanceReports({email: user.email});
  return mapRecentReports(raw);
}

/**
 * Generates a new report. Returns {ok: true, fileUrl} or {ok: false, message}
 * — storage/service-account-looking errors are left for the caller to
 * recognize via domain/adminReports.js's isStoragePermissionError and show a
 * friendlier message, per spec §10.4.
 */
export async function generateReport(user, {fromDate, toDate, filterValue, format}) {
  const primaryFilter = primaryFilterFor(user.role);
  const body = buildGenerateRequest({email: user.email, fromDate, toDate, primaryFilter, filterValue, format});
  try {
    const raw = await api.attendanceReport(body);
    return {ok: true, fileUrl: raw.file_url};
  } catch (err) {
    return {ok: false, message: err.message};
  }
}
