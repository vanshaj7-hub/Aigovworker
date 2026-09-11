import {Image} from 'react-native';
import FaceDetection from '@react-native-ml-kit/face-detection';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import {decode as decodeJpeg} from 'jpeg-js';
import {toByteArray} from 'base64-js';
import {loadTensorflowModel} from 'react-native-fast-tflite';
import {
  MAX_BRIGHTNESS,
  MIN_BRIGHTNESS,
  MIN_SHARPNESS,
  OUT,
  averageEmbeddings,
  bboxInverseMap,
  computeSquareCrop,
  cosineSimilarity as cosine,
  eyeAlignInverseMap,
  eyeGeometryPlausible,
  flipTensorH,
  l2normalize,
  sampleRGB,
  tensorQuality,
} from './domain/faceMath';

// Cosine similarity required to count as the same person: only a match above 70%
// marks the worker Present; anything at or below is treated as not matched (marked
// Absent, retryable). Offline testing on the real model put genuine captures at
// ~0.88+ and different people below ~0.27, so 0.70 keeps a wide margin over
// impostors. Lower toward 0.5-0.6 if genuine workers get wrongly rejected.
export const MATCH_THRESHOLD = 0.7;

// Resolution of the intermediate square crop we decode and sample from. Larger
// than the model input so the alignment resampling has detail to work with.
const DECODE = 256;

// Number of photos captured per worker enrollment/reference update, averaged
// into one reference embedding (see captureReferenceEmbedding below).
export const REFERENCE_SHOTS = 3;

export const cosineSimilarity = cosine;

let modelPromise = null;

export function getModel() {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(require('./assets/mobile_face_net.tflite'));
  }
  return modelPromise;
}

function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({width, height}), reject);
  });
}

/** Detect faces (with landmarks) and return the single prominent one. */
async function pickProminentFace(photoUri) {
  const faces = await FaceDetection.detect(photoUri, {
    performanceMode: 'accurate',
    landmarkMode: 'all',
    minFaceSize: 0.1,
  });
  if (!faces || faces.length === 0) {
    throw new Error('NO_FACE');
  }
  // Require detections that actually carry both eye landmark positions. A real
  // face always has locatable eyes; a covered/dark or heavily blurred frame makes
  // ML Kit occasionally report a "face" region with no landmarks. Those are false
  // positives — and unalignable — so if none qualify we treat it as NO_FACE
  // rather than running the model on noise (which used to yield a bogus ~50%
  // "match" when the camera was covered). Eyes are also what the alignment needs.
  const withEyes = faces.filter(
    f =>
      f.landmarks &&
      f.landmarks.leftEye &&
      f.landmarks.leftEye.position &&
      f.landmarks.rightEye &&
      f.landmarks.rightEye.position,
  );
  if (withEyes.length === 0) {
    throw new Error('NO_FACE');
  }
  const pool = withEyes;
  const byArea = [...pool].sort(
    (a, b) => b.frame.width * b.frame.height - a.frame.width * a.frame.height,
  );
  if (byArea.length > 1) {
    const first = byArea[0].frame.width * byArea[0].frame.height;
    const second = byArea[1].frame.width * byArea[1].frame.height;
    if (second > first * 0.5) {
      throw new Error('MULTIPLE_FACES');
    }
  }
  const face = byArea[0];
  // Reject implausible eye geometry (too close/far apart for the face box, or
  // an impossible tilt) before it is ever used for alignment. ML Kit's
  // landmarks are noisier than the MediaPipe iris points the matching
  // threshold was originally validated against offline, and a bad pair still
  // "succeeds" here — it just warps the crop and narrows genuine/impostor
  // separation on-device (this is the leading suspect for impostors scoring
  // 60-65% instead of the ~27% seen offline). Bad geometry is treated the same
  // as NO_FACE: retake, rather than silently matching on a warped face.
  const {leftEye, rightEye} = face.landmarks;
  if (!eyeGeometryPlausible(leftEye.position, rightEye.position, face.frame)) {
    throw new Error('NO_FACE');
  }
  return face;
}

