// Pure mapping from the raw /admin-dashboard-home response to the view model
// each role's Dashboard screen renders. No network, no React — see the admin
// app spec §6 for the exact rules this implements; every rule below cites the
// subsection it comes from.
import {SHIFTS} from './shifts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Shift time-window text and icon are not returned by the backend (spec
// §6.3.B) — this app already has real shift windows for the supervisor flow
// (domain/shifts.js), so those are reused here rather than guessing new ones.
const SHIFT_ICONS = {1: 'wb-sunny', 2: 'wb-twilight'};

function shiftMeta(shiftId) {
  const s = SHIFTS.find(x => x.id === shiftId) || SHIFTS[0];
  return {window: `${s.start}–${s.end}`, icon: SHIFT_ICONS[shiftId] || 'schedule'};
}

/** 'In progress' / 'Yet to start' / 'Closed', computed from the clock — only
 * meaningful for "today", per spec §6.3.B. */
export function shiftStateLabel(shiftId, now = new Date()) {
  const s = SHIFTS.find(x => x.id === shiftId) || SHIFTS[0];
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  if (mins < toMin(s.start)) {
    return 'Yet to start';
  }
  if (mins <= toMin(s.end)) {
    return 'In progress';
  }
  return 'Closed';
}

const round1 = n => Math.round((n || 0) * 10) / 10;

const shortDate = iso => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

const shortMonth = ym => {
  const m = Number(ym.split('-')[1]);
  return MONTHS[m - 1];
};

const initialsOf = name =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();

/** Headline "workers on roll" KPI (spec §6.3.A). */
export function mapRollKpi(raw, role) {
  const {total_workers, total_wards, total_zones} = raw.overview;
  const subtitle =
    role === 'sanitary_inspector'
      ? `${total_wards} wards`
      : `${total_wards} wards · ${total_zones} zones`;
  return {value: String(total_workers), subtitle};
}

/** One card per shift (spec §6.3.B). */
export function mapShiftCards(raw, now = new Date()) {
  return (raw.shift_wise_attendance || []).map(s => {
    const meta = shiftMeta(s.shift_id);
    return {
      shiftId: s.shift_id,
      name: s.shift_name,
      window: meta.window,
      icon: meta.icon,
      state: shiftStateLabel(s.shift_id, now),
      present: s.present_workers,
      presentPct: round1(s.present_percentage),
      absent: s.absent_workers,
      absentPct: round1(s.absent_percentage),
      onLeave: s.on_leave_workers,
      leavePct: round1(s.leave_percentage),
    };
  });
}

/** Weekly/monthly bar charts (spec §6.3.C/D) — last point flagged so the UI
 * can emphasize it as "today's/most-recent" per the spec's visual note. */
export function mapWeeklyChart(raw) {
  const points = raw.weekly_attendance || [];
  return points.map((p, i) => ({
    label: shortDate(p.week_start_date),
    value: p.total_attendance,
    emphasized: i === points.length - 1,
  }));
}

export function mapMonthlyChart(raw) {
  const points = raw.monthly_attendance || [];
  return points.map((p, i) => ({
    label: shortMonth(p.month),
    value: p.total_attendance,
    emphasized: i === points.length - 1,
  }));
}

/** Department Head / CSI "check-ins by zone" donut (spec §6.3.E). */
export function mapZoneSplit(raw, shiftId) {
  const rows = (raw.shift_zone_attendance || []).filter(r => r.shift_id === shiftId);
  const totalPresent = rows.reduce((sum, r) => sum + r.present_workers, 0) || 1;
  const slices = rows.map(r => ({
    name: r.zone_name,
    zoneCode: String(r.zone_code),
    value: r.present_workers,
    pct: round1((r.present_workers / totalPresent) * 100),
  }));
  const shiftSummary = (raw.shift_wise_attendance || []).find(s => s.shift_id === shiftId);
  return {total: shiftSummary ? shiftSummary.present_workers : totalPresent, unit: 'present', slices};
}

/** Sanitary Inspector "attendance split" donut: on-time/late/absent/on-leave
 * (spec §6.3.E). "Late" is a subset of "present", not an extra category. */
