// Pure mapping for the Worker Records screen's one /workers fetch — per the
// admin app spec §7, search/status/ward/zone filtering and pagination are all
// client-side over this single per-day response, so everything here operates
// on the already-mapped WorkerAttendanceRow[] list, not on the raw response.

const STATUS_MAP = {present: 'present', absent: 'absent', 'on leave': 'on_leave', 'not marked': 'not_marked'};
const STATUS_LABELS = {present: 'Present', absent: 'Absent', on_leave: 'On leave', not_marked: 'Not marked'};

function normalizeStatus(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return STATUS_MAP[key] || 'not_marked';
}

/** All-words-first-letter, uppercased — the one initials rule this app
 * standardizes on (spec §5.4 flags two inconsistent reference variants and
 * recommends picking one; adminDashboard.js's late-workers list uses the
 * same rule). */
export function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function mapShiftCell(row, n) {
  const status = normalizeStatus(row[`shift_${n}_status`]);
  const geofencingStatus = row[`shift_${n}_geofencing_status`];
  const photoUrl = row[`shift_${n}_captured_photo_url`];
  const punctuality = row[`shift_${n}_punctuality_status`];
  const attendanceTime = row[`shift_${n}_attendance_time`];

  let location;
  let locationLabel;
  if (status === 'present') {
    const insideFence = geofencingStatus != null && String(geofencingStatus).trim().toLowerCase() === 'inside';
    if (insideFence) {
      location = 'inside_fence';
      locationLabel = 'Inside fence';
    } else if (geofencingStatus != null) {
      location = 'not_verified';
      locationLabel = `${geofencingStatus} fence`;
    } else {
      location = 'not_verified';
      locationLabel = 'Not verified';
    }
  } else if (status === 'absent') {
    location = 'not_verified';
    locationLabel = 'No capture';
  } else if (status === 'on_leave') {
    location = 'not_applicable';
    locationLabel = 'Leave — n/a';
  } else {
    location = 'not_applicable';
    locationLabel = 'Not marked';
  }

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    location,
    locationLabel,
    hasPhoto: Boolean(photoUrl),
    photoUrl: photoUrl || null,
    // Only 'Late' (case/whitespace-insensitive) means late — independent of
    // status, so a worker can be present AND late.
    isLate: String(punctuality || '').trim().toLowerCase() === 'late',
    // Literal substring of the naive ISO datetime, never Date-parsed, so it
    // can't be shifted by the viewer's timezone (spec §5.2).
    attendanceTime: attendanceTime ? attendanceTime.slice(11, 16) : null,
  };
}

function mapWorkerRow(row) {
  return {
    workerId: String(row.worker_id),
    name: row.worker_name,
    initials: initialsOf(row.worker_name),
    wardCode: String(row.ward_code),
    wardName: row.ward_name,
    zoneCode: String(row.zone_code),
    designation: row.designation,
    shift1: mapShiftCell(row, 1),
    shift2: mapShiftCell(row, 2),
  };
}

/** Maps the raw /workers response into the day's full worker list. */
export function mapWorkerRows(raw) {
  return (raw && raw.workers ? raw.workers : []).map(mapWorkerRow);
}

/**
 * All client-side filters in one pass, applied in the order the spec
 * describes: ward (if selected) takes precedence over zone; status narrows
 * by either shift matching; search is substring match on name or worker id.
 */
export function filterWorkers(rows, {search, wardCode, zoneCode, status} = {}) {
  let out = rows;
  if (wardCode) {
    out = out.filter(w => w.wardCode === String(wardCode));
  } else if (zoneCode) {
    out = out.filter(w => w.zoneCode === String(zoneCode));
  }
  if (status && status !== 'all') {
    out =
      status === 'late'
        ? out.filter(w => w.shift1.isLate || w.shift2.isLate)
        : out.filter(w => w.shift1.status === status || w.shift2.status === status);
  }
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    out = out.filter(w => w.name.toLowerCase().includes(q) || w.workerId.includes(q));
  }
  return out;
}

export const WORKERS_PAGE_SIZE = 50;

/** Returns just the first `page` pages worth of rows (1-indexed) — used for
 * a "load more" footer rather than separate page-number controls. */
export function pageSlice(rows, page, pageSize = WORKERS_PAGE_SIZE) {
  return rows.slice(0, page * pageSize);
}
