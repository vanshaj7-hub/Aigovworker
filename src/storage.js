import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ACCOUNTS: '@accounts',
  WORKERS: '@workers',
  ATTENDANCE: '@attendance',
};

const DEFAULT_ACCOUNTS = [
  {
    role: 'supervisor',
    username: 'supervisor',
    password: 'nagar123',
    name: 'Field Supervisor',
  },
  {
    role: 'admin',
    username: 'admin',
    password: 'admin123',
    name: 'Regional Manager',
  },
];

async function readJson(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function writeJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getAccounts() {
  const accounts = await readJson(KEYS.ACCOUNTS, null);
  if (!accounts) {
    await writeJson(KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);
    return DEFAULT_ACCOUNTS;
  }
  return accounts;
}

export async function getWorkers() {
  return readJson(KEYS.WORKERS, []);
}

export async function saveWorker(worker) {
  const workers = await getWorkers();
  workers.push(worker);
  await writeJson(KEYS.WORKERS, workers);
  return workers;
}

export async function deleteWorker(workerId) {
  const workers = (await getWorkers()).filter(w => w.id !== workerId);
  await writeJson(KEYS.WORKERS, workers);
  return workers;
}

export async function getAttendance() {
  return readJson(KEYS.ATTENDANCE, []);
}

export async function addAttendance(record) {
  const records = await getAttendance();
  records.unshift(record);
  await writeJson(KEYS.ATTENDANCE, records);
  return records;
}

// Marks locally queued records as synced. This app is offline-first: records
// are always saved locally, then flushed when connectivity is available.
// Point this at a real backend endpoint when one exists.
export async function syncPendingRecords(isOnline) {
  const records = await getAttendance();
  if (!isOnline) {
    return {records, syncedCount: 0};
  }
  let syncedCount = 0;
  const now = new Date().toISOString();
  for (const r of records) {
    if (!r.synced) {
      r.synced = true;
      r.syncedAt = now;
      syncedCount++;
    }
  }
  if (syncedCount > 0) {
    await writeJson(KEYS.ATTENDANCE, records);
  }
  return {records, syncedCount};
}

export function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Sample data for the admin dashboard. Clearly flagged demo:true so it can be
// removed in one tap and never mixes ambiguously with real field records.
// ---------------------------------------------------------------------------

const DEMO_AREAS = [
  {area: 'Ward 1 – Clock Tower', workers: 14, attendanceRate: 0.86},
  {area: 'Ward 2 – Rajpur Road', workers: 11, attendanceRate: 0.78},
  {area: 'Ward 3 – Patel Nagar', workers: 9, attendanceRate: 0.9},
  {area: 'Ward 4 – ISBT', workers: 12, attendanceRate: 0.7},
  {area: 'Ward 5 – Raipur', workers: 7, attendanceRate: 0.82},
];

export async function hasDemoData() {
  const records = await getAttendance();
  return records.some(r => r.demo);
}

export async function seedDemoData(days = 120) {
  const records = await getAttendance();
  const real = records.filter(r => !r.demo);
  const demo = [];
  const today = new Date();
  for (let back = 1; back <= days; back++) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const dow = day.getDay();
    if (dow === 0) {
      continue; // weekly off
    }
    // Slow upward adoption trend: older weeks see fewer digital check-ins.
    const adoption = 0.55 + 0.45 * ((days - back) / days);
    for (const cfg of DEMO_AREAS) {
      for (let w = 0; w < cfg.workers; w++) {
        const p = cfg.attendanceRate * adoption * (dow === 6 ? 0.85 : 1);
        if (Math.random() > p) {
          continue;
        }
        const ts = new Date(day);
        ts.setHours(7 + Math.floor(Math.random() * 3));
        ts.setMinutes(Math.floor(Math.random() * 60));
        ts.setSeconds(Math.floor(Math.random() * 60));
        demo.push({
          id: `demo_${back}_${cfg.area}_${w}`,
          workerId: `demo_w_${cfg.area}_${w}`,
          workerName: `Demo Worker ${w + 1}`,
          department: 'Sanitation',
          area: cfg.area,
          timestamp: ts.toISOString(),
          dateKey: dateKey(ts),
          location: null,
          supervisor: 'Demo Supervisor',
          supervisorUsername: 'demo',
          similarity: Math.round((0.62 + Math.random() * 0.3) * 100) / 100,
          status: 'present',
          synced: true,
          demo: true,
        });
      }
    }
  }
  demo.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const merged = [...real, ...demo].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : -1,
  );
  await writeJson(KEYS.ATTENDANCE, merged);
  return merged;
}

export async function clearDemoData() {
  const records = (await getAttendance()).filter(r => !r.demo);
  await writeJson(KEYS.ATTENDANCE, records);
  return records;
}