/**
 * Run the model on a HWC [-1,1] tensor and return the raw output vector.
 * react-native-fast-tflite's native call has occasionally been seen to throw a
 * raw, one-off native error under load (e.g. contention with the ML Kit calls
 * also running); a single retry clears a transient hiccup, and a real failure
 * is normalized to MODEL_ERROR instead of leaking a raw native string that
 * looks different — and unrecognisable — every time it happens.
 */
function embed(model, tensor) {
  try {
    return Array.from(model.runSync([tensor])[0]);
  } catch (e) {
    try {
      return Array.from(model.runSync([tensor])[0]);
    } catch (e2) {
      throw new Error('MODEL_ERROR');
    }
  }
}

/**
 * Full pipeline: detect the prominent face, align it by its eyes onto the
 * canonical template (falling back to the bounding box when landmarks are
 * missing), resample to the model input with bilinear filtering, and return the
 * L2-normalized embedding averaged with its horizontal mirror for robustness,
 * plus the blur/exposure quality score computed on those same pixels.
 */
export async function extractFaceEmbedding(photoUri) {
  const model = await getModel();
  const face = await pickProminentFace(photoUri);
  const {width: imgW, height: imgH} = await getImageSize(photoUri);

  const {x: cropX, y: cropY, size: cropSize} = computeSquareCrop(face.frame, imgW, imgH);
  if (cropSize < 8) {
    throw new Error('NO_FACE');
  }

  let crop;
  try {
    crop = await ImageEditor.cropImage(photoUri, {
      offset: {x: cropX, y: cropY},
      size: {width: cropSize, height: cropSize},
      displaySize: {width: DECODE, height: DECODE},
      resizeMode: 'cover',
      format: 'jpeg',
      quality: 0.98,
    });
  } catch (e) {
    // computeSquareCrop already clamps to integer, in-bounds coordinates, so this
    // should not fire. But if the platform's decoded bitmap dimensions ever
    // disagree with Image.getSize (e.g. EXIF-orientation differences), don't leak
    // a raw native error like "y + height must be <= bitmap.height()" to the
    // supervisor — treat it as no usable face so they simply retry.
    throw new Error('NO_FACE');
  }
  const cropUri = typeof crop === 'string' ? crop : crop.uri;

  const base64 = await RNFS.readFile(cropUri, 'base64');
  // The crop file is only needed to get these bytes into memory — nothing
  // downstream reads it back from disk. Every capture used to leave one of
  // these behind in the cache with nothing ever cleaning them up.
  RNFS.unlink(cropUri).catch(() => {});
  const {width: dw, height: dh, data} = decodeJpeg(toByteArray(base64), {useTArray: true});

  // original px -> decoded crop px (use the real decoded dims, not the request).
  const scaleX = dw / cropSize;
  const scaleY = dh / cropSize;
  const lm = face.landmarks || {};
  const le = lm.leftEye && lm.leftEye.position;
  const re = lm.rightEye && lm.rightEye.position;

  let mapFn;
  if (le && re) {
    // Eye points in decoded-crop coordinates. Order them by image position
    // (left-most eye -> left template point) rather than ML Kit's subject-relative
    // left/right naming, so the aligned face keeps its true orientation.
    const a = {x: (le.x - cropX) * scaleX, y: (le.y - cropY) * scaleY};
    const b = {x: (re.x - cropX) * scaleX, y: (re.y - cropY) * scaleY};
    const [imgLeft, imgRight] = a.x <= b.x ? [a, b] : [b, a];
    mapFn = eyeAlignInverseMap(imgLeft, imgRight);
  } else {
    mapFn = bboxInverseMap({
      x: (face.frame.left - cropX) * scaleX,
      y: (face.frame.top - cropY) * scaleY,
      w: face.frame.width * scaleX,
      h: face.frame.height * scaleY,
    });
  }

  // Build the aligned [-1,1] RGB tensor.
  const input = new Float32Array(OUT * OUT * 3);
  for (let oy = 0; oy < OUT; oy++) {
    for (let ox = 0; ox < OUT; ox++) {
      const [sx, sy] = mapFn(ox, oy);
      const [r, g, b] = sampleRGB(data, dw, dh, sx, sy);
      const di = (oy * OUT + ox) * 3;
      input[di] = (r - 127.5) / 127.5;
      input[di + 1] = (g - 127.5) / 127.5;
      input[di + 2] = (b - 127.5) / 127.5;
    }
  }

  // Reject capture conditions the model was never going to do well on, using
  // the exact pixels it would be fed — computed before running the (more
  // expensive) model at all. Thresholds are starting points; tune them from
  // real captures (see storage.js's match-log export).
  const quality = tensorQuality(input);
  if (quality.sharpness < MIN_SHARPNESS) {
    throw new Error('LOW_QUALITY_BLUR');
  }
  if (quality.brightness < MIN_BRIGHTNESS) {
    throw new Error('LOW_QUALITY_DARK');
  }
  if (quality.brightness > MAX_BRIGHTNESS) {
    throw new Error('LOW_QUALITY_BRIGHT');
  }

  // Average the embedding with its horizontal mirror (test-time augmentation) —
  // a cheap, standard way to get a more stable face representation.
  const e1 = embed(model, input);
  const e2 = embed(model, flipTensorH(input, OUT, OUT, 3));
  const avg = e1.map((v, i) => (v + e2[i]) / 2);
  return {embedding: l2normalize(avg), quality};
}

