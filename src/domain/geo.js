// Ward geo-fence maths. A ward comes from /supervisor-home either as a polygon
// boundary (an ordered list of "lng,lat" points) or, in the older format, as a
// centre point plus a radius. Both are supported.

const R = 6371000; // metres
const rad = deg => (deg * Math.PI) / 180;

// A fixed tolerance around the ward boundary: a device within this many metres
// of the polygon edge counts as inside, absorbing normal GPS drift near the
// perimeter. (Requested behaviour: "within 100 m of the boundary is inside".)
export const EDGE_BUFFER_M = 100;
// The fix's own reported accuracy widens the tolerance a little more, but is
// capped so a wildly inaccurate reading cannot silently void the fence.
const ACCURACY_SLACK_CAP = 60;

export function distanceMetres(a, b) {
  if (!a || !b) {
    return null;
  }
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Parse the backend's boundary list (["lng,lat", ...]) into an ordered ring of
 * {lat, lng} points. Returns null if there are not at least three valid points.
 */
export function parseWardPolygon(coords) {
  if (!Array.isArray(coords) || coords.length < 3) {
    return null;
  }
  const ring = [];
  for (const item of coords) {
    // Each entry is "longitude,latitude" (longitude first).
    const parts = String(item).split(',');
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      ring.push({lat, lng});
    }
  }
  return ring.length >= 3 ? ring : null;
}

/** A simple average of the vertices — good enough for centring a map marker. */
export function polygonCentroid(ring) {
  if (!ring || !ring.length) {
    return null;
  }
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lng;
  }
  return {lat: lat / ring.length, lng: lng / ring.length};
}

/**
 * Ray-casting point-in-polygon test (the same idea as Turf's
 * booleanPointInPolygon). Longitude is x, latitude is y.
 */
export function pointInPolygon(point, ring) {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// Distance in metres from p to segment a-b, all in a local flat projection.
function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Shortest distance, in metres, from a point to a polygon's boundary. */
export function distanceToPolygonMetres(point, ring) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(rad(point.lat));
  const toXY = pt => ({
    x: (pt.lng - point.lng) * mPerDegLng,
    y: (pt.lat - point.lat) * mPerDegLat,
  });
  const P = {x: 0, y: 0};
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, segmentDistance(P, toXY(ring[j]), toXY(ring[i])));
  }
  return min;
}

/**
 * Evaluate a position against the ward fence.
 * Returns {state: 'inside'|'outside'|'unknown', distance, overshoot}.
 * `distance` is 0 inside a polygon, else the distance to the boundary/centre;
 * `overshoot` is how far beyond the boundary the device is, in metres.
 *
 * Polygon wards use a point-in-polygon test with a tolerance buffer of at least
 * EDGE_BUFFER_M (100 m) around the boundary — widened by the fix's own reported
 * accuracy (capped) — so a device just outside the edge, or a noisy fix, is not
 * wrongly rejected.
 */
export function evaluateFence(position, ward) {
  if (!position) {
    return {state: 'unknown', distance: null, overshoot: null};
  }

  const acc = Number.isFinite(position.accuracy) ? position.accuracy : 0;
  const slack = Math.min(acc, ACCURACY_SLACK_CAP);

  // Preferred: polygon boundary. Inside the polygon, or within the 100 m buffer
  // (plus a little GPS slack) of its edge, counts as inside the ward.
  if (ward && ward.polygon && ward.polygon.length >= 3) {
    const buffer = Math.max(ward.radiusM || 0, EDGE_BUFFER_M) + slack;
    if (pointInPolygon(position, ward.polygon)) {
      return {state: 'inside', distance: 0, overshoot: 0};
    }
    const dist = distanceToPolygonMetres(position, ward.polygon);
    if (dist <= buffer) {
      return {state: 'inside', distance: dist, overshoot: 0, buffered: true};
    }
    return {state: 'outside', distance: dist, overshoot: dist - buffer};
  }

  // Legacy: centre point + radius.
  if (!ward || !ward.center) {
    // No fence provisioned yet — do not block attendance on a fence we do not have.
    return {state: 'inside', distance: null, overshoot: null, unprovisioned: true};
  }
  const d = distanceMetres(position, ward.center);
  const radius = (ward.radiusM || 800) + slack;
  return {
    state: d <= radius ? 'inside' : 'outside',
    distance: d,
    overshoot: Math.max(0, d - radius),
  };
}

export function formatDistance(metres) {
  if (metres === null || metres === undefined) {
    return '—';
  }
  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }
  const km = metres / 1000;
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}
