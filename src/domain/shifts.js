// The ward day runs in two shifts. Attendance is keyed by (worker, date, shift),
// so a worker can be present for one shift and absent for the other.
export const SHIFTS = [
  {id: 1, key: 'shift1', start: '06:00', end: '10:00'},
  {id: 2, key: 'shift2', start: '14:00', end: '18:00'},
];

export const getShift = id => SHIFTS.find(s => s.id === id) || SHIFTS[0];

export function dateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

const toMinutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 'before' | 'open' | 'closed' for a shift relative to `now`. */
export function shiftWindowState(shift, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < toMinutes(shift.start)) {
    return 'before';
  }
  if (mins <= toMinutes(shift.end)) {
    return 'open';
  }
  return 'closed';
}

/**
 * The shift that is actually running right now, or null in the gaps between
 * shifts. Attendance may only be marked while a shift is ongoing.
 */
export function ongoingShift(now = new Date()) {
  return SHIFTS.find(s => shiftWindowState(s, now) === 'open') || null;
}

/** The shift a supervisor is most likely to be marking right now. */
export function currentShift(now = new Date()) {
  const open = SHIFTS.find(s => shiftWindowState(s, now) === 'open');
  if (open) {
    return open;
  }
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < toMinutes(SHIFTS[0].start)) {
    return SHIFTS[0]; // early morning, Shift 1 has not opened yet
  }
  if (mins < toMinutes(SHIFTS[1].start)) {
    return SHIFTS[1]; // midday gap, Shift 2 is next
  }
  return SHIFTS[1]; // after Shift 2 closed, stay on the last shift of the day
}

export function isLeaveOnDate(leave, dk, shiftId) {
  if (leave.from > dk || leave.to < dk) {
    return false;
  }
  return leave.bothShifts || leave.shift === shiftId;
}

/**
 * Resolve one worker's status for a date and shift.
 * present -> attendance captured
 * leave   -> an approved leave covers it
 * absent  -> the shift window has closed with nothing captured
 * pending -> still markable
 */
export function resolveStatus({workerId, dk, shiftId, records, leaves, now = new Date()}) {
  const leave = leaves.find(l => l.workerId === workerId && isLeaveOnDate(l, dk, shiftId));
  if (leave) {
    return {status: 'leave', leave};
  }
  const rec = records.find(
    r => r.workerId === workerId && r.date === dk && r.shift === shiftId,
  );
  if (rec) {
    return {status: 'present', record: rec};
  }
  const todayKey = dateKey(now);
  if (dk < todayKey) {
    return {status: 'absent'};
  }
  if (dk === todayKey && shiftWindowState(getShift(shiftId), now) === 'closed') {
    return {status: 'absent'};
  }
  return {status: 'pending'};
}

export function shiftLabel(t, shiftId) {
  return t(shiftId === 2 ? 'shift2' : 'shift1');
}

export function shiftRange(shiftId) {
  const s = getShift(shiftId);
  return `${s.start}–${s.end}`;
}

export function timeOfDay(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function clockTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  let h = d.getHours();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