/**
 * Enrollment helper: takes several photos (via the caller-supplied
 * `requestShot(index, total)`, which resolves a file:// URI or null on
 * cancel), embeds each, and returns the L2-normalized centroid plus the
 * sharpest of the captured photos to keep as the uploaded reference image.
 *
 * A single enrollment photo makes the reference embedding fragile to that
 * one shot's lighting/pose/expression — which is what kept forcing
 * MATCH_THRESHOLD down across earlier tuning passes (see the commit history
 * on this constant). Averaging several real shots is standard practice for a
 * more stable reference and buys back headroom to raise the threshold instead.
 *
 * Any detection/quality error on a shot aborts the whole enrollment (the
 * caller shows the usual faceErrorMessage alert and the supervisor starts
 * over) rather than silently keeping a partial, possibly-bad average.
 */
export async function captureReferenceEmbedding(requestShot, {shots = REFERENCE_SHOTS} = {}) {
  const embeddings = [];
  let bestUri = null;
  let bestSharpness = -Infinity;
  for (let i = 0; i < shots; i++) {
    const uri = await requestShot(i, shots);
    if (!uri) {
      if (embeddings.length === 0) {
        return null; // cancelled before capturing anything usable
      }
      break; // backed out after at least one good shot — use what we have
    }
    const {embedding, quality} = await extractFaceEmbedding(uri);
    embeddings.push(embedding);
    if (quality.sharpness > bestSharpness) {
      bestSharpness = quality.sharpness;
      bestUri = uri;
    }
  }
  return {embedding: averageEmbeddings(embeddings), photoUri: bestUri};
}

export function faceErrorMessage(err, tr) {
  const code = err && err.message;
  if (!tr) {
    if (code === 'NO_FACE') return 'No face detected.';
    if (code === 'MULTIPLE_FACES') return 'More than one face in the frame.';
    if (code === 'LOW_QUALITY_BLUR') return 'The photo is too blurry.';
    if (code === 'LOW_QUALITY_DARK') return 'The photo is too dark.';
    if (code === 'LOW_QUALITY_BRIGHT') return 'The photo is too bright/washed out.';
    if (code === 'MODEL_ERROR') return 'Face processing failed. Please try again.';
    return `Face processing failed: ${code || 'unknown error'}`;
  }
  if (code === 'NO_FACE') {
    return tr('noFaceBody');
  }
  if (code === 'MULTIPLE_FACES') {
    return tr('manyFacesBody');
  }
  if (code === 'LOW_QUALITY_BLUR') {
    return tr('lowQualityBlurBody');
  }
  if (code === 'LOW_QUALITY_DARK') {
    return tr('lowQualityDarkBody');
  }
  if (code === 'LOW_QUALITY_BRIGHT') {
    return tr('lowQualityBrightBody');
  }
  if (code === 'MODEL_ERROR') {
    return tr('modelErrorBody');
  }
  return `${tr('noFaceTitle')}: ${code || ''}`.trim();
}
