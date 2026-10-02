// One reusable zone/ward filter shared by every admin screen (Dashboard,
// Worker Records, Ward Map — spec §2.4): Department Head gets a zone
// dropdown, CSI gets a ward dropdown scoped to their own zone(s), and
// Sanitary Inspector gets a ward dropdown built straight from their own
// scope with no directory call at all. Each screen owns its own instance and
// decides what to do with the selected value (sent to the server, or applied
// client-side) — this hook only owns the dropdown's options and selection.
import {useEffect, useState} from 'react';
import {primaryFilterFor, siWardOptions} from './domain/adminAuth';
import {fetchZoneWardList} from './adminSession';

export function useZoneWardFilter(user) {
  const kind = primaryFilterFor(user.role); // 'zone' | 'ward'
  const isSi = user.role === 'sanitary_inspector';
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(!isSi);
  const [value, setValue] = useState(null); // selected code, or null = everything in scope

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

  let options;
  if (isSi) {
    options = siWardOptions(user.scope).map(code => ({value: code, label: `Ward ${code}`}));
  } else if (kind === 'zone') {
    options = zones.map(z => ({value: z.zoneCode, label: z.zoneName}));
  } else {
    const inScope = z => user.scope.zoneIds === 'all' || user.scope.zoneIds.includes(z.zoneCode);
    options = zones.filter(inScope).flatMap(z => z.wards.map(w => ({value: w.wardCode, label: w.wardName})));
  }

  return {kind, options, loading, value, setValue};
}
