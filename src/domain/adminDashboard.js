// Pure mapping from the raw /admin-dashboard-home response to the view model
// the Dashboard screen renders, matching the "Admin App" design file's own
// layout (one KPI table + one donut-split card + one lowest-wards list,
// shared by all three roles — not three different widget sets per role).
import {ac} from '../adminTheme';
import {SHIFTS} from './shifts';

// Shift time-window text and icon are not returned by the backend (spec
// §6.3.B) — this app already has real shift windows for the supervisor flow
// (domain/shifts.js), so those are reused here rather than guessing new ones.
const SHIFT_ICONS = {1: 'wb-sunny', 2: 'wb-twilight'};
const SHIFT_ICON_COLORS = {1: ac.blue, 2: ac.yellowDark};

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

/** Shift metadata for the shift-selector pills used on Dashboard/Ward Map
 * (name/icon/state) — kept separate from the KPI table rows below, which
 * need the attendance counts too. */
export function mapShiftCards(raw, now = new Date()) {
  return (raw.shift_wise_attendance || []).map(s => {
    const meta = shiftMeta(s.shift_id);
    return {
      shiftId: s.shift_id,
      name: s.shift_name,
      window: meta.window,
      icon: meta.icon,
      state: shiftStateLabel(s.shift_id, now),
    };
  });
}

/** The KPI card's compact per-shift table (spec §6.3.B): checked-in/absent
 * counts+percentages, and an on-leave count (no percentage, matching the
 * design). No "late" column here — late only shows up in the attendance
 * split donut (CSI/SI) and in Worker Records. */
export function mapShiftKpiRows(raw, now = new Date()) {
  return (raw.shift_wise_attendance || []).map(s => {
    const meta = shiftMeta(s.shift_id);
    const state = shiftStateLabel(s.shift_id, now);
    return {
      shiftId: s.shift_id,
      name: s.shift_name,
      icon: meta.icon,
      iconColor: SHIFT_ICON_COLORS[s.shift_id] || ac.blue,
      stateColor: state === 'In progress' ? ac.blue : ac.grey400,
      inN: s.present_workers,
      inPct: `${round1(s.present_percentage)}%`,
      absN: s.absent_workers,
      absPct: `${round1(s.absent_percentage)}%`,
      lvN: s.on_leave_workers,
    };
  });
}

const ZONE_COLORS = [ac.blue, ac.red, ac.green, ac.yellow, ac.purple];

/** Department Head "check-ins by zone" donut (spec §6.3.E) — the one role
 * whose split is grouped by zone rather than by attendance status. */
export function mapZoneSplit(raw, shiftId) {
  const rows = (raw.shift_zone_attendance || []).filter(r => r.shift_id === shiftId);
  const totalPresent = rows.reduce((sum, r) => sum + r.present_workers, 0) || 1;
  const slices = rows.map((r, i) => ({
    name: r.zone_name,
    zoneCode: String(r.zone_code),
    value: r.present_workers,
    pct: round1((r.present_workers / totalPresent) * 100),
    color: ZONE_COLORS[i % ZONE_COLORS.length],
  }));
  const shiftSummary = (raw.shift_wise_attendance || []).find(s => s.shift_id === shiftId);
  return {total: shiftSummary ? shiftSummary.present_workers : totalPresent, unit: 'checkIns', slices};
}

const STATUS_COLORS = {onTime: ac.green, late: ac.yellow, absent: ac.red, onLeave: ac.silver};

/** CSI / Sanitary Inspector "attendance split" donut: on-time/late/absent/
 * on-leave (spec §6.3.E). "Late" is a subset of "present", not an extra
 * category. Both roles share this exact split in the design — only
 * Department Head gets the zone-grouped one above. */
export function mapAttendanceSplit(raw, shiftId) {
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
    unit: 'workers',
    // `key` names an i18n string (onTime/late/absent/onLeave) rather than
    // carrying display text itself — unlike zone names above, these four
    // labels are UI copy this app invents, not data the backend returns.
    slices: [
      {key: 'onTime', value: onTime, pct: pct(onTime), color: STATUS_COLORS.onTime},
      {key: 'late', value: late, pct: pct(late), color: STATUS_COLORS.late},
      {key: 'absent', value: absent, pct: pct(absent), color: STATUS_COLORS.absent},
      {key: 'onLeave', value: onLeave, pct: pct(onLeave), color: STATUS_COLORS.onLeave},
    ],
  };
}

const toneOf = pct => (pct < 75 ? 'red' : pct < 85 ? 'yellow' : 'neutral');

/** "Lowest attendance today" list (spec §6.3.F) — shared by all three roles
 * in the design (the reference app's role-specific right panels for CSI/SI
 * are gone). `supervisorName: null` means the caller should show a vacant
 * placeholder. */
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
    tone: toneOf(w.percentage),
  }));
}

/** Builds the full per-role dashboard view model from one raw response. The
 * header (name/role/scope) and the split/lowest titles come from the
 * signed-in user and simple counts already in `raw.overview`, not from a
 * separate mapped field — see AdminDashboardScreen, which composes them
 * with i18n templates since they depend on the session, not just this
 * response. */
export function mapDashboard(raw, role, {shiftId = 1, now = new Date()} = {}) {
  const {total_workers, total_wards, total_zones} = raw.overview;
  return {
    totalWorkers: total_workers,
    totalWards: total_wards,
    totalZones: total_zones,
    shiftCards: mapShiftCards(raw, now),
    shiftKpiRows: mapShiftKpiRows(raw, now),
    split: role === 'department_head' ? mapZoneSplit(raw, shiftId) : mapAttendanceSplit(raw, shiftId),
    lowest: mapLowestWards(raw),
  };
}
