import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import Svg, {Defs, Ellipse, Mask, Rect} from 'react-native-svg';
import RNFS from 'react-native-fs';
import FaceDetection from '@react-native-ml-kit/face-detection';
import {c} from '../theme';
import {useLang} from '../i18n';
import {Icon} from '../ui';
import {openAppSettings} from '../device';
import {shiftLabel} from '../domain/shifts';
import {avgEyeOpenProbability, initialLivenessState, nextLivenessState} from '../domain/liveness';

const {width: SW, height: SH} = Dimensions.get('window');
const OVAL = {cx: SW / 2, cy: SH * 0.40, rx: SW * 0.34, ry: SW * 0.44};

// How long to wait for even one usable eye-open sample before giving up on the
// liveness check and letting the shutter unlock anyway. A worker photo held up
// to the camera cannot blink on cue, so requiring a blink deters that — but if
// this ML Kit version/device never reports eye-open probabilities, failing
// open (rather than permanently blocking attendance) is the safer default.
const LIVENESS_TIMEOUT_MS = 8000;

const uriOf = p => (p.startsWith('file://') || p.startsWith('content://') ? p : 'file://' + p);

export default function CaptureScreen({
  worker,
  ward,
  shiftId,
  fence,
  requireLiveness,
  onCaptured,
  onCancel,
}) {
  const {t: tr} = useLang();
  // `worker` can briefly be null while the parent swaps screens after a capture.
  const workerName = (worker && worker.name) || '';
  const cam = useRef(null);
  const [position, setPosition] = useState('back');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [faceState, setFaceState] = useState('unknown'); // unknown | yes | no
  const [camPermission, setCamPermission] = useState('checking'); // checking | granted | denied
  const device = useCameraDevice(position);
  const alive = useRef(true);
  const livenessRef = useRef(initialLivenessState());
  const [livenessConfirmed, setLivenessConfirmed] = useState(!requireLiveness);
  const [livenessResetKey, setLivenessResetKey] = useState(0);

  useEffect(() => () => {
    alive.current = false;
  }, []);

  // Fail-open: if no eye-open sample ever arrives (unsupported device/ML Kit
  // version, or the preview snapshot loop never gets a usable frame), unlock
  // the shutter anyway after a few seconds rather than blocking attendance
  // entirely. Restarts each time capture() resets the check for a new attempt.
  useEffect(() => {
    if (!requireLiveness) {
      return undefined;
    }
    const id = setTimeout(() => {
      if (alive.current) {
        setLivenessConfirmed(true);
      }
    }, LIVENESS_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [requireLiveness, livenessResetKey]);

  // Confirm camera access up front; if it is blocked, offer to open settings.
  useEffect(() => {
    (async () => {
      let status = Camera.getCameraPermissionStatus();
      if (status !== 'granted') {
        status = await Camera.requestCameraPermission();
      }
      if (alive.current) {
        setCamPermission(status === 'granted' ? 'granted' : 'denied');
      }
    })();
  }, []);

  // Live face indicator. Uses cheap preview snapshots; if the platform cannot
  // provide them the chip simply stays neutral rather than lying.
  useEffect(() => {
    let timer = null;
    let running = false;
    const tick = async () => {
      if (running || busy || !cam.current || !alive.current) {
        return;
      }
      running = true;
      let snapPath = null;
      try {
        const snap = await cam.current.takeSnapshot({quality: 35});
        snapPath = snap && snap.path;
        if (snapPath) {
          const faces = await FaceDetection.detect(uriOf(snapPath), {
            performanceMode: 'fast',
            minFaceSize: 0.15,
            ...(requireLiveness ? {classificationMode: 'all'} : null),
          });
          if (alive.current) {
            setFaceState(faces && faces.length > 0 ? 'yes' : 'no');
          }
          if (requireLiveness && !livenessRef.current.confirmed) {
            const sample = faces && faces.length ? avgEyeOpenProbability(faces[0]) : null;
            livenessRef.current = nextLivenessState(livenessRef.current, sample);
            if (livenessRef.current.confirmed && alive.current) {
              setLivenessConfirmed(true);
            }
          }
        }
      } catch (e) {
        // Snapshotting unavailable on this device — leave the chip neutral.
      } finally {
        if (snapPath) {
          RNFS.unlink(snapPath).catch(() => {});
        }
        running = false;
      }
    };
    timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [busy, requireLiveness]);

  // Camera only. takePhoto gives a full-resolution frame; if the device or
  // emulator cannot service it we fall back to a preview snapshot (the same
  // call the face indicator uses, so it is known to work here) so a tap always
  // produces a photo rather than silently doing nothing.
  const capture = useCallback(async () => {
    if (busy || !cam.current || (requireLiveness && !livenessConfirmed)) {
      return;
    }
    setBusy(true);
    try {
      let uri = null;
      try {
        const photo = await cam.current.takePhoto({flash: torch ? 'on' : 'off'});
        uri = photo && photo.path ? uriOf(photo.path) : null;
      } catch (err) {
        try {
          const snap = await cam.current.takeSnapshot({quality: 90});
          uri = snap && snap.path ? uriOf(snap.path) : null;
        } catch (err2) {
          uri = null;
        }
      }
      if (!uri) {
        Alert.alert(tr('captureFailed'), tr('captureFailedBody'));
        return;
      }
      await onCaptured(uri);
    } finally {
      if (alive.current) {
        setBusy(false);
      }
      if (requireLiveness) {
        // Require a fresh confirmed check for every attempt, not just once per
        // screen visit — the same CaptureScreen instance stays mounted across a
        // rejected-match retry.
        livenessRef.current = initialLivenessState();
        setLivenessConfirmed(false);
        setLivenessResetKey(k => k + 1);
      }
    }
  }, [busy, torch, onCaptured, tr, requireLiveness, livenessConfirmed]);

  const inFence = fence.state !== 'outside';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={c.camBg} />
      {camPermission === 'denied' ? (
        <View style={[StyleSheet.absoluteFill, s.noCam]}>
          <Icon name="no-photography" size={44} color="#ffffff88" />
          <Text style={s.noCamText}>{tr('cameraBlockedBody')}</Text>
          <Pressable onPress={openAppSettings} style={s.settingsBtn}>
            <Text style={s.settingsBtnText}>{tr('openSettings')}</Text>
          </Pressable>
        </View>
      ) : device ? (
        <Camera
          ref={cam}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          photo
          torch={torch ? 'on' : 'off'}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.noCam]}>
          <Icon name="photo-camera" size={44} color="#ffffff55" />
          <Text style={s.noCamText}>
            {camPermission === 'checking' ? tr('checking') : tr('cameraUnavailable')}
          </Text>
        </View>
      )}

      {/* Dim everything outside the face oval */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="hole">
            <Rect x="0" y="0" width={SW} height={SH} fill="#fff" />
            <Ellipse cx={OVAL.cx} cy={OVAL.cy} rx={OVAL.rx} ry={OVAL.ry} fill="#000" />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={SW} height={SH} fill="rgba(20,22,24,0.55)" mask="url(#hole)" />
        <Ellipse
          cx={OVAL.cx}
          cy={OVAL.cy}
          rx={OVAL.rx}
          ry={OVAL.ry}
          stroke="#FFFFFF"
          strokeWidth={2.5}
          fill="none"
        />
      </Svg>

      <View style={s.topBar}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Icon name="close" size={26} color="#fff" />
        </Pressable>
        <View style={{flex: 1, marginLeft: 16}}>
          <Text style={s.workerName} numberOfLines={1}>
            {workerName}
          </Text>
          <Text style={s.workerSub}>
            {shiftLabel(tr, shiftId)} · {ward.shortName}
          </Text>
        </View>
        <Pressable onPress={() => setTorch(v => !v)} hitSlop={12} style={{marginRight: 18}}>
          <Icon name={torch ? 'flash-on' : 'flash-off'} size={24} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => setPosition(p => (p === 'back' ? 'front' : 'back'))}
          hitSlop={12}>
          <Icon name="flip-camera-android" size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={s.overlayBottom}>
        <View style={s.reminder}>
          <Icon name="no-photography" size={16} color="#FDD663" style={{marginRight: 8}} />
          <Text style={s.reminderText}>{tr('removeAccessories')}</Text>
        </View>
        <Chip
          ok={faceState === 'yes'}
          neutral={faceState === 'unknown'}
          icon={faceState === 'yes' ? 'face' : 'face-retouching-off'}
          label={faceState === 'yes' ? tr('faceDetected') : faceState === 'no' ? tr('noFaceYet') : tr('checking')}
        />
        <Chip
          ok={inFence}
          icon={inFence ? 'my-location' : 'wrong-location'}
          label={inFence ? tr('insideGeofence') : tr('outsideGeofence')}
        />
        {requireLiveness ? (
          <Chip
            ok={livenessConfirmed}
            icon={livenessConfirmed ? 'visibility' : 'remove-red-eye'}
            label={livenessConfirmed ? tr('livenessConfirmed') : tr('livenessPending')}
          />
        ) : null}
        <Text style={s.hint}>
          {requireLiveness && !livenessConfirmed ? tr('livenessHint') : tr('holdSteady')}
        </Text>
      </View>

      <View style={s.bottomBar}>
        <View style={{width: 27}} />
        <Pressable
          onPress={() => capture()}
          disabled={busy || !device || (requireLiveness && !livenessConfirmed)}
          style={s.shutterRing}>
          <View style={s.shutter}>
            {busy ? <ActivityIndicator color={c.primary} /> : null}
          </View>
        </Pressable>
        <Icon name="help-outline" size={27} color="#fff" />
      </View>
    </View>
  );
}

