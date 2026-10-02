import {
  UnrecognizedRoleError,
  buildAdminUser,
  normalizeAdminRole,
  normalizeScope,
  primaryFilterFor,
  siWardOptions,
} from '../src/domain/adminAuth';

describe('normalizeAdminRole', () => {
  it('maps the three in-scope raw role strings, case/whitespace-insensitively', () => {
    expect(normalizeAdminRole('Department Head')).toBe('department_head');
    expect(normalizeAdminRole('  zonal in-charge ')).toBe('csi');
    expect(normalizeAdminRole('SANITARY INSPECTOR')).toBe('sanitary_inspector');
  });

  it('rejects Supervisor and IT Admin — out of scope for this app', () => {
    expect(() => normalizeAdminRole('Supervisor')).toThrow(UnrecognizedRoleError);
    expect(() => normalizeAdminRole('IT Admin')).toThrow(UnrecognizedRoleError);
  });

  it('rejects anything unrecognized', () => {
    expect(() => normalizeAdminRole('Mayor')).toThrow(UnrecognizedRoleError);
  });
});

describe('primaryFilterFor', () => {
  it('is zone for department_head, ward for csi and sanitary_inspector', () => {
    expect(primaryFilterFor('department_head')).toBe('zone');
    expect(primaryFilterFor('csi')).toBe('ward');
    expect(primaryFilterFor('sanitary_inspector')).toBe('ward');
  });
});

describe('normalizeScope', () => {
  it('maps all_zones to full access', () => {
    expect(normalizeScope({scope_type: 'all_zones'})).toEqual({
      label: 'All zones',
      zoneIds: 'all',
      wardIds: 'all',
    });
  });

  it('maps a single zone code with the plural key', () => {
    expect(normalizeScope({scope_type: 'zones', zone_codes: ['3']})).toEqual({
      label: 'Zone 3',
      zoneIds: ['3'],
      wardIds: 'all',
    });
  });

  it('falls back to the singular zone_code key', () => {
    expect(normalizeScope({scope_type: 'zones', zone_code: [3, 4]})).toEqual({
      label: '2 zones',
      zoneIds: ['3', '4'],
      wardIds: 'all',
    });
  });

  it('maps ward scope the same way', () => {
    expect(normalizeScope({scope_type: 'wards', ward_codes: ['42']})).toEqual({
      label: 'Ward 42',
      zoneIds: 'all',
      wardIds: ['42'],
    });
  });

  it('fails open to full access for an unrecognized scope_type', () => {
    expect(normalizeScope({scope_type: 'something_new'})).toEqual({
      label: 'All zones',
      zoneIds: 'all',
      wardIds: 'all',
    });
  });
});

describe('buildAdminUser', () => {
  it('maps a full raw login response', () => {
    const raw = {
      user_id: 7,
      full_name: 'Neha Chauhan',
      email: 'vasucsi@gmail.com',
      role: 'Zonal In-Charge',
      must_reset_password: 1,
      scope: {scope_type: 'zones', zone_codes: ['3']},
    };
    expect(buildAdminUser(raw)).toEqual({
      id: '7',
      name: 'Neha Chauhan',
      email: 'vasucsi@gmail.com',
      role: 'csi',
      rawRole: 'Zonal In-Charge',
      scope: {label: 'Zone 3', zoneIds: ['3'], wardIds: 'all'},
      mustChangePassword: true,
    });
  });

  it('treats must_reset_password: 0 as false', () => {
    const raw = {
      user_id: 1,
      full_name: 'Dr Anil Bhatt',
      email: 'vasu@gmail.com',
      role: 'Department Head',
      must_reset_password: 0,
      scope: {scope_type: 'all_zones'},
    };
    expect(buildAdminUser(raw).mustChangePassword).toBe(false);
  });
});

describe('siWardOptions', () => {
  it('returns the scoped ward codes (already-normalized scope, i.e. strings)', () => {
    expect(siWardOptions({wardIds: ['12', '14']})).toEqual(['12', '14']);
  });

  it('returns an empty list when the SI scope is "all" (no directory call to fall back on)', () => {
    expect(siWardOptions({wardIds: 'all'})).toEqual([]);
  });

  it('returns an empty list for a missing scope', () => {
    expect(siWardOptions(null)).toEqual([]);
  });
});
