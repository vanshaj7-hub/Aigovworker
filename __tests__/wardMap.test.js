import {
  attentionWindowDays,
  heatColor,
  mapAttentionList,
  mapSummary,
  mapWardCell,
  mapWardMap,
  mapZoneGroup,
  mapZones,
  rankedWards,
  wardFlag,
} from '../src/domain/wardMap';

const RAW = {
  from_date: '2026-09-01',
  to_date: '2026-09-07',
  summary: {wards_above_90: 5, wards_80_to_90: 3, wards_below_80: 2, wards_no_attendance: 1},
  continuous_low_attendance: [
    {
      zone_code: '1',
      zone_name: 'Zone 1',
      ward_code: '12',
      ward_name: 'Ward 12',
      supervisor_id: null,
      supervisor_name: null,
      continuous_low_attendance_from: '2026-08-25',
      continuous_low_attendance_to: '2026-09-07',
    },
  ],
  zones: [
    {
      zone_code: '1',
      zone_name: 'Zone 1',
      wards: [
        {
          ward_code: '11',
          ward_name: 'Ward 11',
          supervisor_id: 5,
          supervisor_name: 'Anita Rawat',
          average_attendance_percentage: 92.4,
          total_present: 46,
          total_expected: 50,
          shifts: [
            {shift_id: 1, start_time: '06:00', end_time: '10:00', average_attendance_percentage: 94, total_present: 47, total_expected: 50},
            {shift_id: 2, start_time: '14:00', end_time: '18:00', average_attendance_percentage: 90.8, total_present: 45, total_expected: 50},
          ],
        },
        {
          ward_code: '12',
          ward_name: 'Ward 12',
          supervisor_id: null,
          supervisor_name: null,
          average_attendance_percentage: 0,
          total_present: 0,
          total_expected: 20,
          shifts: [],
        },
      ],
    },
  ],
};

describe('mapWardCell', () => {
  const ward = RAW.zones[0].wards[0];

  it('uses the combined percentage for "both"', () => {
    expect(mapWardCell(ward, 'both')).toMatchObject({pct: 92, shift1Pct: 94, shift2Pct: 91});
  });

  it('uses the matching shift entry when a specific shift is selected', () => {
    expect(mapWardCell(ward, 1).pct).toBe(94);
    expect(mapWardCell(ward, 2).pct).toBe(91);
  });

  it('falls back to the combined percentage when the shift entry is missing', () => {
    const noShift = RAW.zones[0].wards[1];
    expect(mapWardCell(noShift, 1).pct).toBe(0);
  });

  it('flags noAttendance only when there were expected workers and zero present', () => {
    expect(mapWardCell(RAW.zones[0].wards[1]).noAttendance).toBe(true);
    expect(mapWardCell(ward).noAttendance).toBe(false);
  });

  it('computes absentCount as max(0, expected - present)', () => {
    expect(mapWardCell(ward).absentCount).toBe(4);
  });
});

describe('mapZoneGroup / mapZones', () => {
  it('builds a wardRange string and the zone\'s own average of rounded cell pcts', () => {
    const group = mapZoneGroup(RAW.zones[0], 'both');
    expect(group).toMatchObject({zoneId: '1', name: 'Zone 1', wardRange: '2 wards'});
    // cells: 92, 0 -> avg 46
    expect(group.avgPct).toBe(46);
  });

  it('maps every zone in the raw response', () => {
    expect(mapZones(RAW)).toHaveLength(1);
  });
});

describe('mapAttentionList', () => {
  it('looks up each row\'s percentage from the matching ward, not the row itself', () => {
    expect(mapAttentionList(RAW)).toEqual([
      {wardNumber: 12, wardName: 'Ward 12', zone: 'Zone 1', supervisor: 'Vacant', presentPct: 0},
    ]);
  });
});

describe('mapSummary', () => {
  it('passes the backend\'s band counts through verbatim', () => {
    expect(mapSummary(RAW)).toEqual({above90: 5, between80and90: 3, below80: 2, wardsNotReporting: 1});
  });
});

describe('attentionWindowDays', () => {
  it('counts whole days inclusive, parsed in local time', () => {
    expect(attentionWindowDays('2026-09-01', '2026-09-07')).toBe(7);
    expect(attentionWindowDays('2026-09-01', '2026-09-01')).toBe(1);
  });
});

describe('heatColor', () => {
  it('is pure red at 0% and pure green at 100%', () => {
    expect(heatColor(0).bg).toBe('rgb(234, 67, 53)');
    expect(heatColor(100).bg).toBe('rgb(52, 168, 83)');
  });

  it('pivots through yellow at 80%', () => {
    expect(heatColor(80).bg).toBe('rgb(251, 188, 4)');
  });

  it('clamps out-of-range input', () => {
    expect(heatColor(150)).toEqual(heatColor(100));
    expect(heatColor(-10)).toEqual(heatColor(0));
  });

  it('picks a readable text color from perceived luminance', () => {
    // Both endpoint colors are mid-brightness enough to read best with white
    // text; the bright yellow pivot at 80% is the one that needs dark text.
    expect(heatColor(100).text).toBe('#FFFFFF');
    expect(heatColor(0).text).toBe('#FFFFFF');
    expect(heatColor(80).text).toBe('#202124');
  });
});

describe('wardFlag', () => {
  it('prioritizes vacant supervisor over everything else', () => {
    expect(wardFlag({supervisorName: null, noAttendance: true, pct: 10})).toBe('vacantSupervisor');
  });

  it('flags noAttendance next', () => {
    expect(wardFlag({supervisorName: 'A', noAttendance: true, pct: 50})).toBe('noAttendance');
  });

  it('flags a low percentage last', () => {
    expect(wardFlag({supervisorName: 'A', noAttendance: false, pct: 70})).toBe('lowPct');
  });

  it('is null when nothing is wrong', () => {
    expect(wardFlag({supervisorName: 'A', noAttendance: false, pct: 95})).toBeNull();
  });
});

describe('rankedWards', () => {
  it('flattens and sorts every ward ascending by pct, worst first', () => {
    const zones = mapZones(RAW, 'both');
    const ranked = rankedWards(zones);
    expect(ranked.map(w => w.wardNumber)).toEqual([12, 11]);
    expect(ranked.map(w => w.rank)).toEqual([1, 2]);
  });
});

describe('mapWardMap', () => {
  it('combines everything into one view model', () => {
    const dash = mapWardMap(RAW, 'both');
    expect(dash.fromDate).toBe('2026-09-01');
    expect(dash.attentionWindowDays).toBe(7);
    expect(dash.zones).toHaveLength(1);
    expect(dash.ranked).toHaveLength(2);
    expect(dash.summary.above90).toBe(5);
  });
});
