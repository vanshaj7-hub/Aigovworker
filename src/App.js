import React, {useCallback, useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {colors} from './theme';
import {dateKey, getAttendance, getWorkers, syncPendingRecords} from './storage';
import {getModel} from './face';
import {requestAppPermissions} from './device';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import AdminScreen from './screens/AdminScreen';
import WorkersScreen from './screens/WorkersScreen';
import EnrollScreen from './screens/EnrollScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import HistoryScreen from './screens/HistoryScreen';

export default function App() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState('home');
  const [workers, setWorkers] = useState([]);
  const [records, setRecords] = useState([]);
  const [isOnline, setIsOnline] = useState(true);

  const navigate = useCallback(next => setScreen(next), []);

  useEffect(() => {
    getWorkers().then(setWorkers);
    getAttendance().then(setRecords);
    // Warm up the face model so first verification is fast.
    getModel().catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected);
      setIsOnline(online);
      if (online) {
        syncPendingRecords(true).then(({records: updated, syncedCount}) => {
          if (syncedCount > 0) {
            setRecords(updated);
          }
        });
      }
    });
    return unsub;
  }, []);

  const onLogin = async user => {
    setSession(user);
    setScreen('home');
    if (user.role === 'supervisor') {
      await requestAppPermissions();
    }
  };

  if (!session) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <LoginScreen onLogin={onLogin} />
      </>
    );
  }

  const todayKey = dateKey(new Date());
  const stats = {
    totalWorkers: workers.length,
    presentToday: new Set(
      records.filter(r => r.dateKey === todayKey).map(r => r.workerId),
    ).size,
    pendingSync: records.filter(r => !r.synced).length,
  };

  const shared = {
    session,
    workers,
    setWorkers,
    records,
    setRecords,
    navigate,
    isOnline,
  };

  if (session.role === 'admin') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <AdminScreen
          session={session}
          records={records}
          setRecords={setRecords}
          workers={workers}
          onLogout={() => setSession(null)}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      {screen === 'home' && (
        <HomeScreen
          {...shared}
          stats={stats}
          onLogout={() => {
            setSession(null);
            setScreen('home');
          }}
        />
      )}
      {screen === 'workers' && <WorkersScreen {...shared} />}
      {screen === 'enroll' && <EnrollScreen {...shared} />}
      {screen === 'attendance' && <AttendanceScreen {...shared} />}
      {screen === 'history' && <HistoryScreen {...shared} />}
    </>
  );
}
