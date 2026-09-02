import AsyncStorage from '@react-native-async-storage/async-storage';
import {dateKey} from './domain/shifts';

const K = {
  SESSION: '@session',
  PROFILE: '@profile',
  WARD: '@ward',
  WORKERS: '@workers',
  ATTENDANCE: '@attendance',
  LEAVES: '@leaves',
  SYNC: '@lastSync',
  ISSUES: '@boundaryIssues',
};

// Credentials the IT Administrator would issue. Local until a backend exists.
const ACCOUNTS = [{id: 'SUP-042', password: 'ward42', wardCode: 'W42'}];

// The ward the signed-in supervisor is assigned to. In the full system this
// arrives from the server with a geo-fence drawn by the IT Administrator.
const DEFAULT_WARD = {
  code: 'W42',
  number: 42,
  name: 'Ward 42 — Dharampur',
  shortName: 'Ward 42',
  center: null, // provisioned on first GPS fix; see setWardCentre
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

/* ---------------------------------------------------------------- session */

export async function signIn(supervisorId, password) {
  const id = String(supervisorId || '').trim().toUpperCase();
  const acct = ACCOUNTS.find(a => a.id === id && a.password === password);
  if (!acct) {
    return null;
  }
  const session = {supervisorId: acct.id, signedInAt: new Date().toISOString()};
  await write(K.SESSION, session);
  return session;
}

export const getSession = () => read(K.SESSION, null);
export const signOut = () => AsyncStorage.removeItem(K.SESSION);

export const getProfile = () => read(K.PROFILE, null);
export const saveProfile = p => write(K.PROFILE, {...p, completedAt: new Date().toISOString()});

export async function getWard() {
  const w = await read(K.WARD, null);
  if (w) {
    return w;
  }
  return write(K.WARD, DEFAULT_WARD);
}

/**
 * Provision the ward centre from the first reliable GPS fix, so the geo-fence
 * is meaningful wherever the app is being used. In production this value is
 * supplied by the IT Administrator and this call is never made.
 */
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
  const workers = (await getWorkers()).filter(w => w.id !== id);
  return write(K.WORKERS, workers);
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

/**
 * Offline-first: records are always written locally first and flushed when the
 * device is online. There is no server yet, so flushing marks the queue as sent.
 * Point this at the attendance API when the backend exists.
 */
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

export {dateKey};
