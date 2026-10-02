import {
  mapDashboard,
  mapHeader,
  mapLowestWards,
  mapMonthlyChart,
  mapRollKpi,
  mapShiftCards,
  mapSiSplit,
  mapSiWardsAtGlance,
  mapWeeklyChart,
  mapWorkersNeedingALook,
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
  weekly_attendance: [
    {week_start_date: '2026-09-21', total_attendance: 88},
    {week_start_date: '2026-09-28', total_attendance: 92},
  ],
  monthly_attendance: [
    {month: '2026-08', total_attendance: 2500},
    {month: '2026-09', total_attendance: 2700},
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

describe('mapRollKpi', () => {
  it('shows wards and zones for department_head/csi', () => {
    expect(mapRollKpi(RAW, 'department_head')).toEqual({value: '120', subtitle: '12 wards · 3 zones'});
  });

  it('shows only wards for sanitary_inspector', () => {
    expect(mapRollKpi(RAW, 'sanitary_inspector')).toEqual({value: '120', subtitle: '12 wards'});
  });
});

describe('mapShiftCards', () => {
  it('maps each shift with its window, icon and rounded percentages', () => {
    const cards = mapShiftCards(RAW, new Date(2026, 8, 30, 7, 0));
    expect(cards).toEqual([
      {
        shiftId: 1,
        name: 'Shift 1',
        window: '06:00–10:00',
        icon: 'wb-sunny',
        state: 'In progress',
        present: 90,
        presentPct: 75.3,
        absent: 20,
        absentPct: 16.7,
        onLeave: 10,
        leavePct: 8.3,
      },
      {
        shiftId: 2,
        name: 'Shift 2',
        window: '14:00–18:00',
        icon: 'wb-twilight',
        state: 'Yet to start',
        present: 80,
        presentPct: 66.7,
        absent: 30,
        absentPct: 25,
        onLeave: 10,
        leavePct: 8.3,
      },
    ]);
  });
});

describe('mapWeeklyChart / mapMonthlyChart', () => {
  it('formats weekly points as short dates and flags the last point', () => {
    expect(mapWeeklyChart(RAW)).toEqual([
      {label: '21 Sep', value: 88, emphasized: false},
      {label: '28 Sep', value: 92, emphasized: true},
    ]);
  });

  it('formats monthly points as short months and flags the last point', () => {
    expect(mapMonthlyChart(RAW)).toEqual([
      {label: 'Aug', value: 2500, emphasized: false},
      {label: 'Sep', value: 2700, emphasized: true},
    ]);
  });
});

describe('mapZoneSplit', () => {
  it('splits present workers by zone for the given shift', () => {
    expect(mapZoneSplit(RAW, 1)).toEqual({
      total: 90,
      unit: 'present',
      slices: [
        {name: 'Zone A', zoneCode: '1', value: 40, pct: 44.4},
        {name: 'Zone B', zoneCode: '2', value: 50, pct: 55.6},
      ],
    });
  });
});

describe('mapSiSplit', () => {
  it('derives on-time/late/absent/on-leave from ward rows and late_workers', () => {
    // Shift 1 ward rows: present 20+15=35, absent 3+2=5, onLeave 1+1=2.
    // late_workers for 'Shift 1': Ramesh + Sita = 2 late, so onTime = 35-2=33.
    expect(mapSiSplit(RAW, 1)).toEqual({
      total: 42,
      slices: [
        {key: 'onTime', value: 33, pct: 78.6},
        {key: 'late', value: 2, pct: 4.8},
        {key: 'absent', value: 5, pct: 11.9},
        {key: 'onLeave', value: 2, pct: 4.8},
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

describe('mapSiWardsAtGlance', () => {
  it('uses the single ward name as the title when the SI has one ward', () => {
    const raw = {...RAW, ward_wise_attendance: [RAW.ward_wise_attendance[0]]};
    expect(mapSiWardsAtGlance(raw, new Date(2026, 8, 30, 7, 0)).title).toBe('Ward 101');
  });

  it('falls back to a generic title across multiple wards', () => {
    expect(mapSiWardsAtGlance(RAW, new Date(2026, 8, 30, 7, 0)).title).toBe('Your wards at a glance');
  });
});

describe('mapWorkersNeedingALook', () => {
  it('maps late workers with initials and a trimmed time', () => {
    expect(mapWorkersNeedingALook(RAW)).toEqual([
      {name: 'Ramesh Kumar', initials: 'RK', wardCode: '101', shiftName: 'Shift 1', time: '06:45'},
      {name: 'Sita Devi', initials: 'SD', wardCode: '102', shiftName: 'Shift 1', time: null},
    ]);
  });
});

describe('mapHeader', () => {
  it('titles department_head as an all-zones overview', () => {
    expect(mapHeader(RAW, 'department_head')).toEqual({
      title: 'Attendance overview',
      scopeLabel: 'All zones',
      subtitle: '12 wards · 120 workers',
    });
  });

  it('titles csi by its single zone name', () => {
    const raw = {...RAW, shift_zone_attendance: RAW.shift_zone_attendance.filter(r => r.zone_name === 'Zone A')};
    expect(mapHeader(raw, 'csi')).toEqual({
      title: 'Zone A',
      scopeLabel: 'Zone A',
      subtitle: '12 wards · 120 workers',
    });
  });

  it('titles sanitary_inspector by its real ward(s), not a mock fallback', () => {
    expect(mapHeader(RAW, 'sanitary_inspector')).toEqual({
      title: 'Your wards',
      scopeLabel: 'Your wards',
      subtitle: '12 wards · 120 workers',
    });
  });
});

describe('mapDashboard', () => {
  it('builds the department_head/csi shape with a zone split and lowest-wards panel', () => {
    const dash = mapDashboard(RAW, 'department_head', {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
    expect(dash.roll).toEqual({value: '120', subtitle: '12 wards · 3 zones'});
    expect(dash.split.unit).toBe('present');
    expect(dash.rightPanel.type).toBe('lowestWards');
    expect(dash.rightPanel.items).toHaveLength(3);
    expect(dash.workersNeedingALook).toBeUndefined();
  });

  it('builds the sanitary_inspector shape with an attendance split and wards-at-a-glance panel', () => {
    const dash = mapDashboard(RAW, 'sanitary_inspector', {shiftId: 1, now: new Date(2026, 8, 30, 7, 0)});
    expect(dash.roll).toEqual({value: '120', subtitle: '12 wards'});
    expect(dash.split.slices).toHaveLength(4);
    expect(dash.rightPanel.type).toBe('wardsAtAGlance');
    expect(dash.workersNeedingALook).toHaveLength(2);
  });
});
