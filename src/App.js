import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, StatusBar, View} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import {c} from './theme';
import {LanguageProvider, useLang} from './i18n';
import {
  addAttendance,
  flushQueue,
  getSession,
  loadAll,
  setWardCentre,
  signOut as clearSession,
} from './storage';
import {getLocation, requestPermissions, watchLocation} from './device';
import {evaluateFence} from './domain/geo';
import {currentShift, dateKey} from './domain/shifts';
import {MATCH_THRESHOLD, cosineSimilarity, extractFaceEmbedding, faceErrorMessage} from './face';

import LoginScreen from './screens/LoginScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import HomeScreen from './screens/HomeScreen';
import SelectWorkerScreen from './screens/SelectWorkerScreen';
import CaptureScreen from './screens/CaptureScreen';
import VerifiedScreen from './screens/VerifiedScreen';
import GeofenceBreachScreen from './screens/GeofenceBreachScreen';
import AddWorkerScreen from './screens/AddWorkerScreen';
import AddLeaveScreen from './screens/AddLeaveScreen';
import HistoryScreen from './screens/HistoryScreen';
import OfflineSyncScreen from './screens/OfflineSyncScreen';

const PHOTO_DIR = `${RNFS.DocumentDirectoryPath}/attendance`;

function Shell() {
  const {t: tr} = useLang();
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState(null);
  const [data, setData] = useState({
    profile: null,
    ward: null,
    workers: [],
    records: [],
    leaves: [],
    lastSync: null,
  });
  const [screen, setScreen] = useState('home');
  const [isOnline, setIsOnline] = useState(true);
  const [position, setPosition] = useState(null);
  const [shiftId, setShiftId] = useState(currentShift().id);
  const [active, setActive] = useState(null); // worker being marked
  const [result, setResult] = useState(null); // last verified record
  const [captureFor, setCaptureFor] = useState(null); // 'attendance' | 'reference'
  const referenceResolver = useRef(null);

  /* ------------------------------------------------------------- bootstrap */
  useEffect(() => {
    (async () => {
      await requestPermissions();
      const s = await getSession();
      const all = await loadAll();
      setSession(s);
      setData(all);
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return unsub;
  }, []);

  // Live position for the geo-fence chip.
  useEffect(() => {
    if (!session) {
      return undefined;
    }
    let stop = () => {};
    getLocation().then(p => p && setPosition(p));
    stop = watchLocation(p => setPosition(p));
    return () => stop();
  }, [session]);

  // Flush the offline queue whenever connectivity returns.
  useEffect(() => {
    if (!isOnline || !session) {
      return;
    }
    flushQueue(true).then(res => {
      if (res.synced > 0) {
        setData(d => ({...d, records: res.records, lastSync: new Date().toISOString()}));
      }
    });
  }, [isOnline, session]);

  const fence = {
    ...evaluateFence(position, data.ward),
    accuracy: position ? position.accuracy : null,
    position,
  };

  /* ------------------------------------------------------------ navigation */
  const goHome = useCallback(() => {
    setScreen('home');
    setActive(null);
    setResult(null);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home' || !session) {
        return false;
      }
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [screen, session, goHome]);

  /* -------------------------------------------------------------- capture  */

  const openReferenceCamera = useCallback(
    () =>
      new Promise(resolve => {
        referenceResolver.current = resolve;
        setCaptureFor('reference');
        setScreen('capture');
      }),
    [],
  );

  const onCaptured = useCallback(
    async uri => {
      if (captureFor === 'reference') {
        const resolve = referenceResolver.current;
        referenceResolver.current = null;
        setCaptureFor(null);
        setScreen('addWorker');
        resolve(uri);
        return;
      }

      // Attendance capture: fence first, then identity.
      const fresh = (await getLocation({timeout: 8000})) || position;
      const f = evaluateFence(fresh, data.ward);
      if (f.state === 'outside') {
        setPosition(fresh || position);
        setScreen('breach');
        return;
      }

      let embedding;
      let faceUri;
      try {
        const out = await extractFaceEmbedding(uri);
        embedding = out.embedding;
        faceUri = out.faceUri;
      } catch (err) {
        const code = err && err.message;
        Alert.alert(
          code === 'MULTIPLE_FACES' ? tr('manyFacesTitle') : tr('noFaceTitle'),
          faceErrorMessage(err, tr),
        );
        return;
      }

      const score = cosineSimilarity(embedding, active.embedding || []);
      if (score < MATCH_THRESHOLD) {
        Alert.alert(tr('notMatched'), tr('notMatchedBody', {name: active.name}), [
          {text: tr('tryAgain')},
        ]);
        return;
      }

      await RNFS.mkdir(PHOTO_DIR).catch(() => {});
      let stored = faceUri;
      try {
        const dest = `${PHOTO_DIR}/${Date.now()}.jpg`;
        await RNFS.copyFile(faceUri.replace('file://', ''), dest);
        stored = `file://${dest}`;
      } catch (e) {
        // keep the temporary crop if the copy fails
      }

      const {records, record} = await addAttendance({
        workerId: active.id,
        workerName: active.name,
        date: dateKey(new Date()),
        shift: shiftId,
        capturedAt: new Date().toISOString(),
        matchScore: Math.round(score * 100) / 100,
        location: fresh ? {lat: fresh.lat, lng: fresh.lng, accuracy: fresh.accuracy} : null,
        insideGeofence: true,
        distanceM: f.distance == null ? null : Math.round(f.distance),
        photoUri: stored,
        supervisorId: session.supervisorId,
        wardCode: data.ward.code,
      });

      setData(d => ({...d, records}));
      setResult(record);
      setCaptureFor(null);
      setScreen('verified');

      if (isOnline) {
        flushQueue(true).then(res =>
          setData(d => ({...d, records: res.records, lastSync: new Date().toISOString()})),
        );
      }
    },
    [captureFor, active, data.ward, position, shiftId, session, isOnline, tr],
  );

  /* ---------------------------------------------------------------- render */

  if (!booted) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface}}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onSignedIn={async s => {
          const all = await loadAll();
          setSession(s);
          setData(all);
          setScreen('home');
        }}
      />
    );
  }

  if (!data.profile) {
    return (
      <ProfileSetupScreen
        session={session}
        ward={data.ward}
        onDone={async profile => {
          // With no backend, the ward fence is provisioned from a fresh fix taken
          // at this explicit moment. A server-supplied fence always wins.
          const fix = await getLocation({timeout: 12000});
          const ward = fix ? await setWardCentre(fix) : data.ward;
          setData(d => ({...d, profile, ward}));
        }}
      />
    );
  }

  // Guard against rendering a detail screen after its data has been cleared —
  // React can commit the state updates in either order during a transition.
  const effective =
    (screen === 'verified' && (!result || !active)) ||
    (screen === 'capture' && captureFor === 'attendance' && !active)
      ? 'home'
      : screen;

  switch (effective) {
    case 'attendance':
      return (
        <SelectWorkerScreen
          workers={data.workers}
          records={data.records}
          leaves={data.leaves}
          fence={fence}
          shiftId={shiftId}
          setShiftId={setShiftId}
          onBack={goHome}
          onPick={w => {
            if (fence.state === 'outside') {
              setScreen('breach');
              return;
            }
            setActive(w);
            setCaptureFor('attendance');
            setScreen('capture');
          }}
        />
      );

    case 'capture':
      return (
        <CaptureScreen
          worker={captureFor === 'reference' ? {name: tr('referencePhotograph')} : active}
          ward={data.ward}
          shiftId={shiftId}
          fence={fence}
          onCaptured={onCaptured}
          onCancel={() => {
            if (captureFor === 'reference') {
              const resolve = referenceResolver.current;
              referenceResolver.current = null;
              setCaptureFor(null);
              setScreen('addWorker');
              if (resolve) {
                resolve(null);
              }
            } else {
              setCaptureFor(null);
              setScreen('attendance');
            }
          }}
        />
      );

    case 'verified':
      return (
        <VerifiedScreen
          record={result}
          worker={active}
          ward={data.ward}
          onNext={() => {
            setActive(null);
            setResult(null);
            setScreen('attendance');
          }}
          onHome={goHome}
        />
      );

    case 'breach':
      return (
        <GeofenceBreachScreen
          ward={data.ward}
          fence={fence}
          onBack={goHome}
          onRecentre={
            data.ward && data.ward.centreFromDevice
              ? async () => {
                  const fix = await getLocation({timeout: 12000});
                  if (!fix) {
                    return false;
                  }
                  const ward = await setWardCentre(fix, {force: true});
                  setData(d => ({...d, ward}));
                  setPosition(fix);
                  return true;
                }
              : null
          }
          onRetry={async () => {
            const p = await getLocation({timeout: 10000});
            if (p) {
              setPosition(p);
            }
            const f = evaluateFence(p || position, data.ward);
            setScreen(f.state === 'outside' ? 'breach' : active ? 'capture' : 'attendance');
          }}
        />
      );

    case 'addWorker':
      return (
        <AddWorkerScreen
          onBack={goHome}
          openCamera={openReferenceCamera}
          onSaved={(workers, worker) => {
            setData(d => ({...d, workers}));
            Alert.alert(tr('addWorker'), tr('workerSaved', {name: worker.name}));
            goHome();
          }}
        />
      );

    case 'addLeave':
      return (
        <AddLeaveScreen
          workers={data.workers}
          onBack={goHome}
          onSaved={(leaves, worker) => {
            setData(d => ({...d, leaves}));
            Alert.alert(tr('addLeave'), tr('leaveSaved', {name: worker.name}));
            goHome();
          }}
        />
      );

    case 'history':
      return (
        <HistoryScreen
          workers={data.workers}
          records={data.records}
          leaves={data.leaves}
          onBack={goHome}
        />
      );

    case 'sync':
      return (
        <OfflineSyncScreen
          records={data.records}
          lastSync={data.lastSync}
          isOnline={isOnline}
          onBack={goHome}
          onSynced={records =>
            setData(d => ({...d, records, lastSync: new Date().toISOString()}))
          }
        />
      );

    default:
      return (
        <HomeScreen
          profile={data.profile}
          ward={data.ward}
          workers={data.workers}
          records={data.records}
          leaves={data.leaves}
          lastSync={data.lastSync}
          isOnline={isOnline}
          navigate={async target => {
            if (target === 'signOut') {
              await clearSession();
              setSession(null);
              return;
            }
            if (target === 'attendance') {
              setShiftId(currentShift().id);
            }
            setScreen(target);
          }}
        />
      );
  }
}

export default function App() {
  return (
    <LanguageProvider>
      <StatusBar barStyle="dark-content" backgroundColor={c.surface} />
      <Shell />
    </LanguageProvider>
  );
}
