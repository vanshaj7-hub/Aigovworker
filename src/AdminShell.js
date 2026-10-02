// Top-level screen tree for a signed-in admin (Department Head / CSI /
// Sanitary Inspector) — the admin counterpart to Shell in App.js. Mounted
// only once AppRoot has confirmed there is no supervisor session to show
// instead, so it never runs alongside (or interferes with) Shell.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, Pressable, StyleSheet, Text, ToastAndroid, View} from 'react-native';
import {ac} from './adminTheme';
import {useLang} from './i18n';
import {Icon} from './ui';
import {dateKey} from './domain/shifts';
import {
  adminSignOut,
  fetchAdminDashboard,
  fetchAdminWorkers,
  fetchRecentReports,
  fetchWardAttendanceReport,
} from './adminSession';
import {useZoneWardFilter} from './useZoneWardFilter';
import AdminChangePasswordScreen from './screens/AdminChangePasswordScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';
import AdminWorkerRecordsScreen from './screens/AdminWorkerRecordsScreen';
import AdminWorkerDetailScreen from './screens/AdminWorkerDetailScreen';
import AdminWardMapScreen from './screens/AdminWardMapScreen';
import AdminReportsScreen from './screens/AdminReportsScreen';

const NETWORK_FALLBACK = 'Could not reach the server. Check your connection and try again.';

