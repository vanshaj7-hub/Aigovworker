import {ac} from '../src/adminTheme';
import {
  mapAttendanceSplit,
  mapDashboard,
  mapLowestWards,
  mapShiftCards,
  mapShiftKpiRows,
  mapZoneSplit,
  shiftStateLabel,
} from '../src/domain/adminDashboard';

const RAW = {
  overview: {total_workers: 120, total_wards: 12, total_zones: 3},
  shift_wise_attendance: [
    {
      shift_id: 1,
      shift_name: 'Shift 1',
      present_workers: 90,
      present_percentage: 75.333,
      absent_workers: 20,
      absent_percentage: 16.666,
      on_leave_workers: 10,
      leave_percentage: 8.333,
    },
    {
      shift_id: 2,
      shift_name: 'Shift 2',
      present_workers: 80,
      present_percentage: 66.666,
      absent_workers: 30,
      absent_percentage: 25,
      on_leave_workers: 10,
      leave_percentage: 8.333,
    },
  ],
  shift_zone_attendance: [
    {shift_id: 1, zone_code: 1, zone_name: 'Zone A', present_workers: 40},
    {shift_id: 1, zone_code: 2, zone_name: 'Zone B', present_workers: 50},
    {shift_id: 2, zone_code: 1, zone_name: 'Zone A', present_workers: 35},
  ],
  ward_wise_attendance: [
    {shift_id: 1, ward_code: 101, ward_name: 'Ward 101', present_workers: 20, absent_workers: 3, on_leave_workers: 1},
    {shift_id: 1, ward_code: 102, ward_name: 'Ward 102', present_workers: 15, absent_workers: 2, on_leave_workers: 1},
  ],
  late_workers: [
    {worker_name: 'Ramesh Kumar', ward_code: 101, shift_name: 'Shift 1', attendance_time: '2026-09-30T06:45:00Z'},
    {worker_name: 'Sita Devi', ward_code: 102, shift_name: 'Shift 1', attendance_time: null},
  ],
  lowest_3_wards: [
    {
      ward_code: 105,
      ward_name: 'Ward 105',
      zone_name: 'Zone C',
      supervisor_name: null,
      percentage: 60,
      present_workers: 6,
      total_workers: 10,
    },
    {
      ward_code: 106,
      ward_name: 'Ward 106',
      zone_name: 'Zone C',
      supervisor_name: 'Anita Rawat',
      percentage: 80,
      present_workers: 8,
      total_workers: 10,
    },
    {
      ward_code: 107,
      ward_name: 'Ward 107',
      zone_name: 'Zone B',
      supervisor_name: 'Deepak Singh',
      percentage: 92,
      present_workers: 11,
      total_workers: 12,
    },
  ],
};

describe('shiftStateLabel', () => {
  it('is yet to start before the window opens', () => {
    expect(shiftStateLabel(1, new Date(2026, 8, 30, 5, 0))).toBe('Yet to start');
  });

  it('is in progress inside the window', () => {
    expect(shiftStateLabel(1, new Date(2026, 8, 30, 7, 0))).toBe('In progress');
  });

  it('is closed after the window ends', () => {
    expect(shiftStateLabel(1, new Date(2026, 8, 30, 11, 0))).toBe('Closed');
  });
});

describe('mapShiftCards', () => {
  it('maps shift metadata used by the shift-selector pills', () => {
    expect(mapShiftCards(RAW, new Date(2026, 8, 30, 7, 0))).toEqual([
      {shiftId: 1, name: 'Shift 1', window: '06:00–10:00', icon: 'wb-sunny', state: 'In progress'},
      {shiftId: 2, name: 'Shift 2', window: '14:00–18:00', icon: 'wb-twilight', state: 'Yet to start'},
    ]);
  });
});