export function mapSiSplit(raw, shiftId) {
  const wardRows = (raw.ward_wise_attendance || []).filter(r => r.shift_id === shiftId);
  const present = wardRows.reduce((s, r) => s + r.present_workers, 0);
  const absent = wardRows.reduce((s, r) => s + r.absent_workers, 0);
  const onLeave = wardRows.reduce((s, r) => s + r.on_leave_workers, 0);
  const shiftEntry = (raw.shift_wise_attendance || []).find(s => s.shift_id === shiftId);
  const shiftName = shiftEntry ? shiftEntry.shift_name : '';
  const late = (raw.late_workers || []).filter(w => w.shift_name === shiftName).length;
  const onTime = Math.max(0, present - late);
  const total = onTime + late + absent + onLeave || 1;
  const pct = n => round1((n / total) * 100);
  return {
    total: present + absent + onLeave,
    slices: [
      {name: 'On time', value: onTime, pct: pct(onTime)},
      {name: 'Late', value: late, pct: pct(late)},
      {name: 'Absent', value: absent, pct: pct(absent)},
      {name: 'On leave', value: onLeave, pct: pct(onLeave)},
    ],
  };
}

/** Department Head / CSI "Lowest attendance today" right panel (spec §6.3.F).
 * `supervisorName: null` means the caller should show a vacant placeholder. */
export function mapLowestWards(raw) {
  return (raw.lowest_3_wards || []).map((w, i) => ({
    rank: i + 1,
    wardCode: String(w.ward_code),
    wardName: w.ward_name,
    zoneName: w.zone_name,
    supervisorName: w.supervisor_name || null,
    pct: Math.round(w.percentage),
    present: w.present_workers,
    total: w.total_workers,
    tone: w.percentage < 75 ? 'red' : w.percentage < 85 ? 'yellow' : 'neutral',
  }));
}

/** Sanitary Inspector "ward(s) at a glance" right panel (spec §6.3.F) — one
 * combined per-shift summary even with multiple wards; a known reference-app
 * simplification, kept as-is for this phase. */
export function mapSiWardsAtGlance(raw, now = new Date()) {
  const wardNames = Array.from(new Set((raw.ward_wise_attendance || []).map(r => r.ward_name)));
  const title = wardNames.length === 1 ? wardNames[0] : 'Your wards at a glance';
  return {title, shifts: mapShiftCards(raw, now)};
}

/** Sanitary Inspector "Workers needing a look" list, from late_workers (spec
 * §6.3.F). */
export function mapWorkersNeedingALook(raw) {
  return (raw.late_workers || []).map(w => ({
    name: w.worker_name,
    initials: initialsOf(w.worker_name),
    wardCode: String(w.ward_code),
    shiftName: w.shift_name,
    time: w.attendance_time ? w.attendance_time.slice(11, 16) : null,
  }));
}

/**
 * Header title/subtitle/scope label (spec §6.3.G). Deliberately derives the
 * Sanitary Inspector's header from the real response (overview /
 * ward_wise_attendance) instead of the reference app's mock fallback for
 * that role — the spec itself flags that gap and recommends fixing it
 * (open item 7). `subtitle` excludes the live "updated at" clock prefix,
 * which the screen adds itself since it's the viewer's current time, not
 * backend data, and so isn't something a pure/deterministic function should
 * produce.
 */
export function mapHeader(raw, role) {
  const {total_wards, total_workers, total_zones} = raw.overview;
  let title;
  let scopeLabel;
  if (role === 'department_head') {
    title = 'Attendance overview';
    scopeLabel = 'All zones';
  } else if (role === 'csi') {
    const zoneNames = Array.from(new Set((raw.shift_zone_attendance || []).map(r => r.zone_name)));
    title = zoneNames.length === 1 ? zoneNames[0] : `${total_zones} zones`;
    scopeLabel = title;
  } else {
    const wardNames = Array.from(new Set((raw.ward_wise_attendance || []).map(r => r.ward_name)));
    title = wardNames.length === 1 ? wardNames[0] : 'Your wards';
    scopeLabel = title;
  }
  return {title, scopeLabel, subtitle: `${total_wards} wards · ${total_workers} workers`};
}

/** Builds the full per-role dashboard view model from one raw response. */
export function mapDashboard(raw, role, {shiftId = 1, now = new Date()} = {}) {
  const base = {
    roll: mapRollKpi(raw, role),
    shiftCards: mapShiftCards(raw, now),
    weeklyChart: mapWeeklyChart(raw),
    monthlyChart: mapMonthlyChart(raw),
    header: mapHeader(raw, role),
  };
  if (role === 'sanitary_inspector') {
    return {
      ...base,
      split: mapSiSplit(raw, shiftId),
      rightPanel: {type: 'wardsAtAGlance', ...mapSiWardsAtGlance(raw, now)},
      workersNeedingALook: mapWorkersNeedingALook(raw),
    };
  }
  return {
    ...base,
    split: mapZoneSplit(raw, shiftId),
    rightPanel: {type: 'lowestWards', items: mapLowestWards(raw)},
  };
}
