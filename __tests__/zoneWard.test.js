import {normalizeZoneWardList} from '../src/domain/zoneWard';

describe('normalizeZoneWardList', () => {
  it('maps zones and their wards, stringifying codes', () => {
    const raw = {
      data: [
        {zone_code: '1', zone_name: 'Zone 1', wards: [{ward_code: 1, ward_name: 'Ward 1'}]},
        {
          zone_code: '2',
          zone_name: 'Zone 2',
          wards: [
            {ward_code: 2, ward_name: 'Ward 2'},
            {ward_code: 3, ward_name: 'Ward 3'},
          ],
        },
      ],
    };
    expect(normalizeZoneWardList(raw)).toEqual([
      {zoneCode: '1', zoneName: 'Zone 1', wards: [{wardCode: '1', wardName: 'Ward 1'}]},
      {
        zoneCode: '2',
        zoneName: 'Zone 2',
        wards: [
          {wardCode: '2', wardName: 'Ward 2'},
          {wardCode: '3', wardName: 'Ward 3'},
        ],
      },
    ]);
  });

  it('returns an empty list for a missing or empty data array', () => {
    expect(normalizeZoneWardList({data: []})).toEqual([]);
    expect(normalizeZoneWardList({})).toEqual([]);
  });
});
