import {WORKERS_PAGE_SIZE, filterWorkers, initialsOf, mapWorkerRows, pageSlice} from '../src/domain/adminWorkers';

const RAW = {
  date: '2026-09-10',
  total_workers: 3,
  workers: [
    {
      worker_id: 1,
      worker_name: 'Ramesh Kumar',
      ward_code: '101',
      ward_name: 'Ward 101',
      zone_code: '1',
      designation: 'Safai karmi',
      shift_1_status: 'Present',
      shift_1_geofencing_status: 'Inside',
      shift_1_captured_photo_url: 'https://example.com/a.jpg',
      shift_1_punctuality_status: 'Late',
      shift_1_attendance_time: '2026-09-10T06:12:00',
      shift_2_status: 'Not Marked',
      shift_2_geofencing_status: null,
      shift_2_captured_photo_url: null,
      shift_2_punctuality_status: null,
      shift_2_attendance_time: null,
    },
    {
      worker_id: 2,
      worker_name: 'Sita Devi',
      ward_code: '102',
      ward_name: 'Ward 102',
      zone_code: '1',
      designation: 'Helper',
      shift_1_status: 'Absent',
      shift_1_geofencing_status: 'Outside',
      shift_1_captured_photo_url: null,
      shift_1_punctuality_status: null,
      shift_1_attendance_time: null,
      shift_2_status: 'Present',
      shift_2_geofencing_status: 'Outside Ward',
      shift_2_captured_photo_url: 'https://example.com/b.jpg',
      shift_2_punctuality_status: 'On-Time',
      shift_2_attendance_time: '2026-09-10T14:05:00',
    },
    {
      worker_id: 3,
      worker_name: 'Deepak Singh',
      ward_code: '103',
      ward_name: 'Ward 103',
      zone_code: '2',
      designation: 'Driver',
      shift_1_status: 'On Leave',
      shift_1_geofencing_status: null,
      shift_1_captured_photo_url: null,
      shift_1_punctuality_status: null,
      shift_1_attendance_time: null,
      shift_2_status: 'On Leave',
      shift_2_geofencing_status: null,
      shift_2_captured_photo_url: null,
      shift_2_punctuality_status: null,
      shift_2_attendance_time: null,
    },
  ],
};

describe('initialsOf', () => {
  it('uses every word\'s first letter, uppercased', () => {
    expect(initialsOf('ramesh kumar')).toBe('RK');
    expect(initialsOf('Deepak Kumar Singh')).toBe('DKS');
    expect(initialsOf('')).toBe('');
  });
});

describe('mapWorkerRows', () => {
  const rows = mapWorkerRows(RAW);

  it('maps basic fields and initials', () => {
    expect(rows[0]).toMatchObject({
      workerId: '1',
      name: 'Ramesh Kumar',
      initials: 'RK',
      wardCode: '101',
      wardName: 'Ward 101',
      zoneCode: '1',
      designation: 'Safai karmi',
    });
  });

  it('maps a present+inside+late+photo shift cell', () => {
    expect(rows[0].shift1).toEqual({
      status: 'present',
      statusLabel: 'Present',
      location: 'inside_fence',
      locationLabel: 'Inside fence',
      hasPhoto: true,
      photoUrl: 'https://example.com/a.jpg',
      isLate: true,
      attendanceTime: '06:12',
    });
  });

  it('maps a not-marked, null-geofencing shift cell', () => {
    expect(rows[0].shift2).toEqual({
      status: 'not_marked',
      statusLabel: 'Not marked',
      location: 'not_applicable',
      locationLabel: 'Not marked',
      hasPhoto: false,
      photoUrl: null,
      isLate: false,
      attendanceTime: null,
    });
  });

  it('maps absent (ignores geofencing status) and present-but-not-inside (raw label text)', () => {
    expect(rows[1].shift1).toMatchObject({
      status: 'absent',
      location: 'not_verified',
      locationLabel: 'No capture',
    });
    expect(rows[1].shift2).toMatchObject({
      status: 'present',
      location: 'not_verified',
      locationLabel: 'Outside Ward fence',
      isLate: false,
      attendanceTime: '14:05',
    });
  });

  it('maps on_leave to not_applicable / leave label on both shifts', () => {
    expect(rows[2].shift1).toMatchObject({status: 'on_leave', location: 'not_applicable', locationLabel: 'Leave — n/a'});
    expect(rows[2].shift2).toMatchObject({status: 'on_leave', location: 'not_applicable', locationLabel: 'Leave — n/a'});
  });
});

describe('filterWorkers', () => {
  const rows = mapWorkerRows(RAW);

  it('filters by ward code, taking precedence over zone', () => {
    expect(filterWorkers(rows, {wardCode: '102', zoneCode: '2'}).map(w => w.workerId)).toEqual(['2']);
  });

  it('filters by zone code when no ward is selected', () => {
    expect(filterWorkers(rows, {zoneCode: '1'}).map(w => w.workerId)).toEqual(['1', '2']);
  });

  it('filters by status matching either shift', () => {
    expect(filterWorkers(rows, {status: 'present'}).map(w => w.workerId)).toEqual(['1', '2']);
    expect(filterWorkers(rows, {status: 'on_leave'}).map(w => w.workerId)).toEqual(['3']);
  });

  it('filters by the isLate flag, not the status field', () => {
    expect(filterWorkers(rows, {status: 'late'}).map(w => w.workerId)).toEqual(['1']);
  });

  it('filters by a case-insensitive name or worker id substring', () => {
    expect(filterWorkers(rows, {search: 'sita'}).map(w => w.workerId)).toEqual(['2']);
    expect(filterWorkers(rows, {search: '3'}).map(w => w.workerId)).toEqual(['3']);
  });

  it('returns everything when no filter is set', () => {
    expect(filterWorkers(rows, {})).toHaveLength(3);
    expect(filterWorkers(rows)).toHaveLength(3);
  });
});

describe('pageSlice', () => {
  it('returns the first N pages worth of rows', () => {
    const rows = Array.from({length: 120}, (_, i) => i);
    expect(pageSlice(rows, 1, 50)).toHaveLength(50);
    expect(pageSlice(rows, 2, 50)).toHaveLength(100);
    expect(pageSlice(rows, 3, 50)).toHaveLength(120);
  });

  it('defaults to the spec\'s 50-row page size', () => {
    const rows = Array.from({length: 60}, (_, i) => i);
    expect(pageSlice(rows, 1)).toHaveLength(WORKERS_PAGE_SIZE);
  });
});
