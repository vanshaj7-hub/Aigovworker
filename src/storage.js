import AsyncStorage from '@react-native-async-storage/async-storage';
import {currentShift, dateKey} from './domain/shifts';
import {digest} from './domain/password';
import {buildDemoHistory, buildDemoWorkers} from './demo';

const K = {
  ACCOUNTS: '@accounts',
  SESSION: '@session',
  PROFILE: '@profile',
  WARD: '@ward',
  WORKERS: '@workers',
  ATTENDANCE: '@attendance',
  LEAVES: '@leaves',
  SYNC: '@lastSync',
  ISSUES: '@boundaryIssues',
  LOCATION_CHECKED: '@locationChecked',
};

// Credentials are issued by the IT team; the app never creates accounts.
// The seeded account below stands in for that until the backend is connected.
export const DEMO_CREDENTIALS = {email: 'rahul@example.com', password: 'Password123'};

const SEED_ACCOUNT = {
  email: DEMO_CREDENTIALS.email,
  hash: digest(DEMO_CREDENTIALS.password),
  supervisorId: 1,
  wardCode: 'W42',
  // 1 while the supervisor is still on the password the IT team issued.
  mustResetPassword: true,
};

// The ward the supervisor is assigned to. In the full system this arrives from
// /supervisor-home with a geo-fence drawn per ward by the IT Administrator.
const DEFAULT_WARD = {
  code: 'W42',
  number: 42,
  name: 'Ward 42 — Dharampur',
  shortName: 'Ward 42',
  center: null,
  radiusM: 800,
};

