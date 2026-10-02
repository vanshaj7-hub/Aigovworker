// Pure mapping for the /get-zone-ward-list directory response — used to
// populate the zone dropdown (Department Head) and the ward dropdown scoped
// to a zone (CSI). Sanitary Inspector never calls this endpoint (its ward
// options come straight from the login response's scope — see
// domain/adminAuth.js's siWardOptions).
export function normalizeZoneWardList(raw) {
  return (raw && raw.data ? raw.data : []).map(z => ({
    zoneCode: String(z.zone_code),
    zoneName: z.zone_name,
    wards: (z.wards || []).map(w => ({wardCode: String(w.ward_code), wardName: w.ward_name})),
  }));
}
