// Pure mapping for the Ward Map screen's one /ward-attendance-report fetch —
// per the admin app spec §8, the shift selector and the three view modes are
// all derived client-side from one date-range fetch; only the date range
// itself triggers a new request. `shiftFilter` here is 'both' | 1 | 2,
// matching this app's own shift ids (domain/shifts.js) rather than the
// reference app's 'shift1'/'shift2' string ids.

const round0 = n => Math.round(n || 0);

function shiftPct(ward, shiftId) {
  const entry = (ward.shifts || []).find(s => s.shift_id === shiftId);
  return round0(entry ? entry.average_attendance_percentage : ward.average_attendance_percentage);
}

/** Per-ward normalized cell (spec §8.3). */
export function mapWardCell(ward, shiftFilter = 'both') {
  const shift1Pct = shiftPct(ward, 1);
  const shift2Pct = shiftPct(ward, 2);
  const pct = shiftFilter === 1 ? shift1Pct : shiftFilter === 2 ? shift2Pct : round0(ward.average_attendance_percentage);
  return {
    wardNumber: Number(ward.ward_code),
    wardName: ward.ward_name,
    supervisorName: ward.supervisor_name || null,
    pct,
    shift1Pct,
    shift2Pct,
    absentCount: Math.max(0, (ward.total_expected || 0) - (ward.total_present || 0)),
    totalWorkers: ward.total_expected || 0,
    noAttendance: (ward.total_expected || 0) > 0 && ward.total_present === 0,
  };
}

/** Per-zone group — CSI (single-zone scope) renders `cells` flat/ungrouped;
 * Department Head groups wards under this zone header (spec §8.5.1). */
export function mapZoneGroup(zone, shiftFilter = 'both') {
  const cells = (zone.wards || []).map(w => mapWardCell(w, shiftFilter));
  const avgPct = cells.length ? Math.round(cells.reduce((sum, c) => sum + c.pct, 0) / cells.length) : 0;
  return {
    zoneId: String(zone.zone_code),
    name: zone.zone_name,
    wardRange: `${cells.length} ward${cells.length === 1 ? '' : 's'}`,
    avgPct,
    cells,
  };
}

export function mapZones(raw, shiftFilter = 'both') {
  return (raw.zones || []).map(z => mapZoneGroup(z, shiftFilter));
}

/** "Needs attention" list — each row's percentage is looked up from the
 * matching ward inside `zones`, not carried on the row itself (spec §8.3). */
export function mapAttentionList(raw) {
  const byWard = new Map();
  (raw.zones || []).forEach(z => (z.wards || []).forEach(w => byWard.set(String(w.ward_code), w)));
  return (raw.continuous_low_attendance || []).map(item => {
    const ward = byWard.get(String(item.ward_code));
    return {
      wardNumber: Number(item.ward_code),
      wardName: item.ward_name,
      zone: item.zone_name,
      supervisor: item.supervisor_name || 'Vacant',
      presentPct: ward ? round0(ward.average_attendance_percentage) : 0,
    };
  });
}

/** Summary band counts come verbatim from the backend — never recomputed
 * from individual ward percentages (spec §8.3). */
export function mapSummary(raw) {
  const s = raw.summary || {};
  return {
    above90: s.wards_above_90 || 0,
    between80and90: s.wards_80_to_90 || 0,
    below80: s.wards_below_80 || 0,
    wardsNotReporting: s.wards_no_attendance || 0,
  };
}

/** Whole days spanned by from_date..to_date inclusive, local-time parsed
 * (never `new Date(isoString)` directly on a bare date — spec §5.2). */
export function attentionWindowDays(fromDate, toDate) {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to - from) / 86400000) + 1;
}

const RED = [234, 67, 53];
const YELLOW = [251, 188, 4];
const GREEN = [52, 168, 83];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

/** Continuous red→yellow→green gradient pivoting at 80% (spec §8.4), plus a
 * readable text color chosen from the resulting background's luminance. */
export function heatColor(pctRaw) {
  const pct = Math.max(0, Math.min(100, pctRaw || 0));
  const [a, b, t] = pct <= 80 ? [RED, YELLOW, pct / 80] : [YELLOW, GREEN, (pct - 80) / 20];
  const r = lerp(a[0], b[0], t);
  const g = lerp(a[1], b[1], t);
  const bch = lerp(a[2], b[2], t);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * bch) / 255;
  return {bg: `rgb(${r}, ${g}, ${bch})`, text: luminance > 0.55 ? '#202124' : '#FFFFFF'};
}

/** Which single flag icon a ward cell should show, in priority order (spec
 * §8.4): vacant supervisor > no attendance at all > below the 80% line. */
export function wardFlag(cell) {
  if (!cell.supervisorName) {
    return 'vacantSupervisor';
  }
  if (cell.noAttendance) {
    return 'noAttendance';
  }
  if (cell.pct < 80) {
    return 'lowPct';
  }
  return null;
}

/** Flattens every ward across every zone, sorted ascending (worst-first) by
 * the currently-selected shift's pct — the "Ranked list" view (spec §8.5.3). */
export function rankedWards(zones) {
  const all = zones.flatMap(z => z.cells.map(c => ({...c, zoneName: z.name})));
  return all
    .slice()
    .sort((a, b) => a.pct - b.pct)
    .map((c, i) => ({...c, rank: i + 1}));
}

/** Builds the full view model from one raw /ward-attendance-report response. */
export function mapWardMap(raw, shiftFilter = 'both') {
  const zones = mapZones(raw, shiftFilter);
  return {
    fromDate: raw.from_date,
    toDate: raw.to_date,
    summary: mapSummary(raw),
    attentionWindowDays: attentionWindowDays(raw.from_date, raw.to_date),
    attention: mapAttentionList(raw),
    zones,
    ranked: rankedWards(zones),
  };
}
