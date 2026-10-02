// One reusable zone/ward filter shared by every admin screen (Dashboard,
// Worker Records, Ward Map, Reports — spec §2.4). Department Head gets a
// zone dropdown, CSI a ward dropdown scoped to their own zone(s), and
// Sanitary Inspector a ward dropdown built straight from their own scope
// with no directory call at all.
//
// Dashboard/Reports each show one pill — whichever the role's primaryFilter
// is (`kind`/`value`/`setValue`, unchanged). Worker Records' design shows a
// Zone pill AND a Ward pill together (its own, richer drill-down), so this
// hook also exposes both independently: `zoneOptions`/`zoneValue`/
// `setZoneValue` and `wardOptions`/`wardValue`/`setWardValue`, with the ward
// list narrowing to the selected zone when one is picked (and resetting on
// a new zone pick, same as the original spec's single-pill behavior).
import {useEffect, useState} from 'react';
import {primaryFilterFor, siWardOptions} from './domain/adminAuth';
import {fetchZoneWardList} from './adminSession';

export function useZoneWardFilter(user) {
  const kind = primaryFilterFor(user.role); // 'zone' | 'ward'
  const isSi = user.role === 'sanitary_inspector';
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(!isSi);
  const [zoneValue, setZoneValueRaw] = useState(null);
  const [wardValue, setWardValue] = useState(null);

  useEffect(() => {
    if (isSi) {
      return undefined;
    }
    let alive = true;
    setLoading(true);
    fetchZoneWardList(user)
      .then(list => alive && setZones(list))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email, user.role]);

  const setZoneValue = next => {
    setZoneValueRaw(next);
    setWardValue(null); // narrowing (or clearing) the zone resets any ward pick
  };

  // SI has no zone dropdown at all — its scope is wards, not zones.
  const zoneOptions = isSi ? [] : zones.map(z => ({value: z.zoneCode, label: z.zoneName}));

  let wardOptions;
  if (isSi) {
    wardOptions = siWardOptions(user.scope).map(code => ({value: code, label: `Ward ${code}`}));
  } else {
    const inScope = z => user.scope.zoneIds === 'all' || user.scope.zoneIds.includes(z.zoneCode);
    const scopedZones = zones.filter(inScope);
    const relevantZones = zoneValue ? scopedZones.filter(z => z.zoneCode === zoneValue) : scopedZones;
    wardOptions = relevantZones.flatMap(z => z.wards.map(w => ({value: w.wardCode, label: w.wardName})));
  }

  const value = kind === 'zone' ? zoneValue : wardValue;
  const setValue = kind === 'zone' ? setZoneValue : setWardValue;
  const options = kind === 'zone' ? zoneOptions : wardOptions;

  return {
    kind,
    value,
    setValue,
    options,
    loading,
    zoneOptions,
    zoneValue,
    setZoneValue,
    wardOptions,
    wardValue,
    setWardValue,
  };
}
