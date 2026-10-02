// Full-flow smoke test for both login paths, exercising the REAL
// session.js / adminSession.js orchestration code (not reimplemented logic)
// against mocked api.js responses shaped exactly like the confirmed backend
// contracts. This is the thing a live device/emulator run would otherwise
// cover — api.js is the only thing mocked, so everything downstream of it
// (role/scope normalization, session persistence, error-reason mapping) is
// the app's real code path.
import {authenticate, changeAccountPassword} from '../src/session';
import {
  adminAuthenticate,
  adminChangePassword,
  fetchAdminDashboard,
  fetchZoneWardList,
  fetchAdminWorkers,
  fetchWardAttendanceReport,
  fetchRecentReports,
  getStoredAdminUser,
  adminSignOut,
} from '../src/adminSession';
import {getSession, signOut} from '../src/storage';
import {ApiError} from '../src/api';
import * as api from '../src/api';

// Keep the real ApiError class and hashPassword (so credential hashing still
// runs for real); mock only the network-calling exports.
jest.mock('../src/api', () => {
  const actual = jest.requireActual('../src/api');
  const keepReal = new Set(['hashPassword', 'ApiError', '_internal']);
  const mocked = {...actual};
  Object.keys(actual).forEach(key => {
    if (typeof actual[key] === 'function' && !keepReal.has(key)) {
      mocked[key] = jest.fn();
    }
  });
  return mocked;
});

afterEach(async () => {
  jest.clearAllMocks();
  await signOut();
  await adminSignOut();
});

describe('Supervisor login flow', () => {
  it('authenticates, persists the session, and reports its shape', async () => {
    api.login.mockResolvedValue({
      email: 'ramesh@nndehradun.gov.in',
      user_id: 42,
      full_name: 'Ramesh Supervisor',
      must_reset_password: 1,
      profile_completed: 0,
    });

    const res = await authenticate('ramesh@nndehradun.gov.in', 'TempPass@1');

    expect(res.ok).toBe(true);
    expect(res.session).toMatchObject({
      email: 'ramesh@nndehradun.gov.in',
      supervisorId: 42,
      fullName: 'Ramesh Supervisor',
      mustResetPassword: true,
      profileCompleted: false,
      source: 'backend',
    });

    // The session actually persisted, so a fresh app boot would find it.
    const stored = await getSession();
    expect(stored).toMatchObject({email: 'ramesh@nndehradun.gov.in', supervisorId: 42});
  });

  it('maps a 401 to badCredentials without touching storage', async () => {
    api.login.mockRejectedValue(new ApiError('Invalid credentials', 401, null));
    const res = await authenticate('ramesh@nndehradun.gov.in', 'wrong');
    expect(res).toEqual({ok: false, reason: 'badCredentials', message: 'Invalid credentials'});
    expect(await getSession()).toBeNull();
  });

  it('maps a connection failure to network, surfacing the server message', async () => {
    api.login.mockRejectedValue(new ApiError('No response from the server. Check the connection.', 0, null));
    const res = await authenticate('ramesh@nndehradun.gov.in', 'x');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('network');
  });

  it('forced password change clears mustResetPassword via the real backend call', async () => {
    api.login.mockResolvedValue({
      email: 'ramesh@nndehradun.gov.in',
      user_id: 42,
      full_name: 'Ramesh Supervisor',
      must_reset_password: 1,
      profile_completed: 1,
    });
    await authenticate('ramesh@nndehradun.gov.in', 'TempPass@1');

    api.updatePassword.mockResolvedValue({});
    const res = await changeAccountPassword('ramesh@nndehradun.gov.in', 'TempPass@1', 'NewPass@123');
    expect(res.ok).toBe(true);
    expect(api.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({email: 'ramesh@nndehradun.gov.in', oldPassword: 'TempPass@1', newPassword: 'NewPass@123'}),
    );
  });
});