async function read(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}
async function write(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}
const uid = p => `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
const normEmail = v => String(v || '').trim().toLowerCase();

export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/* --------------------------------------------------------------- accounts */

export async function getAccounts() {
  const list = await read(K.ACCOUNTS, null);
  return list || write(K.ACCOUNTS, [SEED_ACCOUNT]);
}

/**
 * The supervisor signs in with the email address and password the IT team
 * issued. There is no self-service registration.
 */
export async function signIn(email, password) {
  const id = normEmail(email);
  const accounts = await getAccounts();
  const acct = accounts.find(a => normEmail(a.email) === id);
  if (!acct) {
    return {ok: false, reason: 'noAccount'};
  }
  if (acct.hash !== digest(password)) {
    return {ok: false, reason: 'badPassword'};
  }
  const session = await write(K.SESSION, {
    email: acct.email,
    supervisorId: acct.supervisorId,
    signedInAt: new Date().toISOString(),
    // Drives the skippable change-password prompt straight after sign-in.
    mustResetPassword: !!acct.mustResetPassword,
    passwordPromptDone: false,
  });
  return {ok: true, session};
}

/**
 * The supervisor supplies the password they currently hold — which may still be
 * the temporary one from the IT team — plus the new one.
 */
export async function changePassword(email, oldPassword, newPassword) {
  const id = normEmail(email);
  const accounts = await getAccounts();
  const acct = accounts.find(a => normEmail(a.email) === id);
  if (!acct) {
    return {ok: false, reason: 'noAccount'};
  }
  if (acct.hash !== digest(oldPassword)) {
    return {ok: false, reason: 'badOldPassword'};
  }
  acct.hash = digest(newPassword);
  acct.mustResetPassword = false;
  acct.passwordChangedAt = new Date().toISOString();
  await write(K.ACCOUNTS, accounts);
  const session = await getSession();
  if (session) {
    await write(K.SESSION, {...session, mustResetPassword: false, passwordPromptDone: true});
  }
  return {ok: true};
}

/** Called when the supervisor chooses to keep the temporary password for now. */
export async function dismissPasswordPrompt() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  return write(K.SESSION, {...session, passwordPromptDone: true});
}

/** Store a session object as-is (used by the backend auth path). */
export const saveSession = session => write(K.SESSION, session);

/** Clear the "must reset" flag on the current session after a change. */
export async function markPasswordChanged() {
  const session = await read(K.SESSION, null);
  if (session) {
    await write(K.SESSION, {...session, mustResetPassword: false, passwordPromptDone: true});
  }
}

export const getSession = () => read(K.SESSION, null);
export const signOut = () => AsyncStorage.removeItem(K.SESSION);

// The start-of-day location check runs once, right after the profile is first
// completed, and is remembered thereafter so the app does not re-gate on every
// launch. (Attendance marking still enforces the geo-fence every time.)
export const getLocationChecked = () => read(K.LOCATION_CHECKED, false);
export const setLocationChecked = () => write(K.LOCATION_CHECKED, true);

/* ---------------------------------------------------------------- profile */

export const getProfile = () => read(K.PROFILE, null);
export const saveProfile = p => write(K.PROFILE, {...p, completedAt: new Date().toISOString()});

/**
 * The supervisor's own details must be complete for the app to function, and
 * this is re-checked on every sign-in — not just the first.
 */
export function profileGaps(profile) {
  const gaps = [];
  if (!profile) {
    return ['name', 'mobile', 'designation', 'photo'];
  }
  if (!profile.name || profile.name.trim().length < 3) {
    gaps.push('name');
  }
  if (!/^\d{10}$/.test(String(profile.mobile || '').replace(/\D/g, ''))) {
    gaps.push('mobile');
  }
  if (!profile.designation || !profile.designation.trim()) {
    gaps.push('designation');
  }
  if (!profile.photoUri) {
    gaps.push('photo');
  }
  return gaps;
}
export const isProfileComplete = profile => profileGaps(profile).length === 0;

/* ------------------------------------------------------------------- ward */

export async function getWard() {
  const w = await read(K.WARD, null);
  return w || write(K.WARD, DEFAULT_WARD);
}

export async function setWardCentre(position, {force = false} = {}) {
  const ward = await getWard();
  if (!position || (ward.center && !force)) {
    return ward;
  }
  return write(K.WARD, {
    ...ward,
    center: {lat: position.lat, lng: position.lng},
    centreProvisionedAt: new Date().toISOString(),
    centreFromDevice: true,
  });
}

/* ---------------------------------------------------------------- workers */

export const getWorkers = () => read(K.WORKERS, []);

export async function addWorker(worker) {
  const workers = await getWorkers();
  const ward = await getWard();
  const seq = 110 + workers.length;
  const full = {
    id: uid('w'),
    code: `${ward.code}-${seq}`,
    createdAt: new Date().toISOString(),
    ...worker,
  };
  workers.push(full);
  await write(K.WORKERS, workers);
  return {workers, worker: full};
}

export async function removeWorker(id) {
  return write(K.WORKERS, (await getWorkers()).filter(w => w.id !== id));
}

/* ------------------------------------------------------------- attendance */

export const getAttendance = () => read(K.ATTENDANCE, []);

export async function addAttendance(rec) {
  const all = await getAttendance();
  // One record per worker per shift per day — a re-capture replaces the earlier one.
  const filtered = all.filter(
    r => !(r.workerId === rec.workerId && r.date === rec.date && r.shift === rec.shift),
  );
  const full = {id: uid('a'), createdAt: new Date().toISOString(), synced: false, ...rec};
  filtered.unshift(full);
  await write(K.ATTENDANCE, filtered);
  return {records: filtered, record: full};
}

/* ----------------------------------------------------------------- leaves */

export const getLeaves = () => read(K.LEAVES, []);

export async function addLeave(leave) {
  const all = await getLeaves();
  const full = {id: uid('l'), createdAt: new Date().toISOString(), ...leave};
  all.unshift(full);
  await write(K.LEAVES, all);
  return {leaves: all, leave: full};
}

/* ------------------------------------------------------------------- sync */

export const getLastSync = () => read(K.SYNC, null);

export async function flushQueue(isOnline) {
  const records = await getAttendance();
  const queued = records.filter(r => !r.synced);
  if (!isOnline || queued.length === 0) {
    return {records, synced: 0, online: !!isOnline};
  }
  const now = new Date().toISOString();
  records.forEach(r => {
    if (!r.synced) {
      r.synced = true;
      r.syncedAt = now;
    }
  });
  await write(K.ATTENDANCE, records);
  await write(K.SYNC, now);
  return {records, synced: queued.length, online: true};
}

export async function reportBoundaryIssue(payload) {
  const issues = await read(K.ISSUES, []);
  issues.unshift({id: uid('bi'), at: new Date().toISOString(), ...payload});
  return write(K.ISSUES, issues);
}

/* -------------------------------------------------------------- demo data */

export async function seedDemoWorkers() {
  const ward = await getWard();
  const existing = await getWorkers();
  if (existing.some(w => w.demo)) {
    return {workers: existing, added: 0};
  }
  const demo = buildDemoWorkers(ward.code, 110 + existing.length);
  const workers = existing.concat(demo);
  await write(K.WORKERS, workers);
  return {workers, added: demo.length};
}

export async function seedDemoHistory(supervisorId) {
  const ward = await getWard();
  let workers = await getWorkers();
  let added = 0;
  if (!workers.some(w => w.demo)) {
    const seeded = await seedDemoWorkers();
    workers = seeded.workers;
    added = seeded.added;
  }
  const demoWorkers = workers.filter(w => w.demo);
  const {records, leaves} = buildDemoHistory(demoWorkers, 21, supervisorId, ward.code);

  const keptRecords = (await getAttendance()).filter(r => !r.demo);
  const keptLeaves = (await getLeaves()).filter(l => !l.demo);
  const allRecords = keptRecords.concat(records).sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
  await write(K.ATTENDANCE, allRecords);
  await write(K.LEAVES, keptLeaves.concat(leaves));
  await write(K.SYNC, new Date().toISOString());
  return {workers, records: allRecords, leaves: keptLeaves.concat(leaves), added};
}

export async function clearDemoData() {
  const workers = (await getWorkers()).filter(w => !w.demo);
  const records = (await getAttendance()).filter(r => !r.demo);
  const leaves = (await getLeaves()).filter(l => !l.demo);
  await write(K.WORKERS, workers);
  await write(K.ATTENDANCE, records);
  await write(K.LEAVES, leaves);
  return {workers, records, leaves};
}

/* ------------------------------------------------------------- aggregates */

export async function loadAll() {
  const [profile, ward, workers, records, leaves, lastSync] = await Promise.all([
    getProfile(),
    getWard(),
    getWorkers(),
    getAttendance(),
    getLeaves(),
    getLastSync(),
  ]);
  return {profile, ward, workers, records, leaves, lastSync};
}

export const currentShiftId = () => currentShift().id;

export {dateKey};
