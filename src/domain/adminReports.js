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

const FIREBASE_REST_HOST = 'https://firebasestorage.googleapis.com/v0/b';
const BUCKET_SUFFIX = '.firebasestorage.app';

/**
 * Converts a raw GCS object URL (`storage.googleapis.com/<bucket>/<path>`,
 * which is what the backend's `file_url` actually is) into the Firebase
 * Storage REST download URL (`firebasestorage.googleapis.com/v0/b/<bucket>
 * /o/<path>?alt=media`).
 *
 * This matters because those two hosts are gated by two different, unrelated
 * things: the bare GCS URL is governed by the bucket's IAM, which denies an
 * anonymous read (confirmed directly — a plain GET to it returns HTTP 403);
 * the Firebase REST endpoint is governed by this project's Storage Rules
 * instead, the same path the web dashboard's Storage SDK call (`getBlob`)
 * goes through, and those rules do allow the read. No credentials needed —
 * it's a different URL for the same object, not a different auth mechanism.
 *
 * Returns null if `url` doesn't look like a `*.firebasestorage.app` bucket
 * URL at all, so a caller can fall back to using it unchanged rather than
 * assuming every file_url needs this treatment.
 */
export function toFirebaseDownloadUrl(url) {
  const raw = String(url || '');
  const suffixIndex = raw.indexOf(BUCKET_SUFFIX);
  const protoEnd = raw.indexOf('://');
  if (suffixIndex === -1 || protoEnd === -1) {
    return null;
  }
  // The bucket is the first path segment after the host (storage.googleapis.com),
  // not everything after "://" — skip past the host to find where it starts.
  const hostEnd = raw.indexOf('/', protoEnd + 3);
  if (hostEnd === -1 || hostEnd >= suffixIndex) {
    return null;
  }
  const bucketEnd = suffixIndex + BUCKET_SUFFIX.length;
  const bucket = raw.slice(hostEnd + 1, bucketEnd);
  const rest = raw.slice(bucketEnd);
  if (rest.charAt(0) !== '/') {
    return null;
  }
  let path = rest.slice(1).split('?')[0];
  if (!path) {
    return null;
  }
  try {
    path = decodeURIComponent(path);
  } catch (e) {
    // Not validly encoded — use it as found.
  }
  return `${FIREBASE_REST_HOST}/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Last path segment of a URL, decoded and stripped of any query string —
 * used to name a downloaded report file when nothing better is given.
 * Characters a device's filesystem can't store in a filename (a colon from
 * a timestamp, say) are replaced with "_" — DownloadManager fails the whole
 * transfer, silently, if the destination name is invalid. */
export function filenameFromUrl(url) {
  if (!url) {
    return 'report';
  }
  try {
    const noQuery = String(url).split('?')[0];
    const last = noQuery.substring(noQuery.lastIndexOf('/') + 1);
    const decoded = decodeURIComponent(last) || 'report';
    return decoded.replace(INVALID_FILENAME_CHARS, '_');
  } catch (e) {
    return 'report';
  }
}
