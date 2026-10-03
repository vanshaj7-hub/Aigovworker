import {
  buildGenerateRequest,
  datePresetRange,
  filenameFromUrl,
  formatScopePart,
  isStoragePermissionError,
  mapRecentReports,
  shortDisplayDate,
} from '../src/domain/adminReports';

describe('shortDisplayDate', () => {
  it('formats a YYYY-MM-DD key as "D Mon YYYY", parsed in local time', () => {
    expect(shortDisplayDate('2026-09-05')).toBe('5 Sep 2026');
  });
});

describe('datePresetRange', () => {
  it('today is from=to=today', () => {
    const today = new Date(2026, 8, 10); // Thu 10 Sep 2026
    expect(datePresetRange('today', today)).toEqual({from: '2026-09-10', to: '2026-09-10'});
  });

  it('thisWeek is Monday of the current week through today', () => {
    const thursday = new Date(2026, 8, 10); // Thu
    expect(datePresetRange('thisWeek', thursday)).toEqual({from: '2026-09-07', to: '2026-09-10'});
  });

  it('thisWeek on a Sunday goes back 6 days to the prior Monday', () => {
    const sunday = new Date(2026, 8, 13); // Sun
    expect(datePresetRange('thisWeek', sunday)).toEqual({from: '2026-09-07', to: '2026-09-13'});
  });

  it('thisMonth is the 1st of the current month through today', () => {
    const today = new Date(2026, 8, 10);
    expect(datePresetRange('thisMonth', today)).toEqual({from: '2026-09-01', to: '2026-09-10'});
  });

  it('custom returns null — caller keeps whatever dates are already picked', () => {
    expect(datePresetRange('custom', new Date(2026, 8, 10))).toBeNull();
  });
});

describe('formatScopePart', () => {
  it('passes a string through as-is', () => {
    expect(formatScopePart('All Zones', 'Zone')).toBe('All Zones');
  });

  it('formats an empty array as "All <Kind>s"', () => {
    expect(formatScopePart([], 'Zone')).toBe('All Zones');
  });

  it('formats a single code (bare or one-element array) as "<Kind> <code>"', () => {
    expect(formatScopePart(3, 'Zone')).toBe('Zone 3');
    expect(formatScopePart(['3'], 'Zone')).toBe('Zone 3');
  });

  it('formats multiple codes as "<Kind>s <c1>, <c2>, ..."', () => {
    expect(formatScopePart(['3', '4'], 'Ward')).toBe('Wards 3, 4');
  });
});

describe('mapRecentReports', () => {
  it('maps range, scope, when, and format', () => {
    const raw = {
      reports: [
        {
          report_id: 7,
          date_range: {from: '2026-09-01', to: '2026-09-01'},
          scope: {zones: 'All Zones', wards: []},
          generated_at: '2026-09-01T10:15:00',
          format: 'pdf',
          file_url: 'https://x.firebasestorage.app/reports/7.pdf',
        },
        {
          report_id: 8,
          date_range: {from: '2026-09-01', to: '2026-09-07'},
          scope: {zones: ['1'], wards: ['12', '13']},
          generated_at: '2026-09-07T18:00:00',
          format: 'csv',
          file_url: 'https://x.firebasestorage.app/reports/8.csv',
        },
      ],
    };
    expect(mapRecentReports(raw)).toEqual([
      {id: 7, range: '1 Sep 2026', scope: 'All Zones · All Wards', when: '1 Sep 2026 · 10:15', format: 'pdf', fileUrl: raw.reports[0].file_url},
      {
        id: 8,
        range: '1 Sep 2026 – 7 Sep 2026',
        scope: 'Zone 1 · Wards 12, 13',
        when: '7 Sep 2026 · 18:00',
        format: 'csv',
        fileUrl: raw.reports[1].file_url,
      },
    ]);
  });

  it('returns an empty list when there are no reports', () => {
    expect(mapRecentReports({reports: []})).toEqual([]);
    expect(mapRecentReports({})).toEqual([]);
  });
});

describe('buildGenerateRequest', () => {
  it('omits zoneCodes/wardCodes entirely when no filter is selected', () => {
    const req = buildGenerateRequest({
      email: 'a@b.com',
      fromDate: '2026-09-01',
      toDate: '2026-09-07',
      primaryFilter: 'zone',
      filterValue: null,
      format: 'csv',
    });
    expect(req.zoneCodes).toBeUndefined();
    expect(req.wardCodes).toBeUndefined();
  });

  it('sets only the key matching the primary filter when a value is selected', () => {
    const zoneReq = buildGenerateRequest({
      email: 'a@b.com',
      fromDate: '2026-09-01',
      toDate: '2026-09-07',
      primaryFilter: 'zone',
      filterValue: '3',
      format: 'pdf',
    });
    expect(zoneReq.zoneCodes).toEqual(['3']);
    expect(zoneReq.wardCodes).toBeUndefined();

    const wardReq = buildGenerateRequest({
      email: 'a@b.com',
      fromDate: '2026-09-01',
      toDate: '2026-09-07',
      primaryFilter: 'ward',
      filterValue: '12',
      format: 'csv',
    });
    expect(wardReq.wardCodes).toEqual(['12']);
    expect(wardReq.zoneCodes).toBeUndefined();
  });
});

describe('isStoragePermissionError', () => {
  it('matches the documented storage/service-account error patterns', () => {
    expect(isStoragePermissionError('storage.googleapis.com returned 403')).toBe(true);
    expect(isStoragePermissionError('service account xyz@my-project.gserviceaccount.com lacks access')).toBe(true);
    expect(isStoragePermissionError('storage.objects.get denied')).toBe(true);
  });

  it('does not match an unrelated error', () => {
    expect(isStoragePermissionError('Request failed (500).')).toBe(false);
  });
});

describe('filenameFromUrl', () => {
  it('takes the last path segment, decoded and without a query string', () => {
    expect(filenameFromUrl('https://x.firebasestorage.app/reports/Daily%20report.pdf?alt=media&token=abc')).toBe(
      'Daily report.pdf',
    );
  });

  it('falls back to a generic name when the url is unparseable', () => {
    expect(filenameFromUrl(null)).toBe('report');
  });

  it('replaces characters a filesystem cannot store in a filename', () => {
    expect(filenameFromUrl('https://x.firebasestorage.app/reports/Report%2010:30:00.csv')).toBe('Report 10_30_00.csv');
  });
});
