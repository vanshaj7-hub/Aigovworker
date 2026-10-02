// Placeholder ward-boundary + capture-point generator for the Worker Detail
// map (see WardMapView). The admin app spec has no confirmed lat/lng or
// ward-boundary field anywhere — every raw shape we have only carries a
// geofencing STATUS string ("Inside"/"Outside"/null), never coordinates
// (confirmed by grepping the spec: the only "lat, lng" mention in the whole
// document is Spot-checks' unrendered, unconfirmed `coords` field). This
// generates a deterministic, plausible-looking boundary + pin so the map UI
// can be built and reviewed now; swap it for the real endpoint the moment
// it's confirmed — nothing else needs to change, since WardMapView only
// consumes {boundary, point}.
function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Dehradun — matches the reference mock's own coordinates.
const BASE = {lat: 30.3255, lng: 78.0538};

/** Deterministic per-ward demo boundary (a small rectangle) and a capture
 * point placed inside or outside it depending on `inside`. */
export function demoWardGeo(wardCode, inside) {
  const seed = hashSeed(wardCode);
  const center = {
    lat: BASE.lat + ((seed % 100) / 100 - 0.5) * 0.01,
    lng: BASE.lng + (((seed >> 8) % 100) / 100 - 0.5) * 0.01,
  };
  const dLat = 0.0006;
  const dLng = 0.0008;
  const boundary = [
    {lat: center.lat + dLat, lng: center.lng - dLng},
    {lat: center.lat + dLat, lng: center.lng + dLng},
    {lat: center.lat - dLat, lng: center.lng + dLng},
    {lat: center.lat - dLat, lng: center.lng - dLng},
  ];
  const point = inside
    ? {lat: center.lat + dLat * 0.3, lng: center.lng - dLng * 0.2, accuracy: 6, inside: true}
    : {lat: center.lat + dLat * 2.2, lng: center.lng + dLng * 1.8, accuracy: 9, inside: false};
  return {boundary, point};
}
