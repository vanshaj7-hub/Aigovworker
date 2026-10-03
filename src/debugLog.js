// A tiny in-memory log, scoped to the report-download flow — after several
// silent failures in a row with no way to see what actually happened on the
// device (no adb/logcat access to this pilot phone), the fastest way to
// actually diagnose it is to let the person testing export what happened
// and send it back, instead of guessing at another fix blind.
const MAX_ENTRIES = 200;
let entries = [];

// Local time, not toISOString() (which is always UTC and would read hours
// off from the device's own clock — exactly what made an export look like
// it was timestamped in the wrong timezone).
function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Appends one line. `data`, if given, is JSON-stringified onto the line. */
export function logEvent(tag, message, data) {
  const line = data === undefined ? `[${timestamp()}] [${tag}] ${message}` : `[${timestamp()}] [${tag}] ${message} ${safeJson(data)}`;
  entries.push(line);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
}

function safeJson(data) {
  try {
    return JSON.stringify(data);
  } catch (e) {
    return String(data);
  }
}

export function getLogText() {
  return entries.length ? entries.join('\n') : '(no log entries yet)';
}

export function clearLog() {
  entries = [];
}

/** Strips a URL's query string before logging it — a report's storage URL
 * carries a download token in its query, which shouldn't end up in a log
 * someone pastes into a chat or email. */
export function redactUrl(url) {
  return String(url || '').split('?')[0];
}