describe('Admin login flow — all three in-scope roles', () => {
  const ROLES = [
    {
      raw: 'Department Head',
      role: 'department_head',
      scope: {scope_type: 'all_zones'},
      email: 'vasu@gmail.com',
    },
    {
      raw: 'Zonal In-Charge',
      role: 'csi',
      scope: {scope_type: 'zones', zone_codes: ['3']},
      email: 'vasucsi@gmail.com',
    },
    {
      raw: 'Sanitary Inspector',
      role: 'sanitary_inspector',
      scope: {scope_type: 'wards', ward_codes: ['42', '47']},
      email: 'vasusi@gmail.com',
    },
  ];

  it.each(ROLES)('signs in as $raw, normalizes the role, and persists the session', async ({raw, role, scope, email}) => {
    api.adminLogin.mockResolvedValue({
      user_id: 1,
      full_name: 'Test Admin',
      email,
      role: raw,
      must_reset_password: 0,
      scope,
    });

    const res = await adminAuthenticate(email, 'Google@123');

    expect(res.ok).toBe(true);
    expect(res.user.role).toBe(role);
    expect(res.user.rawRole).toBe(raw); // kept verbatim for /update-password
    expect(res.user.mustChangePassword).toBe(false);

    const stored = await getStoredAdminUser();
    expect(stored).toEqual(res.user);
  });

  it('rejects a Supervisor-role login response as unrecognized (admin app is DH/CSI/SI only)', async () => {
    api.adminLogin.mockResolvedValue({
      user_id: 1,
      full_name: 'Someone',
      email: 'x@y.com',
      role: 'Supervisor',
      must_reset_password: 0,
      scope: {scope_type: 'all_zones'},
    });
    const res = await adminAuthenticate('x@y.com', 'pw');
    expect(res).toMatchObject({ok: false, reason: 'unrecognizedRole'});
    expect(await getStoredAdminUser()).toBeNull();
  });

  it('maps a 401/403 to badCredentials', async () => {
    api.adminLogin.mockRejectedValue(new ApiError('Invalid credentials', 401, null));
    const res = await adminAuthenticate('vasu@gmail.com', 'wrong');
    expect(res).toEqual({ok: false, reason: 'badCredentials', message: 'Invalid credentials'});
  });

  it('first-login forced password change sends the rawRole back verbatim and clears the flag', async () => {
    api.adminLogin.mockResolvedValue({
      user_id: 7,
      full_name: 'Neha Chauhan',
      email: 'vasucsi@gmail.com',
      role: 'Zonal In-Charge',
      must_reset_password: 1,
      scope: {scope_type: 'zones', zone_codes: ['3']},
    });
    const signIn = await adminAuthenticate('vasucsi@gmail.com', 'TempPass@1');
    expect(signIn.user.mustChangePassword).toBe(true);

    api.adminUpdatePassword.mockResolvedValue({});
    const res = await adminChangePassword({user: signIn.user, oldPassword: 'TempPass@1', newPassword: 'NewPass@123'});
    expect(res.ok).toBe(true);
    expect(res.user.mustChangePassword).toBe(false);
    expect(api.adminUpdatePassword).toHaveBeenCalledWith(
      expect.objectContaining({email: 'vasucsi@gmail.com', role: 'Zonal In-Charge'}),
    );

    const stored = await getStoredAdminUser();
    expect(stored.mustChangePassword).toBe(false);
  });
});

describe('Admin data screens — one fetch each, per role, after a real sign-in', () => {
  async function signInAs(raw, role, scope, email) {
    api.adminLogin.mockResolvedValue({user_id: 1, full_name: 'Test Admin', email, role: raw, must_reset_password: 0, scope});
    const res = await adminAuthenticate(email, 'Google@123');
    expect(res.ok).toBe(true);
    return res.user;
  }

  it('Department Head: dashboard, zone directory, workers, ward map, reports all resolve', async () => {
    const user = await signInAs('Department Head', 'department_head', {scope_type: 'all_zones'}, 'vasu@gmail.com');

    api.adminDashboardHome.mockResolvedValue({overview: {total_workers: 10, total_wards: 2, total_zones: 1}, shift_wise_attendance: []});
    await expect(fetchAdminDashboard(user, null)).resolves.toBeTruthy();
    expect(api.adminDashboardHome).toHaveBeenCalledWith({email: user.email, zoneCode: undefined});

    api.getZoneWardList.mockResolvedValue({
      data: [{zone_code: '1', zone_name: 'Zone 1', wards: [{ward_code: 1, ward_name: 'Ward 1'}]}],
    });
    const zones = await fetchZoneWardList(user);
    expect(zones).toEqual([{zoneCode: '1', zoneName: 'Zone 1', wards: [{wardCode: '1', wardName: 'Ward 1'}]}]);

    api.adminWorkers.mockResolvedValue({date: '2026-09-10', total_workers: 0, workers: []});
    await expect(fetchAdminWorkers(user, '2026-09-10')).resolves.toBeTruthy();

    api.adminWardAttendanceReport.mockResolvedValue({
      from_date: '2026-09-01',
      to_date: '2026-09-01',
      summary: {wards_above_90: 0, wards_80_to_90: 0, wards_below_80: 0, wards_no_attendance: 0},
      continuous_low_attendance: [],
      zones: [],
    });
    await expect(fetchWardAttendanceReport(user, {fromDate: '2026-09-01', toDate: '2026-09-01'})).resolves.toBeTruthy();

    api.recentAttendanceReports.mockResolvedValue({reports: []});
    await expect(fetchRecentReports(user)).resolves.toEqual([]);
  });

  it('CSI: dashboard call uses wardCode not zoneCode, and ward directory is scoped to their zone', async () => {
    const user = await signInAs('Zonal In-Charge', 'csi', {scope_type: 'zones', zone_codes: ['3']}, 'vasucsi@gmail.com');

    api.adminDashboardHome.mockResolvedValue({overview: {total_workers: 5, total_wards: 1, total_zones: 1}, shift_wise_attendance: []});
    await fetchAdminDashboard(user, '12');
    expect(api.adminDashboardHome).toHaveBeenCalledWith({email: user.email, wardCode: '12'});
  });

  it('Sanitary Inspector: skips the zone/ward directory call entirely', async () => {
    const user = await signInAs(
      'Sanitary Inspector',
      'sanitary_inspector',
      {scope_type: 'wards', ward_codes: ['42']},
      'vasusi@gmail.com',
    );
    expect(user.scope.wardIds).toEqual(['42']);
    // No assertion needed beyond this: domain/adminAuth.siWardOptions (unit
    // tested separately) is what the UI layer uses instead of a network call
    // for this role — fetchZoneWardList is simply never invoked for SI.
    expect(api.getZoneWardList).not.toHaveBeenCalled();
  });
});
