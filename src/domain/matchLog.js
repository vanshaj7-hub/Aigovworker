// Pure helpers for the on-device face-match attempt log. storage.js owns the
// AsyncStorage read/write; kept separate here so the capping and CSV shape are
// unit-testable without React Native.

// Keep the log bounded so it never grows into a real storage/perf problem —
// this is meant for periodically exporting and clearing, not permanent history.
export const MAX_MATCH_LOG_ENTRIES = 500;

/** Appends an entry, dropping the oldest ones once the cap is exceeded. */
export function appendMatchEntry(log, entry) {
  const next = [...(log || []), entry];
  return next.length > MAX_MATCH_LOG_ENTRIES
    ? next.slice(next.length - MAX_MATCH_LOG_ENTRIES)
    : next;
}

const CSV_COLUMNS = ['at', 'workerId', 'workerName', 'outcome', 'detail', 'score', 'verified', 'demo'];

function csvCell(v) {
  if (v == null) {
    return '';
  }
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serializes the match log to CSV text: one row per attendance attempt with
 * its real cosine score, matched/rejected/error outcome and worker. This is
 * the data MATCH_THRESHOLD (and the quality-gate constants in faceMath.js)
 * should be tuned from, rather than guessed.
 */
export function matchLogToCsv(log) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const e of log || []) {
    rows.push(CSV_COLUMNS.map(k => csvCell(e[k])).join(','));
  }
  return rows.join('\n');
}
