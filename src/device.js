import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {launchCamera} from 'react-native-image-picker';

export async function requestAppPermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return (
    result[PermissionsAndroid.PERMISSIONS.CAMERA] ===
    PermissionsAndroid.RESULTS.GRANTED
  );
}

/**
 * Opens the camera and resolves with {uri} of the captured photo,
 * or null if the user cancelled.
 */
export async function capturePhoto(useFrontCamera = false) {
  const result = await launchCamera({
    mediaType: 'photo',
    cameraType: useFrontCamera ? 'front' : 'back',
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.9,
    saveToPhotos: false,
    includeBase64: false,
  });
  if (result.didCancel) {
    return null;
  }
  if (result.errorCode) {
    throw new Error(result.errorMessage || result.errorCode);
  }
  const asset = result.assets && result.assets[0];
  if (!asset || !asset.uri) {
    throw new Error('Camera returned no image');
  }
  return asset;
}

/**
 * Resolves with {lat, lng, accuracy} or null if location is unavailable
 * within the timeout. Attendance still gets recorded without location.
 */
export function getLocation() {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 30000},
    );
  });
}