function AdminTabBar({screen, onChange, showWardMap}) {
  const {t: tr} = useLang();
  const items = [
    {key: 'dashboard', icon: 'dashboard', label: tr('navDashboard')},
    {key: 'workers', icon: 'groups', label: tr('navWorkers')},
    ...(showWardMap ? [{key: 'wardMap', icon: 'map', label: tr('navWardMap')}] : []),
    {key: 'reports', icon: 'description', label: tr('reports')},
  ];
  return (
    <View style={s.tabBar}>
      {items.map(item => {
        const active = screen === item.key || (item.key === 'workers' && screen === 'workerDetail');
        return (
          <Pressable key={item.key} onPress={() => onChange(item.key)} style={s.tabItem} hitSlop={6}>
            <Icon name={item.icon} size={22} color={active ? ac.blue : ac.grey700} />
            <Text style={[s.tabLabel, active && {color: ac.blue, fontWeight: '500'}]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AdminShell({user: initialUser, onSignedOut}) {
  const {t: tr} = useLang();
  const [user, setUser] = useState(initialUser);
  const [screen, setScreen] = useState('dashboard');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const zw = useZoneWardFilter(user);
  const showWardMap = user.role === 'department_head' || user.role === 'csi';
  const lastBackPress = useRef(0);

  // Android back: from any other tab, go to Dashboard first (never straight
  // out of the app); from Dashboard itself, require a second press within
  // 2s to actually exit — the same "press back again to exit" pattern every
  // Android app uses, rather than exiting on the very first press.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'workerDetail') {
        setSelectedWorker(null);
        setScreen('workers');
        return true;
      }
      if (screen !== 'dashboard') {
        setScreen('dashboard');
        return true;
      }
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        return false; // let the default behavior exit the app
      }
      lastBackPress.current = now;
      ToastAndroid.show(tr('pressBackAgainToExit'), ToastAndroid.SHORT);
      return true;
    });
    return () => sub.remove();
  }, [screen, tr]);

  // ------------------------------------------------------------ dashboard
  const [dashRaw, setDashRaw] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState(null);
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashError(null);
    try {
      setDashRaw(await fetchAdminDashboard(user, zw.value));
    } catch (err) {
      setDashError((err && err.message) || NETWORK_FALLBACK);
    } finally {
      setDashLoading(false);
    }
  }, [user, zw.value]);

  useEffect(() => {
    if (!user.mustChangePassword && screen === 'dashboard') {
      loadDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.mustChangePassword, screen, zw.value]);

  // -------------------------------------------------------------- workers
  const [workersDay, setWorkersDay] = useState(dateKey(new Date()));
  const [workersLoadedDay, setWorkersLoadedDay] = useState(null);
  const [workersRaw, setWorkersRaw] = useState(null);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersError, setWorkersError] = useState(null);
  const loadWorkers = useCallback(async () => {
    setWorkersLoading(true);
    setWorkersError(null);
    try {
      setWorkersRaw(await fetchAdminWorkers(user, workersDay));
      setWorkersLoadedDay(workersDay);
    } catch (err) {
      setWorkersError((err && err.message) || NETWORK_FALLBACK);
    } finally {
      setWorkersLoading(false);
    }
  }, [user, workersDay]);

  useEffect(() => {
    if (screen === 'workers' && workersDay !== workersLoadedDay && !workersLoading) {
      loadWorkers();
    }
  }, [screen, workersDay, workersLoadedDay, workersLoading, loadWorkers]);

  // ------------------------------------------------------------- ward map
  const today = dateKey(new Date());
  const [wardMapRange, setWardMapRange] = useState({fromDate: today, toDate: today});
  const [wardMapRaw, setWardMapRaw] = useState(null);
  const [wardMapLoading, setWardMapLoading] = useState(true);
  const [wardMapError, setWardMapError] = useState(null);
  const loadWardMap = useCallback(async () => {
    setWardMapLoading(true);
    setWardMapError(null);
    try {
      setWardMapRaw(await fetchWardAttendanceReport(user, wardMapRange));
    } catch (err) {
      setWardMapError((err && err.message) || NETWORK_FALLBACK);
    } finally {
      setWardMapLoading(false);
    }
  }, [user, wardMapRange]);

  useEffect(() => {
    if (showWardMap && screen === 'wardMap') {
      loadWardMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, wardMapRange]);

  // -------------------------------------------------------------- reports
  const [recentReports, setRecentReports] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      setRecentReports(await fetchRecentReports(user));
    } catch (err) {
      setReportsError((err && err.message) || NETWORK_FALLBACK);
    } finally {
      setReportsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (screen === 'reports' && !recentReports && !reportsLoading) {
      loadReports();
    }
  }, [screen, recentReports, reportsLoading, loadReports]);

  if (user.mustChangePassword) {
    return <AdminChangePasswordScreen user={user} onDone={setUser} />;
  }

  const handleSignOut = async () => {
    await adminSignOut();
    onSignedOut();
  };

  let body;
  if (screen === 'workerDetail' && selectedWorker) {
    body = <AdminWorkerDetailScreen worker={selectedWorker} onBack={() => setScreen('workers')} />;
  } else if (screen === 'workers') {
    body = (
      <AdminWorkerRecordsScreen
        raw={workersRaw}
        loading={workersLoading}
        error={workersError}
        onRefresh={loadWorkers}
        day={workersDay}
        onDayChange={setWorkersDay}
        onOpenWorker={w => {
          setSelectedWorker(w);
          setScreen('workerDetail');
        }}
        zw={zw}
      />
    );
  } else if (screen === 'wardMap' && showWardMap) {
    body = (
      <AdminWardMapScreen
        user={user}
        raw={wardMapRaw}
        loading={wardMapLoading}
        error={wardMapError}
        fromDate={wardMapRange.fromDate}
        toDate={wardMapRange.toDate}
        onDateChange={setWardMapRange}
      />
    );
  } else if (screen === 'reports') {
    body = (
      <AdminReportsScreen
        user={user}
        recent={recentReports}
        loading={reportsLoading}
        error={reportsError}
        onRefresh={loadReports}
        zw={zw}
      />
    );
  } else {
    body = (
      <AdminDashboardScreen
        user={user}
        raw={dashRaw}
        loading={dashLoading}
        error={dashError}
        onRefresh={loadDashboard}
        onSignOut={handleSignOut}
        zw={zw}
      />
    );
  }

  return (
    <>
      <View style={{flex: 1}}>{body}</View>
      <AdminTabBar
        screen={screen}
        onChange={key => {
          setSelectedWorker(null);
          setScreen(key);
        }}
        showWardMap={showWardMap}
      />
    </>
  );
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: ac.divider,
    backgroundColor: ac.white,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: {flex: 1, alignItems: 'center', gap: 2},
  tabLabel: {fontSize: 11, color: ac.grey700},
});
