import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, Modal, StatusBar, View} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import {c} from './theme';
import {LanguageProvider, useLang} from './i18n';
import {
  addAttendance,
  clearDemoData,
  flushQueue,
  getSession,
  dismissPasswordPrompt,
  isProfileComplete,
  loadAll,
  seedDemoHistory,
  seedDemoWorkers,
  setWardCentre,
  signOut as clearSession,
} from './storage';
import {getLocation, requestPermissions, watchLocation} from './device';
import {evaluateFence} from './domain/geo';
import {currentShift, dateKey} from './domain/shifts';
import {isDemoWorker} from './demo';
import {USE_BACKEND} from './config';
import * as svc from './session';
import {MATCH_THRESHOLD, cosineSimilarity, extractFaceEmbedding, faceErrorMessage} from './face';

import SignInScreen from './screens/SignInScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import LocationGateScreen from './screens/LocationGateScreen';
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
  const [showPasswordChange, setShowPasswordChange] = useState(false);
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
  const [active, setActive] = useState(null);
  const [result, setResult] = useState(null);
  const [breach, setBreach] = useState(null); // {reason: 'outside'|'moved'}
  const [gate, setGate] = useState('checking'); // checking | ok | blocked
  const [photoRequest, setPhotoRequest] = useState(null); // {title, resolve}
  const [workspaceLoaded, setWorkspaceLoaded] = useState(!USE_BACKEND);
  const [profileSkipped, setProfileSkipped] = useState(false);
  const [locationBypassed, setLocationBypassed] = useState(false);
  const [backendCounts, setBackendCounts] = useState(null);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
  }, []);

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
    const unsub = NetInfo.addEventListener(st => setIsOnline(!!st.isConnected));
    return unsub;
  }, []);

  // Live position for the geo-fence indicators.
  useEffect(() => {
    if (!session) {
      return undefined;
    }
    getLocation().then(p => p && alive.current && setPosition(p));
    const stop = watchLocation(p => alive.current && setPosition(p));
    return () => stop();
  }, [session]);

  useEffect(() => {
    if (!isOnline || !session) {
      return;
    }
    flushQueue(true).then(res => {
      if (res.synced > 0 && alive.current) {
        setData(d => ({...d, records: res.records, lastSync: new Date().toISOString()}));
      }
    });
  }, [isOnline, session]);

  const fence = {
    ...evaluateFence(position, data.ward),
    accuracy: position ? position.accuracy : null,
    position,
  };

  /* ------------------------------------------------------- location gate */

  const runGate = useCallback(async () => {
    setGate('checking');
    // A cold start often has no fix yet, so ask a few times and never accept a
    // cached position for this check.
    let fix = null;
    for (let i = 0; i < 3 && !fix && alive.current; i++) {
      fix = await getLocation({timeout: 10000, maximumAge: 0});
    }
    if (fix) {
      setPosition(fix);
    }
    // No administrator fence yet — provision it from this device's position so
    // the ward has a centre. Replaced by the server value once a backend exists.
    let ward = data.ward;
    if (ward && !ward.center && fix) {
      ward = await setWardCentre(fix);
      setData(d => ({...d, ward}));
    }
    const f = evaluateFence(fix, ward);
    // Anything other than a confirmed "inside" keeps the app locked.
    setGate(f.state === 'inside' ? 'ok' : 'blocked');
  }, [data.ward, position]);

  const profileReady = isProfileComplete(data.profile);
  // The supervisor may skip an incomplete profile for this session.
  const canProceed = profileReady || profileSkipped;

  // With the backend on, pull the real ward (and its geo-fence), the day's
  // counts and the worker roll before the location gate runs.
  const loadBackendWorkspace = useCallback(async () => {
    if (!USE_BACKEND || !session) {
      return;
    }
    try {
      const supId = session.supervisorId;
      const ws = await svc.loadWorkspace(supId);
      const workers = await svc.loadWorkers(supId, ws.shiftId);
      setShiftId(ws.shiftId);
      setBackendCounts(ws.counts);
      setData(d => ({...d, ward: ws.ward, workers}));
    } catch (err) {
      // Keep whatever ward we have; the gate still runs against it.
    } finally {
      setWorkspaceLoaded(true);
    }
  }, [session]);

  // Load the real ward as soon as we are signed in — before the profile gate —
  // so the profile screen shows the correct ward and any photo uploaded from it
  // is named with the real WardID rather than the local placeholder.
  useEffect(() => {
    if (session && USE_BACKEND && !workspaceLoaded) {
      loadBackendWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, workspaceLoaded]);

  useEffect(() => {
    if (session && canProceed && workspaceLoaded && gate === 'checking') {
      runGate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, canProceed, workspaceLoaded]);

  /* ------------------------------------------------------------ navigation */
  const goHome = useCallback(() => {
    setScreen('home');
    setActive(null);
    setResult(null);
    setBreach(null);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (photoRequest) {
        photoRequest.resolve(null);
        setPhotoRequest(null);
        return true;
      }
      if (!session || screen === 'home') {
        return false;
      }
      goHome();
      return true;
    });
    return () => sub.remove();
  }, [screen, session, goHome, photoRequest]);

  /* ------------------------------------------------- shared photo capture */

  // Used by the profile screen and worker onboarding; resolves with a file URI.
  const requestPhoto = useCallback(
    title => new Promise(resolve => setPhotoRequest({title, resolve})),
    [],
  );

  /* ----------------------------------------------------- attendance capture */

  const writeRecord = useCallback(
    async ({worker, faceUri, score, verified, fix, f}) => {
      await RNFS.mkdir(PHOTO_DIR).catch(() => {});
      let stored = faceUri;
      if (faceUri) {
        try {
          const dest = `${PHOTO_DIR}/${Date.now()}.jpg`;
          await RNFS.copyFile(faceUri.replace('file://', ''), dest);
          stored = `file://${dest}`;
        } catch (e) {
          // keep the temporary crop
        }
      }
      const {records, record} = await addAttendance({
        workerId: worker.id,
        workerName: worker.name,
        date: dateKey(new Date()),
        shift: shiftId,
        capturedAt: new Date().toISOString(),
        matchScore: score,
        verified,
        location: fix ? {lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy} : null,
        insideGeofence: true,
        distanceM: f && f.distance != null ? Math.round(f.distance) : null,
        photoUri: stored,
        supervisorId: session.supervisorId,
        wardCode: data.ward.code,
        demo: !!worker.demo,
      });
      setData(d => ({...d, records}));
      setResult(record);
      setScreen('verified');
      // Best-effort mirror: upload the captured face and POST mark-attendance.
      // Only real backend workers have a server worker_id to mark against.
      if (USE_BACKEND && worker.fromBackend) {
        svc
          .submitAttendance({
            supervisorId: session.supervisorId,
            wardId: data.ward && (data.ward.wardId || data.ward.number),
            workerId: worker.workerId != null ? worker.workerId : worker.id,
            photoUri: stored,
            shiftId,
            faceMatchScore: score,
            lat: fix ? fix.lat : null,
            lng: fix ? fix.lng : null,
            distanceFromWard: f && f.distance != null ? f.distance : null,
            inside: true,
          })
          .then(r => {
            if (r && !r.ok && !r.skipped) {
              console.warn('mark-attendance sync failed:', r.message);
            }
          });
      }
      if (isOnline) {
        flushQueue(true).then(res =>
          alive.current &&
          setData(d => ({...d, records: res.records, lastSync: new Date().toISOString()})),
        );
      }
    },
    [shiftId, session, data.ward, isOnline],
  );

  const onCaptured = useCallback(
    async uri => {
      const worker = active;
      if (!worker) {
        return;
      }

      // 1. Location before anything else.
      const fix = (await getLocation({timeout: 8000})) || position;
      const f = evaluateFence(fix, data.ward);
      if (!locationBypassed && f.state === 'outside') {
        setPosition(fix || position);
        setBreach({reason: 'outside'});
        setScreen('breach');
        return;
      }

      // 2. Demo workers carry no reference face, so there is nothing to match.
      if (isDemoWorker(worker)) {
        const proceed = await new Promise(resolve =>
          Alert.alert(tr('demoNoFace'), tr('demoNoFaceBody'), [
            {text: tr('cancel'), style: 'cancel', onPress: () => resolve(false)},
            {text: tr('recordAnyway'), onPress: () => resolve(true)},
          ]),
        );
        if (!proceed) {
          return;
        }
        await writeRecord({worker, faceUri: uri, score: null, verified: false, fix, f});
        return;
      }

      // 3. Identity.
      let embedding;
      let faceUri;
      try {
        const out = await extractFaceEmbedding(uri);
        embedding = out.embedding;
        faceUri = out.faceUri;
      } catch (err) {
        Alert.alert(
          err && err.message === 'MULTIPLE_FACES' ? tr('manyFacesTitle') : tr('noFaceTitle'),
          faceErrorMessage(err, tr),
        );
        return;
      }
      const score = cosineSimilarity(embedding, worker.embedding || []);
      if (score < MATCH_THRESHOLD) {
        Alert.alert(tr('notMatched'), tr('notMatchedBody', {name: worker.name}));
        return;
      }

      // 4. Location again — the device may have moved while the face was processed.
      const afterFix = (await getLocation({timeout: 8000})) || fix;
      const afterFence = evaluateFence(afterFix, data.ward);
      if (!locationBypassed && afterFence.state === 'outside') {
        setPosition(afterFix);
        setBreach({reason: 'moved'});
        setScreen('breach');
        return;
      }

      await writeRecord({
        worker,
        faceUri,
        score: Math.round(score * 100) / 100,
        verified: true,
        fix: afterFix,
        f: afterFence,
      });
    },
    [active, position, data.ward, tr, writeRecord, locationBypassed],
  );

  /* ------------------------------------------------------------ demo data */

  const onDemo = useCallback(
    async action => {
      try {
        if (action === 'workers') {
          const res = await seedDemoWorkers();
          setData(d => ({...d, workers: res.workers}));
          Alert.alert(
            tr('demoData'),
            res.added ? tr('demoWorkersAdded', {n: res.added}) : tr('demoAlready'),
          );
        } else if (action === 'history') {
          const res = await seedDemoHistory(session.supervisorId);
          setData(d => ({
            ...d,
            workers: res.workers,
            records: res.records,
            leaves: res.leaves,
            lastSync: new Date().toISOString(),
          }));
          Alert.alert(tr('demoData'), tr('demoHistoryAdded'));
        } else if (action === 'clear') {
          const res = await clearDemoData();
          setData(d => ({...d, workers: res.workers, records: res.records, leaves: res.leaves}));
          Alert.alert(tr('demoData'), tr('demoCleared'));
        }
      } catch (err) {
        Alert.alert(tr('demoData'), String(err && err.message ? err.message : err));
      }
    },
    [session, tr],
  );

  /* ---------------------------------------------------------------- render */

  if (!booted) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface}}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }

  // The base screen. The shared camera renders as an overlay on top of this
  // (see the return below) instead of replacing it, so the screen that asked
  // for a photo — profile setup or worker onboarding — stays mounted, receives
  // the captured photo, and keeps anything already typed into its form.
  const base = (() => {
  if (!session) {
    return (
      <SignInScreen
        onSignedIn={async s => {
          const all = await loadAll();
          setSession(s);
          setData(all);
          setGate('checking');
          setScreen('home');
        }}
      />
    );
  }

  // Signed in on the password the IT team issued: offer to change it, but let
  // the supervisor carry on with the temporary one if they would rather.
  const mustPrompt = session.mustResetPassword && !session.passwordPromptDone;
  if (mustPrompt || showPasswordChange) {
    return (
      <ChangePasswordScreen
        email={session.email}
        forced={mustPrompt}
        onBack={() => setShowPasswordChange(false)}
        onDone={() => {
          setShowPasswordChange(false);
          setSession(sess => ({...sess, mustResetPassword: false, passwordPromptDone: true}));
        }}
        onSkip={async () => {
          const updated = await dismissPasswordPrompt();
          setSession(updated || {...session, passwordPromptDone: true});
        }}
      />
    );
  }

  // Profile is re-checked on every sign-in. It can be skipped for now, but the
  // prompt returns on the next app open because profileSkipped is not persisted.
  if (!profileReady && !profileSkipped) {
    return (
      <ProfileSetupScreen
        session={session}
        ward={data.ward}
        profile={data.profile}
        openCamera={() => requestPhoto(tr('addYourPhoto'))}
        onSkip={() => setProfileSkipped(true)}
        onDone={profile => {
          setData(d => ({...d, profile}));
          setGate('checking');
          // Best-effort mirror: upload the photo to Firebase and POST the profile.
          svc
            .submitProfile({
              supervisorId: session.supervisorId,
              wardId: data.ward && (data.ward.wardId || data.ward.number),
              email: session.email,
              fullName: profile.name,
              phone: profile.mobile,
              photoUri: profile.photoUri,
            })
            .then(r => {
              if (r && !r.ok && !r.skipped) {
                console.warn('profile sync failed:', r.message);
              }
            });
        }}
      />
    );
  }

  if (gate !== 'ok' && !locationBypassed) {
    return (
      <LocationGateScreen
        ward={data.ward}
        fence={fence}
        checking={gate === 'checking'}
        onRetry={runGate}
        onRecentre={
          data.ward && data.ward.centreFromDevice
            ? async () => {
                const fix = await getLocation({timeout: 12000});
                if (!fix) {
                  return;
                }
                const ward = await setWardCentre(fix, {force: true});
                setData(d => ({...d, ward}));
                setPosition(fix);
                setGate('ok');
              }
            : null
        }
        onSkip={() => setLocationBypassed(true)}
        onSignOut={async () => {
          await clearSession();
          setSession(null);
          setGate('checking');
          setLocationBypassed(false);
        }}
      />
    );
  }

  const effective =
    (screen === 'verified' && (!result || !active)) ||
    (screen === 'capture' && !active)
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
            if (!locationBypassed && fence.state === 'outside') {
              setBreach({reason: 'outside'});
              setScreen('breach');
              return;
            }
            setActive(w);
            setScreen('capture');
          }}
        />
      );

    case 'capture':
      return (
        <CaptureScreen
          worker={active}
          ward={data.ward}
          shiftId={shiftId}
          fence={fence}
          onCaptured={onCaptured}
          onCancel={() => setScreen('attendance')}
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
          movedAfterMatch={breach && breach.reason === 'moved'}
          onBack={goHome}
          onRetry={async () => {
            const p = await getLocation({timeout: 10000});
            if (p) {
              setPosition(p);
            }
            const f = evaluateFence(p || position, data.ward);
            setBreach(null);
            setScreen(f.state === 'outside' ? 'breach' : active ? 'capture' : 'attendance');
            if (f.state === 'outside') {
              setBreach({reason: 'outside'});
            }
          }}
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
        />
      );

    case 'addWorker':
      return (
        <AddWorkerScreen
          onBack={goHome}
          openCamera={() => requestPhoto(tr('referencePhotograph'))}
          onSaved={(workers, worker) => {
            setData(d => ({...d, workers}));
            // Best-effort mirror: upload the reference face and POST the worker.
            svc
              .submitWorker({
                supervisorId: session.supervisorId,
                wardId: data.ward && (data.ward.wardId || data.ward.number),
                fullName: worker.name,
                relationName: worker.fatherName || '',
                relation: 'Father',
                phone: worker.mobile || '',
                gender: worker.gender || 'Male',
                designation: worker.designation,
                dateOfBirth: worker.dateOfBirth || null,
                photoUri: worker.photoUri,
              })
              .then(r => {
                if (r && !r.ok && !r.skipped) {
                  console.warn('add-worker sync failed:', r.message);
                }
              });
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
          onSynced={records => setData(d => ({...d, records, lastSync: new Date().toISOString()}))}
        />
      );

    default:
      return (
        <HomeScreen
          profile={data.profile || {name: session.fullName || '', photoUri: null}}
          ward={data.ward}
          workers={data.workers}
          records={data.records}
          leaves={data.leaves}
          lastSync={data.lastSync}
          isOnline={isOnline}
          onDemo={onDemo}
          counts={backendCounts}
          onChangePassword={() => setShowPasswordChange(true)}
          navigate={async target => {
            if (target === 'signOut') {
              await clearSession();
              setSession(null);
              setGate('checking');
              setShowPasswordChange(false);
              setWorkspaceLoaded(!USE_BACKEND);
              setBackendCounts(null);
              setProfileSkipped(false);
              setLocationBypassed(false);
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
  })();

  return (
    <>
      {base}
      {photoRequest ? (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => {
            const {resolve} = photoRequest;
            setPhotoRequest(null);
            resolve(null);
          }}>
          <CaptureScreen
            worker={{name: photoRequest.title}}
            ward={data.ward}
            shiftId={shiftId}
            fence={fence}
            onCaptured={async uri => {
              const {resolve} = photoRequest;
              setPhotoRequest(null);
              resolve(uri);
            }}
            onCancel={() => {
              const {resolve} = photoRequest;
              setPhotoRequest(null);
              resolve(null);
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <StatusBar barStyle="dark-content" backgroundColor={c.surface} />
      <Shell />
    </LanguageProvider>
  );
}
