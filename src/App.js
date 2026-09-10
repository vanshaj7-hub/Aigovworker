import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, Modal, StatusBar, Text, View} from 'react-native';
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
  setProfilePhotoUrl,
  setWardCentre,
  signOut as clearSession,
} from './storage';
import {getBestLocation, getLocation, requestPermissions, watchLocation} from './device';
import {evaluateFence} from './domain/geo';
import {currentShift, dateKey, ongoingShift} from './domain/shifts';
import {isDemoWorker} from './demo';
import {USE_BACKEND} from './config';
import * as svc from './session';
import {MATCH_THRESHOLD, cosineSimilarity, extractFaceEmbedding, faceErrorMessage} from './face';

import SignInScreen from './screens/SignInScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import HomeScreen from './screens/HomeScreen';
import SelectWorkerScreen from './screens/SelectWorkerScreen';
import CaptureScreen from './screens/CaptureScreen';
import VerifiedScreen from './screens/VerifiedScreen';
import GeofenceBreachScreen from './screens/GeofenceBreachScreen';
import AddWorkerScreen from './screens/AddWorkerScreen';
import WorkerListScreen from './screens/WorkerListScreen';
import AddLeaveScreen from './screens/AddLeaveScreen';
import HistoryScreen from './screens/HistoryScreen';
import OfflineSyncScreen from './screens/OfflineSyncScreen';

const PHOTO_DIR = `${RNFS.DocumentDirectoryPath}/attendance`;

