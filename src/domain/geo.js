// Ward geo-fence maths. A ward is modelled as a centre point plus a radius,
// which is what the IT Administrator provisions in the full system.

const R = 6371000; // metres
const rad = deg => (deg * Math.PI) / 180;

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
 * Evaluate a position against the ward fence.
 * Returns {state: 'inside'|'outside'|'unknown', distance, overshoot}
 * `overshoot` is how far beyond the boundary the device is, in metres.
 */
export function evaluateFence(position, ward) {
  if (!position) {
    return {state: 'unknown', distance: null, overshoot: null};
  }
  if (!ward || !ward.center) {
    // No fence provisioned yet — do not block attendance on a fence we do not have.
    return {state: 'inside', distance: null, overshoot: null, unprovisioned: true};
  }
  const d = distanceMetres(position, ward.center);
  const radius = ward.radiusM || 800;
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