function Chip({icon, label, ok, neutral}) {
  const color = neutral ? '#DADCE0' : ok ? '#81C995' : '#F28B82';
  return (
    <View style={s.chip}>
      <Icon name={icon} size={17} color={color} style={{marginRight: 8}} />
      <Text style={s.chipLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: c.camBg},
  noCam: {alignItems: 'center', justifyContent: 'center', backgroundColor: c.camBg},
  noCamText: {color: '#ffffff88', marginTop: 14, fontSize: 14, textAlign: 'center', paddingHorizontal: 40},
  settingsBtn: {marginTop: 18, borderWidth: 1, borderColor: '#ffffff66', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10},
  settingsBtnText: {color: '#fff', fontSize: 14.5, fontWeight: '600'},

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(32,33,36,0.86)',
  },
  workerName: {color: '#fff', fontSize: 16.5, fontWeight: '600'},
  workerSub: {color: '#BDC1C6', fontSize: 13, marginTop: 1},

  overlayBottom: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 146,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.camChip,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginBottom: 10,
  },
  chipLabel: {color: '#fff', fontSize: 14, fontWeight: '500'},

  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(32,33,36,0.9)',
    borderColor: '#FDD663',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
    maxWidth: '100%',
  },
  reminderText: {color: '#FDD663', fontSize: 12.5, fontWeight: '600', flexShrink: 1},

  hint: {
    textAlign: 'center',
    color: '#E8EAED',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  shutterRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