describe('mapShiftKpiRows', () => {
  it('maps the KPI card\'s compact present/absent/leave table', () => {
    const rows = mapShiftKpiRows(RAW, new Date(2026, 8, 30, 7, 0));
    expect(rows).toEqual([
      {
        shiftId: 1,
        name: 'Shift 1',
        icon: 'wb-sunny',
        iconColor: ac.blue,
        stateColor: ac.blue, // In progress
        inN: 90,
        inPct: '75.3%',
        absN: 20,
        absPct: '16.7%',
        lvN: 10,
      },
      {
        shiftId: 2,
        name: 'Shift 2',
        icon: 'wb-twilight',
        iconColor: ac.yellowDark,
        stateColor: ac.grey400, // Yet to start
        inN: 80,
        inPct: '66.7%',
        absN: 30,
        absPct: '25%',
        lvN: 10,
      },
    ]);
  });
});

describe('mapZoneSplit', () => {
  it('splits present workers by zone for the given shift, colored in a fixed order', () => {
    expect(mapZoneSplit(RAW, 1)).toEqual({
      total: 90,
      unit: 'checkIns',
      slices: [
        {name: 'Zone A', zoneCode: '1', value: 40, pct: 44.4, color: ac.blue},
        {name: 'Zone B', zoneCode: '2', value: 50, pct: 55.6, color: ac.red},
      ],
    });
  });
});

describe('mapAttendanceSplit', () => {
  it('derives on-time/late/absent/on-leave from ward rows and late_workers', () => {
    // Shift 1 ward rows: present 20+15=35, absent 3+2=5, onLeave 1+1=2.
    // late_workers for 'Shift 1': Ramesh + Sita = 2 late, so onTime = 35-2=33.
    expect(mapAttendanceSplit(RAW, 1)).toEqual({
      total: 42,
      unit: 'workers',
      slices: [
        {key: 'onTime', value: 33, pct: 78.6, color: ac.green},
        {key: 'late', value: 2, pct: 4.8, color: ac.yellow},
        {key: 'absent', value: 5, pct: 11.9, color: ac.red},
        {key: 'onLeave', value: 2, pct: 4.8, color: ac.silver},
      ],
    });
  });
});

describe('mapLowestWards', () => {
  it('ranks, rounds percentage and tones each ward, nulling missing supervisors', () => {
    expect(mapLowestWards(RAW)).toEqual([
      {
        rank: 1,
        wardCode: '105',
        wardName: 'Ward 105',
        zoneName: 'Zone C',
        supervisorName: null,
        pct: 60,
        present: 6,
        total: 10,
        tone: 'red',
      },
      {
        rank: 2,
        wardCode: '106',
        wardName: 'Ward 106',
        zoneName: 'Zone C',
        supervisorName: 'Anita Rawat',
        pct: 80,
        present: 8,
        total: 10,
        tone: 'yellow',
      },
      {
        rank: 3,
        wardCode: '107',
        wardName: 'Ward 107',
        zoneName: 'Zone B',
        supervisorName: 'Deepak Singh',
        pct: 92,
        present: 11,
        total: 12,
        tone: 'neutral',
      },
    ]);
  });
});

describe('mapDashboard', () => {
  it('gives department_head the zone-grouped split', () => {
    const dash = mapDashboard(RAW, 'department_head', {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
    expect(dash.totalWorkers).toBe(120);
    expect(dash.split.unit).toBe('checkIns');
    expect(dash.split.slices[0].name).toBe('Zone A');
    expect(dash.lowest).toHaveLength(3);
  });

  it('gives csi the same attendance-status split as sanitary_inspector', () => {
    const csiDash = mapDashboard(RAW, 'csi', {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
    const siDash = mapDashboard(RAW, 'sanitary_inspector', {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
    expect(csiDash.split.unit).toBe('workers');
    expect(csiDash.split.slices.map(s => s.key)).toEqual(['onTime', 'late', 'absent', 'onLeave']);
    expect(siDash.split).toEqual(csiDash.split);
  });

  it('gives every role the same lowest-wards list shape', () => {
    const roles = ['department_head', 'csi', 'sanitary_inspector'];
    roles.forEach(role => {
      const dash = mapDashboard(RAW, role, {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
      expect(dash.lowest).toHaveLength(3);
      expect(dash.shiftKpiRows).toHaveLength(2);
    });
  });
});
