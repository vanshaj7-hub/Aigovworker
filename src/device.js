import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {launchImageLibrary} from 'react-native-image-picker';

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
 * Best-effort accurate one-shot fix. A single getCurrentPosition can hand back a
 * stale, coarse network fix (hundreds of metres off); this samples for a short
 * window and keeps the reading with the smallest accuracy circle, resolving
 * early once a fix good enough for the geo-fence arrives. Resolves null (never
 * rejects) if nothing usable is obtained in time.
 */
export function getBestLocation({window = 6000, desiredAccuracy = 35} = {}) {
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
      resolve(best);
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
      // watchPosition unavailable — the one-shot below still runs
    }

    // Seed with a fresh one-shot too, in case the watch is slow to emit.
    Geolocation.getCurrentPosition(consider, () => {}, {
      enableHighAccuracy: true,
      timeout: window,
      maximumAge: 0,
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
