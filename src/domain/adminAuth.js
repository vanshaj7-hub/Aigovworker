// Pure mapping/normalization for the admin (Department Head / CSI / Sanitary
// Inspector) login response — no network, no storage, so it's unit-testable.
// Shapes and rules here are taken verbatim from the admin app spec (the raw
// backend contract, extracted from the working admin web portal's own
// source), not guessed.

// Raw backend role string (trimmed + lowercased) -> internal role id.
// 'Supervisor' deliberately has no entry here — it is not a valid login role
// for the admin app, and the supervisor app never goes through this path.
const ROLE_MAP = {
  'department head': 'department_head',
  'zonal in-charge': 'csi',
  'sanitary inspector': 'sanitary_inspector',
};

export class UnrecognizedRoleError extends Error {
  constructor(rawRole) {
    super(`Unrecognized role from login response: "${rawRole}"`);
    this.name = 'UnrecognizedRoleError';
    this.rawRole = rawRole;
  }
}

/** Maps the raw backend `role` string to the internal admin role id. Throws
 * UnrecognizedRoleError for anything not in ROLE_MAP (including 'Supervisor'
 * and 'IT Admin', both out of scope for this app). */
export function normalizeAdminRole(rawRole) {
  const key = String(rawRole || '').trim().toLowerCase();
  const role = ROLE_MAP[key];
  if (!role) {
    throw new UnrecognizedRoleError(rawRole);
  }
  return role;
}

/** Which primary filter (zone vs ward) a role's screens should show. */
export function primaryFilterFor(role) {
  return role === 'csi' || role === 'sanitary_inspector' ? 'ward' : 'zone';
}

const codesOf = (plural, singular) => {
  if (Array.isArray(plural)) {
    return plural.map(String);
  }
  if (Array.isArray(singular)) {
    return singular.map(String);
  }
  return [];
};

/**
 * Normalizes the raw `scope` object from a login response into
 * {label, zoneIds, wardIds} where zoneIds/wardIds are 'all' or an array of
 * string codes. See the admin app spec §2.3 for the raw shape this reads.
 */
export function normalizeScope(rawScope) {
  const scopeType = rawScope && rawScope.scope_type;
  if (scopeType === 'zones') {
    const codes = codesOf(rawScope.zone_codes, rawScope.zone_code);
    const label = codes.length === 1 ? `Zone ${codes[0]}` : `${codes.length} zones`;
    return {label, zoneIds: codes, wardIds: 'all'};
  }
  if (scopeType === 'wards') {
    const codes = codesOf(rawScope.ward_codes, rawScope.ward_code);
    const label = codes.length === 1 ? `Ward ${codes[0]}` : `${codes.length} wards`;
    return {label, zoneIds: 'all', wardIds: codes};
  }
  // scope_type 'all_zones', or anything unrecognized, fails open to full access
  // rather than silently scoping someone to nothing.
  return {label: 'All zones', zoneIds: 'all', wardIds: 'all'};
}

/**
 * Builds the normalized AuthUser the app holds in session state/storage from
 * a raw /login response. `rawRole` is kept verbatim (not just the normalized
 * id) because /update-password needs the exact original string back.
 */
export function buildAdminUser(raw) {
  return {
    id: String(raw.user_id),
    name: raw.full_name || '',
    email: raw.email,
    role: normalizeAdminRole(raw.role),
    rawRole: raw.role,
    scope: normalizeScope(raw.scope),
    mustChangePassword: raw.must_reset_password === 1 || raw.must_reset_password === true,
  };
}

/**
 * Ward filter options for a Sanitary Inspector, built directly from their own
 * scope.wardIds (no directory call, per spec §2.4). Returns [] when wardIds
 * is 'all' — there is no directory call for this role to enumerate real ward
 * codes from. The reference app's bug was rendering a ward filter dropdown
 * anyway in that case (unusable with zero options); the fix here lives on the
 * calling screen, which must treat an empty list as "no ward filter to show,
 * query with no ward_code" (i.e. every ward in scope) rather than rendering a
 * dropdown with nothing in it.
 */
export function siWardOptions(scope) {
  if (!scope || scope.wardIds === 'all') {
    return [];
  }
  return scope.wardIds.slice();
}
