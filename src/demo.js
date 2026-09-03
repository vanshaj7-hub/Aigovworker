// Demonstration data. Everything created here carries demo:true so it can be
// removed in one action and can never be mistaken for a real field record.
import {SHIFTS, dateKey} from './domain/shifts';

const NAMES = [
  ['Sunil Prasad', 'Safai karmi'],
  ['Mohan Lal', 'Safai karmi'],
  ['Anita Devi', 'Helper'],
  ['Ramesh Chand', 'Driver'],
  ['Sarita Devi', 'Safai karmi'],
  ['Vijay Singh', 'Safai karmi'],
  ['Kamla Rani', 'Helper'],
  ['Deepak Kumar', 'Safai karmi'],
  ['Geeta Sharma', 'Safai karmi'],
  ['Naresh Kumar', 'Driver'],
];

const FATHERS = [
  'Ram Prasad', 'Shyam Lal', 'Hari Singh', 'Mahesh Chand', 'Suresh Kumar',
  'Gopal Singh', 'Prem Chand', 'Rajendra Kumar', 'Mohan Sharma', 'Dinesh Kumar',
];

const uid = p => `${p}_demo_${Math.random().toString(36).slice(2, 9)}`;

/** Ten demo workers on the supervisor's ward roll. */
export function buildDemoWorkers(wardCode = 'W42', startSeq = 110) {
  return NAMES.map(([name, designation], i) => ({
    id: uid('w'),
    code: `${wardCode}-${startSeq + i}`,
    name,
    fatherName: FATHERS[i],
    mobile: `9${(412055800 + i * 7).toString().padStart(9, '0')}`.slice(0, 10),
    designation,
    photoUri: null,
    embedding: null, // no reference face — see isDemoWorker in the capture flow
    demo: true,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Past attendance so the history screen has something to show. Weekdays only,
 * with a realistic mix of present, absent and a run of leave.
 */
export function buildDemoHistory(workers, days = 21, supervisorId = 'SUP-042', wardCode = 'W42') {
  const records = [];
  const leaves = [];
  const today = new Date();

  const onLeave = workers[4]; // Sarita Devi
  if (onLeave) {
    const from = new Date(today);
    from.setDate(from.getDate() - 3);
    const to = new Date(today);
    to.setDate(to.getDate() - 2);
    leaves.push({
      id: uid('l'),
      workerId: onLeave.id,
      workerName: onLeave.name,
      type: 'casual',
      from: dateKey(from),
      to: dateKey(to),
      bothShifts: true,
      shift: null,
      remarks: 'Approved by Sanitary Incharge',
      demo: true,
      createdAt: new Date().toISOString(),
    });
  }

  for (let back = days; back >= 1; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    if (day.getDay() === 0) {
      continue; // weekly off
    }
    const dk = dateKey(day);
    workers.forEach((w, wi) => {
      SHIFTS.forEach(shift => {
        // Deterministic-ish spread: most present, a few misses per worker.
        const miss = (back * 7 + wi * 3 + shift.id * 5) % 11 === 0;
        if (miss) {
          return;
        }
        const covered = leaves.some(
          l => l.workerId === w.id && l.from <= dk && l.to >= dk,
        );
        if (covered) {
          return;
        }
        const [sh, sm] = shift.start.split(':').map(Number);
        const ts = new Date(day);
        ts.setHours(sh, sm + ((wi * 13 + back * 5) % 55), 0, 0);
        records.push({
          id: uid('a'),
          workerId: w.id,
          workerName: w.name,
          date: dk,
          shift: shift.id,
          capturedAt: ts.toISOString(),
          matchScore: Math.round((0.72 + ((wi * 7 + back) % 22) / 100) * 100) / 100,
          location: null,
          insideGeofence: true,
          distanceM: (wi * 31 + back) % 400,
          photoUri: null,
          supervisorId,
          wardCode,
          synced: true,
          syncedAt: ts.toISOString(),
          demo: true,
        });
      });
    });
  }
  records.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
  return {records, leaves};
}

export const isDemoWorker = w => !!(w && w.demo && !w.embedding);
