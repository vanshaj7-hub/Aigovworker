import {Linking, PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {launchImageLibrary} from 'react-native-image-picker';

/** Opens the OS location/GPS settings so the user can turn location on. */
export function openLocationSettings() {
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() =>
      Linking.openSettings().catch(() => {}),
    );
  } else {
    Linking.openURL('app-settings:').catch(() => {});
  }
}

/** Opens this app's settings page (to grant a denied permission). */
export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}

Geolocation.setRNConfiguration({skipPermissionRequests: true, authorizationLevel: 'whenInUse'});

export async function requestPermissions() {
  if (Platform.OS !== 'android') {
    return {camera: true, location: true};
  }
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return {
    camera: res[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED,
    location:
      res[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED,
  };
}

const shape = pos => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  at: new Date().toISOString(),
});

/** One-shot fix. Resolves null rather than rejecting, so attendance is never blocked by a throw. */
export function getLocation({timeout = 15000, maximumAge = 15000} = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    Geolocation.getCurrentPosition(
      pos => finish(shape(pos)),
      () => finish(null),
      {enableHighAccuracy: true, timeout, maximumAge},
    );
    setTimeout(() => finish(null), timeout + 1000);
  });
}

/**
 * Best-effort accurate one-shot fix. It samples for a short window and keeps the
 * reading with the smallest accuracy circle, resolving early once a fix good
 * enough for the geo-fence arrives. Crucially it never gets stuck with no fix:
 * it seeds immediately with a recent cached reading and, if the high-accuracy
 * GPS never locks (common indoors), falls back to that recent reading rather
 * than resolving null — which the caller would treat as "outside the ward".
 */
export function getBestLocation({window = 8000, desiredAccuracy = 35} = {}) {
  return new Promise(resolve => {
    let best = null;
    let watchId = null;
    let done = false;

    const better = fix =>
      !best ||
      (fix.accuracy != null && (best.accuracy == null || fix.accuracy < best.accuracy));

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      if (watchId !== null) {
        try {
          Geolocation.clearWatch(watchId);
        } catch (e) {
          // already cleared
        }
      }
      if (best) {
        resolve(best);
        return;
      }
      // Nothing arrived in the window — accept any recent cached fix (up to two
      // minutes old, coarse allowed) instead of failing, so a slow GPS lock does
      // not block attendance.
      Geolocation.getCurrentPosition(
        pos => resolve(shape(pos)),
        () => resolve(null),
        {enableHighAccuracy: false, timeout: 8000, maximumAge: 120000},
      );
    };

    const consider = pos => {
      const fix = shape(pos);
      if (better(fix)) {
        best = fix;
      }
      // Good enough — stop early rather than burning the whole window.
      if (fix.accuracy != null && fix.accuracy <= desiredAccuracy) {
        finish();
      }
    };

    try {
      watchId = Geolocation.watchPosition(consider, () => {}, {
        enableHighAccuracy: true,
        distanceFilter: 0,
        interval: 1000,
        fastestInterval: 500,
        maximumAge: 0,
      });
    } catch (e) {
      // watchPosition unavailable — the one-shots below still run
    }

    // Fresh high-accuracy attempt.
    Geolocation.getCurrentPosition(consider, () => {}, {
      enableHighAccuracy: true,
      timeout: window,
      maximumAge: 0,
    });
    // Immediate coarse/cached seed so `best` is populated fast and we are never
    // left with nothing to show while the GPS is still acquiring.
    Geolocation.getCurrentPosition(consider, () => {}, {
      enableHighAccuracy: false,
      timeout: window,
      maximumAge: 60000,
    });

    setTimeout(finish, window);
  });
}

/** Continuous updates for the live geo-fence chip. Returns an unsubscribe function. */
export function watchLocation(onChange) {
  let id = null;
  try {
    id = Geolocation.watchPosition(
      pos => onChange(shape(pos)),
      () => {},
      {enableHighAccuracy: true, distanceFilter: 5, interval: 3000, fastestInterval: 1500},
    );
  } catch (e) {
    return () => {};
  }
  return () => {
    if (id !== null) {
      try {
        Geolocation.clearWatch(id);
      } catch (e) {
        // watch already cleared
      }
    }
  };
}

/** Pick an existing photo — the gallery affordance on the capture screen. */
export async function pickFromGallery() {
  const res = await launchImageLibrary({mediaType: 'photo', quality: 0.9, selectionLimit: 1});
  if (res.didCancel || res.errorCode) {
    return null;
  }
  const asset = res.assets && res.assets[0];
  return asset && asset.uri ? asset.uri : null;
}
