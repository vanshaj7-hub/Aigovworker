// Pure mapping for the Reports / Export screen (spec §10). The two endpoints
// here are confirmed live/real (unlike Spot-checks) — this is the one place
// in the admin app that actually generates a file; every other screen's
// "Export" affordance just links here (spec §10.1), so nothing else needs
// its own generation logic.

import {dateKey} from './shifts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shortDisplayDate(key) {
  const d = parseDateKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Today / this-week (Monday–today) / this-month (1st–today) / custom. */
export function datePresetRange(preset, today = new Date()) {
  const todayKey = dateKey(today);
  if (preset === 'today') {
    return {from: todayKey, to: todayKey};
  }
  if (preset === 'thisWeek') {
    const dow = today.getDay(); // 0 = Sunday
    const backToMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - backToMonday);
    return {from: dateKey(monday), to: todayKey};
  }
  if (preset === 'thisMonth') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return {from: dateKey(first), to: todayKey};
  }
  return null; // 'custom' — caller keeps whatever dates are already picked
}

/**
 * `scope.zones`/`scope.wards` can each be a formatted label string, a single
 * code, an empty array, or a multi-element array (spec §10.2) — normalize
 * all four shapes into one display string.
 */
export function formatScopePart(raw, kind) {
  if (typeof raw === 'string') {
    return raw;
  }
  const codes = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  if (codes.length === 0) {
    return `All ${kind}s`;
  }
  if (codes.length === 1) {
    return `${kind} ${codes[0]}`;
  }
  return `${kind}s ${codes.join(', ')}`;
}

export function mapRecentReport(raw) {
  const {from, to} = raw.date_range || {};
  const range = from && to ? (from === to ? shortDisplayDate(from) : `${shortDisplayDate(from)} – ${shortDisplayDate(to)}`) : '';
  const zones = formatScopePart(raw.scope && raw.scope.zones, 'Zone');
  const wards = formatScopePart(raw.scope && raw.scope.wards, 'Ward');
  const when = raw.generated_at
    ? `${shortDisplayDate(raw.generated_at.slice(0, 10))} · ${raw.generated_at.slice(11, 16)}`
    : '';
  return {
    id: raw.report_id,
    range,
    scope: `${zones} · ${wards}`,
    when,
    format: raw.format === 'pdf' ? 'pdf' : 'csv',
    fileUrl: raw.file_url,
  };
}

export function mapRecentReports(raw) {
  return (raw && raw.reports ? raw.reports : []).map(mapRecentReport);
}

/**
 * Builds the /attendance-report request body. `filterValue` is the single
 * selected zone/ward code (or null/undefined for "everything in scope"),
 * and `primaryFilter` ('zone' | 'ward') picks which key it becomes — mirrors
 * every other screen's zone-vs-ward pattern (spec §2.4).
 */
export function buildGenerateRequest({email, fromDate, toDate, primaryFilter, filterValue, format}) {
  return {
    email,
    fromDate,
    toDate,
    format,
    zoneCodes: primaryFilter === 'zone' && filterValue ? [filterValue] : undefined,
    wardCodes: primaryFilter === 'ward' && filterValue ? [filterValue] : undefined,
  };
}

const STORAGE_ERROR_PATTERNS = [/storage\.googleapis\.com/i, /gserviceaccount\.com/i, /storage\.objects/i];

/** A backend error that looks like a storage/service-account permission
 * failure gets a friendlier message pointing at IT, instead of raw jargon. */
export function isStoragePermissionError(message) {
  const text = String(message || '');
  return STORAGE_ERROR_PATTERNS.some(re => re.test(text));
}

/** Last path segment of a URL, decoded and stripped of any query string —
 * used to name a downloaded report file when nothing better is given. */
export function filenameFromUrl(url) {
  if (!url) {
    return 'report';
  }
  try {
    const noQuery = String(url).split('?')[0];
    const last = noQuery.substring(noQuery.lastIndexOf('/') + 1);
    return decodeURIComponent(last) || 'report';
  } catch (e) {
    return 'report';
  }
}