// True only once `active` has stayed true for `delay` ms — so a quick refresh
// never flashes skeletons, but a genuinely delayed one shows them instead of
// leaving stale data on screen.
function useDelayedFlag(active, delay = 350) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return undefined;
    }
    const id = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(id);
  }, [active, delay]);
  return on;
}

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
  const [photoRequest, setPhotoRequest] = useState(null); // {title, resolve}
  const [workspaceLoaded, setWorkspaceLoaded] = useState(!USE_BACKEND);
  const [profileSkipped, setProfileSkipped] = useState(false);
  // Per-session opt-out: lets the supervisor mark attendance from outside the
  // ward after choosing "skip for now" on the geo-fence block. (Location is
  // never checked at login — only here, during attendance.)
  const [attnBypass, setAttnBypass] = useState(false);
  // Workers whose verification (face/location) failed this session. They show
  // as Absent in the roster but stay selectable so the supervisor can retry.
  const [failed, setFailed] = useState({});
  // The worker being edited in the add/edit form (null = adding a new worker).
  const [editWorker, setEditWorker] = useState(null);
  const [backendCounts, setBackendCounts] = useState(null);
  // The shift the backend reports as currently open (or null between shifts).
  // Attendance may only be marked while a shift is ongoing — and the backend,
  // not the app's local clock, is the authority on the shift windows.
  const [activeShift, setActiveShift] = useState(null);
  // True while a backend refresh is in flight; drives the skeleton loaders so a
  // slow fetch shows placeholders instead of stale data.
  const [refreshing, setRefreshing] = useState(false);
  // Reference face embeddings, built on demand from each worker's photo URL and
  // cached so a worker's reference is downloaded and encoded at most once.
  const refCache = useRef({});
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
    getBestLocation().then(p => p && alive.current && setPosition(p));
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

  // Show skeletons once a refresh has been in flight long enough to matter.
  const showSkeleton = useDelayedFlag(refreshing);
  // The shift the backend reports as currently open (null between shifts).
  const activeShiftId = USE_BACKEND
    ? activeShift
      ? activeShift.shift_id
      : null
    : ongoingShift()
    ? ongoingShift().id
    : null;

  // The backend is the source of truth for whether the profile is complete, so
  // a returning supervisor whose profile is already done is never re-prompted.
  const profileReady =
    (session && session.profileCompleted) || isProfileComplete(data.profile);

  // With the backend on, pull the real ward (and its geo-fence), the day's
  // counts and the worker roll before the location gate runs.
  const loadBackendWorkspace = useCallback(async () => {
    if (!USE_BACKEND || !session) {
      return;
    }
    setRefreshing(true);
    try {
      const supId = session.supervisorId;
      const ws = await svc.loadWorkspace(supId);
      const workers = await svc.loadWorkers(supId, ws.shiftId);
      setShiftId(ws.shiftId);
      setBackendCounts(ws.counts);
      setActiveShift(ws.shift || null);
      setData(d => {
        // Adopt the backend's profile photo so the avatar survives a restart,
        // without clobbering any other locally-held profile fields.
        const profile = ws.profilePhotoUrl
          ? {...(d.profile || {name: session.fullName || ''}), photoUri: ws.profilePhotoUrl}
          : d.profile;
        return {...d, ward: ws.ward, workers, profile};
      });
      if (ws.profilePhotoUrl) {
        setProfilePhotoUrl(ws.profilePhotoUrl).catch(() => {});
      }
    } catch (err) {
      // Keep whatever ward we have; the gate still runs against it.
    } finally {
      setWorkspaceLoaded(true);
      setRefreshing(false);
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

  /* ------------------------------------------------------------ navigation */
  const goHome = useCallback(() => {
    setScreen('home');
    setActive(null);
    setResult(null);
    setBreach(null);
    // Re-pull the day's counts and roster so Home shows the latest numbers.
    loadBackendWorkspace();
  }, [loadBackendWorkspace]);

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

  // Builds (and caches) a worker's reference face embedding from their stored
  // photo URL, so the live capture can be matched against it. Returns null when
  // the worker has no reference photo on file, or none with a detectable face.
  const buildReferenceEmbedding = useCallback(async worker => {
    if (worker.embedding && worker.embedding.length) {
      return worker.embedding;
    }
    const key = worker.workerId != null ? worker.workerId : worker.id;
    if (refCache.current[key]) {
      return refCache.current[key];
    }
    if (!worker.referenceUrl) {
      return null;
    }
    try {
      const dest = `${RNFS.CachesDirectoryPath}/ref_${key}.jpg`;
      const dl = await RNFS.downloadFile({fromUrl: worker.referenceUrl, toFile: dest}).promise;
      if (!dl || dl.statusCode !== 200) {
        return null;
      }
      const {embedding} = await extractFaceEmbedding(`file://${dest}`);
      refCache.current[key] = embedding;
      return embedding;
    } catch (e) {
      return null; // no reference, or no detectable face in it
    }
  }, []);

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
        insideGeofence: f ? f.state === 'inside' : true,
        distanceM: f && f.distance != null ? Math.round(f.distance) : null,
        photoUri: stored,
        supervisorId: session.supervisorId,
        wardCode: data.ward.code,
        demo: !!worker.demo,
      });
      setData(d => ({...d, records}));
      // This worker is now marked, so clear any earlier failed/Absent attempt.
      setFailed(m => {
        if (!m[worker.id]) {
          return m;
        }
        const next = {...m};
        delete next[worker.id];
        return next;
      });
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
            faceMatchStatus: verified ? 'Matched' : 'Not Matched',
            lat: fix ? fix.lat : null,
            lng: fix ? fix.lng : null,
            distanceFromWard: f && f.distance != null ? f.distance : null,
            inside: f ? f.state === 'inside' : false,
          })
          .then(r => {
            if (r && !r.ok && !r.skipped) {
              console.warn('mark-attendance sync failed:', r.message);
            } else if (r && r.ok) {
              // Pull the fresh counts and worker statuses so Home and the roster
              // reflect this mark.
              loadBackendWorkspace();
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
    [shiftId, session, data.ward, isOnline, loadBackendWorkspace],
  );

  const onCaptured = useCallback(
    async uri => {
      const worker = active;
      if (!worker) {
        return;
      }

      // 1. Location before anything else. Strict: attendance is blocked unless
      // the device is confirmed inside the ward (outside, or no fix, both stop).
      // getBestLocation samples for the most accurate fix rather than accepting a
      // stale coarse one, which is what made a genuinely-inside device read outside.
      const fix = (await getBestLocation({window: 6000})) || position;
      const f = evaluateFence(fix, data.ward);
      if (!attnBypass && f.state !== 'inside') {
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
        // No / unclear face — mark Absent for now; the supervisor can retry.
        setFailed(m => ({...m, [worker.id]: true}));
        Alert.alert(
          err && err.message === 'MULTIPLE_FACES' ? tr('manyFacesTitle') : tr('noFaceTitle'),
          `${faceErrorMessage(err, tr)} ${tr('markedAbsentRetry')}`,
        );
        return;
      }
      // A real worker MUST have a reference face to verify against. If none is
      // on file, require capturing one now — attendance cannot continue for this
      // worker until a reference is added.
      let reference = await buildReferenceEmbedding(worker);
      if (!reference) {
        const add = await new Promise(resolve =>
          Alert.alert(tr('noReferenceTitle'), tr('noReferenceBody', {name: worker.name}), [
            {text: tr('cancel'), style: 'cancel', onPress: () => resolve(false)},
            {text: tr('addReferencePhoto'), onPress: () => resolve(true)},
          ]),
        );
        if (!add) {
          setFailed(m => ({...m, [worker.id]: true})); // Absent until a reference is added
          return;
        }
        const refUri = await requestPhoto(tr('referenceFor', {name: worker.name}));
        if (!refUri) {
          setFailed(m => ({...m, [worker.id]: true}));
          return;
        }
        try {
          const out = await extractFaceEmbedding(refUri);
          reference = out.embedding;
          const key = worker.workerId != null ? worker.workerId : worker.id;
          refCache.current[key] = reference; // used for this session's matching
        } catch (err) {
          setFailed(m => ({...m, [worker.id]: true}));
          Alert.alert(
            err && err.message === 'MULTIPLE_FACES' ? tr('manyFacesTitle') : tr('noFaceTitle'),
            `${faceErrorMessage(err, tr)} ${tr('markedAbsentRetry')}`,
          );
          return;
        }
      }

      // Verify the live capture against the reference. Always strict now.
      const sim = cosineSimilarity(embedding, reference);
      if (sim < MATCH_THRESHOLD) {
        // Face did not match — mark Absent and let the supervisor retry.
        setFailed(m => ({...m, [worker.id]: true}));
        Alert.alert(tr('notMatched'), `${tr('notMatchedBody', {name: worker.name})} ${tr('markedAbsentRetry')}`);
        return;
      }
      const score = Math.round(sim * 100) / 100;
      const verified = true;

      // 4. Location again — strict: the device may have moved while the face was
      // processed, so re-confirm it is still inside the ward.
      const afterFix = (await getBestLocation({window: 5000})) || fix;
      const afterFence = evaluateFence(afterFix, data.ward);
      if (!attnBypass && afterFence.state !== 'inside') {
        setPosition(afterFix);
        setBreach({reason: 'moved'});
        setScreen('breach');
        return;
      }

      await writeRecord({
        worker,
        faceUri,
        score,
        verified,
        fix: afterFix,
        f: afterFence,
      });
    },
    [active, position, data.ward, tr, writeRecord, buildReferenceEmbedding, attnBypass, requestPhoto],
  );

  /* --------------------------------------------------- worker onboarding */

  // A worker created by the IT admin has no reference photo (onboarding_completed
  // = 0). Before any attendance can be face-matched, the supervisor must capture
  // one: it is uploaded and saved via /edit-worker, which completes onboarding.
  const startOnboarding = useCallback(
    async worker => {
      const refUri = await requestPhoto(tr('onboardReferenceFor', {name: worker.name}));
      if (!refUri) {
        return;
      }
      // Confirm a single clear face before uploading anything.
      let embedding = null;
      try {
        const out = await extractFaceEmbedding(refUri);
        embedding = out.embedding;
      } catch (err) {
        Alert.alert(
          err && err.message === 'MULTIPLE_FACES' ? tr('manyFacesTitle') : tr('noFaceTitle'),
          faceErrorMessage(err, tr),
        );
        return;
      }
      const r = await svc.submitWorkerUpdate({
        supervisorId: session.supervisorId,
        wardId: data.ward && (data.ward.wardId || data.ward.number),
        workerId: worker.workerId != null ? worker.workerId : worker.id,
        email: session.email,
        photoUri: refUri,
        referenceUrl: null,
      });
      if (r && (r.ok || r.skipped)) {
        // Cache the embedding so this session can match immediately, and refresh
        // the roster so onboarding_completed flips to 1.
        const key = worker.workerId != null ? worker.workerId : worker.id;
        refCache.current[key] = embedding;
        Alert.alert(tr('onboardingDone'), tr('onboardingDoneBody', {name: worker.name}));
        loadBackendWorkspace();
      } else {
        Alert.alert(tr('onboardingFailed'), (r && r.message) || '');
      }
    },
    [session, data.ward, tr, requestPhoto, loadBackendWorkspace],
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

  // Hold on a brief loading screen until the real ward and roster arrive from
  // the backend, so neither the profile screen nor Home flashes local
  // placeholder ("dummy") data first. Location is NOT checked here — only during
  // attendance marking.
  if (USE_BACKEND && !workspaceLoaded) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface}}>
        <ActivityIndicator color={c.primary} size="large" />
        <Text style={{marginTop: 16, color: c.textMuted, fontSize: 14.5}}>{tr('loadingWard')}</Text>
      </View>
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
            .then(async r => {
              if (r && r.ok && r.photoUrl) {
                // Persist the hosted URL so the avatar survives a restart (the
                // local file path is temporary; no endpoint returns the photo).
                const updated = await setProfilePhotoUrl(r.photoUrl);
                if (updated && alive.current) {
                  setData(d => ({...d, profile: updated}));
                }
              } else if (r && !r.ok && !r.skipped) {
                console.warn('profile sync failed:', r.message);
              }
            });
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
          failed={failed}
          fence={fence}
          shiftId={shiftId}
          setShiftId={setShiftId}
          ongoingShiftId={activeShiftId}
          loading={showSkeleton}
          onBack={goHome}
          onPick={w => {
            setActive(w);
            // A worker the IT admin created has no reference photo yet; onboarding
            // (capture + /edit-worker) must be completed before any attendance.
            if (w.fromBackend && w.onboardingCompleted === false) {
              startOnboarding(w);
              return;
            }
            // Strict unless the supervisor has chosen to skip the location check.
            if (!attnBypass && fence.state !== 'inside') {
              setBreach({reason: 'outside'});
              setScreen('breach');
              return;
            }
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
          onSkip={() => {
            // Skip the geo-fence for the rest of this session and continue
            // marking. The attendance record still carries the real (outside)
            // location so the backend knows it was not verified.
            setAttnBypass(true);
            setBreach(null);
            setScreen(active ? 'capture' : 'attendance');
          }}
          onRetry={async () => {
            const p = await getBestLocation({window: 8000});
            if (p) {
              setPosition(p);
            }
            const f = evaluateFence(p || position, data.ward);
            setBreach(null);
            setScreen(f.state !== 'inside' ? 'breach' : active ? 'capture' : 'attendance');
            if (f.state !== 'inside') {
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

    case 'workers':
      return (
        <WorkerListScreen
          workers={data.workers}
          loading={showSkeleton}
          onBack={goHome}
          onAdd={() => {
            setEditWorker(null);
            setScreen('addWorker');
          }}
          onEdit={w => {
            setEditWorker(w);
            setScreen('addWorker');
          }}
        />
      );

    case 'addWorker':
      return (
        <AddWorkerScreen
          worker={editWorker}
          onBack={() => setScreen('workers')}
          openCamera={() => requestPhoto(tr('referencePhotograph'))}
          onSaved={async (workers, worker) => {
            // Save to the backend and only report success once it actually
            // persists, so a worker never shows "saved" but vanish on restart.
            const r = await svc.submitWorker({
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
            });
            if (!r || r.ok || r.skipped) {
              Alert.alert(tr('addWorker'), tr('workerSaved', {name: worker.name}));
            } else {
              Alert.alert(tr('addWorker'), tr('workerSyncFailed', {msg: r.message || ''}));
            }
            loadBackendWorkspace(); // pull the updated roster
            setScreen('workers');
          }}
          onUpdate={async fields => {
            // /edit-worker only updates the reference photo — identified by the
            // editor's email plus the worker id.
            const r = await svc.submitWorkerUpdate({
              supervisorId: session.supervisorId,
              wardId: data.ward && (data.ward.wardId || data.ward.number),
              workerId: fields.workerId,
              email: session.email,
              photoUri: fields.photoUri,
              referenceUrl: fields.referenceUrl,
            });
            if (!r || r.ok || r.skipped) {
              Alert.alert(tr('editWorker'), tr('workerUpdated', {name: fields.fullName}));
            } else {
              Alert.alert(tr('editWorker'), tr('workerUpdateFailed', {msg: r.message || ''}));
            }
            loadBackendWorkspace();
            setScreen('workers');
          }}
        />
      );

    case 'addLeave':
      return (
        <AddLeaveScreen
          workers={data.workers}
          defaultShift={activeShift ? activeShift.shift_id : shiftId}
          activeShiftId={activeShiftId}
          onBack={goHome}
          onSaved={(leaves, worker, detail) => {
            setData(d => ({...d, leaves}));
            // Best-effort mirror: POST the leave to /add-leave.
            if (USE_BACKEND && worker.fromBackend && detail) {
              svc
                .submitLeave({
                  workerId: worker.workerId != null ? worker.workerId : worker.id,
                  leaveType: detail.type
                    ? detail.type.charAt(0).toUpperCase() + detail.type.slice(1)
                    : 'Casual',
                  shiftId: detail.bothShifts ? null : detail.shift,
                  fromDate: detail.from,
                  toDate: detail.to,
                  reason: detail.remarks || null,
                  supervisorId: session.supervisorId,
                })
                .then(r => {
                  if (r && !r.ok && !r.skipped) {
                    console.warn('add-leave sync failed:', r.message);
                  } else if (r && r.ok) {
                    loadBackendWorkspace(); // refresh on-leave / pending counts
                  }
                });
            }
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
          shiftId={shiftId}
          activeShiftId={activeShiftId}
          loading={showSkeleton}
          onChangePassword={() => setShowPasswordChange(true)}
          navigate={async target => {
            if (target === 'signOut') {
              await clearSession();
              setSession(null);
              setShowPasswordChange(false);
              setWorkspaceLoaded(!USE_BACKEND);
              setBackendCounts(null);
              setActiveShift(null);
              setProfileSkipped(false);
              setAttnBypass(false);
              setFailed({});
              return;
            }
            if (target === 'attendance') {
              // Open on the shift the backend reports as running (if any).
              setShiftId(activeShift ? activeShift.shift_id : currentShift().id);
            }
            // Re-pull the roster (with each worker's reference photo) whenever
            // entering attendance or the worker-management list.
            if (target === 'attendance' || target === 'workers') {
              loadBackendWorkspace();
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
