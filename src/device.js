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
