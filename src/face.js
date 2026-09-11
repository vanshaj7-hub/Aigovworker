import {Image, NativeModules} from 'react-native';
import FaceDetection from '@react-native-ml-kit/face-detection';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import {
  MAX_BRIGHTNESS,
  MIN_BRIGHTNESS,
  MIN_SHARPNESS,
  averageEmbeddings,
  computeSquareCrop,
  cosineSimilarity as cosine,
  eyeGeometryPlausible,
} from './domain/faceMath';

// Face alignment (2-point similarity warp against the ArcFace template),
// pixel normalization and TFLite inference all run natively (see
// android/app/src/main/java/com/attendanceapp/facenative/FaceEmbedModule.kt)
// instead of the hand-rolled JS crop/decode/bilinear-sample pipeline this used
// to be — Android's own Bitmap/Canvas/Matrix APIs are far more battle-tested
// than a per-pixel JS sampler for this. Detection/landmarks (ML Kit) and the
// initial square crop (ImageEditor.cropImage, which already handles
// EXIF/orientation correctly) still happen here in JS; only the alignment
// warp, normalization and model call moved native. Same bundled model, same
// alignment template and normalization convention as before, so existing
// enrolled reference embeddings stay valid — nothing needs re-enrolling.
const {FaceEmbed} = NativeModules;

// Cosine similarity required to count as the same person: only a match above 70%
// marks the worker Present; anything at or below is treated as not matched (marked
// Absent, retryable). Offline testing on the real model put genuine captures at
// ~0.88+ and different people below ~0.27, so 0.70 keeps a wide margin over
// impostors. Lower toward 0.5-0.6 if genuine workers get wrongly rejected.
export const MATCH_THRESHOLD = 0.7;

// Resolution of the intermediate square crop handed to the native module.
// Larger than the model's 112x112 input so the alignment warp has detail to
// work with.
const DECODE = 256;

// Number of photos captured per worker enrollment/reference update, averaged
// into one reference embedding (see captureReferenceEmbedding below).
export const REFERENCE_SHOTS = 3;

export const cosineSimilarity = cosine;

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
  // positives — and unalignable — so if none qualify we reject them (distinct
  // from NO_FACE — ML Kit did find something, just not alignable) rather than
  // running the model on noise (which used to yield a bogus ~50% "match" when
  // the camera was covered). Eyes are also what the alignment needs.
  const withEyes = faces.filter(
    f =>
      f.landmarks &&
      f.landmarks.leftEye &&
      f.landmarks.leftEye.position &&
      f.landmarks.rightEye &&
      f.landmarks.rightEye.position,
  );
  if (withEyes.length === 0) {
    throw new Error('NO_EYE_LANDMARKS');
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
  // 60-65% instead of the ~27% seen offline). Logged as its own code (distinct
  // from NO_FACE / NO_EYE_LANDMARKS) so the match-log CSV shows exactly which
  // of the three actually fired instead of masking them all identically.
  const {leftEye, rightEye} = face.landmarks;
  if (!eyeGeometryPlausible(leftEye.position, rightEye.position, face.frame)) {
    throw new Error('BAD_EYE_GEOMETRY');
  }
  return face;
}

/**
 * Full pipeline: detect the prominent face, crop a square region around it
 * (ImageEditor.cropImage — handles EXIF/orientation), then hand that crop plus
 * the two eye positions to the native module, which aligns them onto the
 * canonical ArcFace template, runs the model, and returns the L2-normalized
 * embedding (averaged with its horizontal mirror) plus a blur/exposure
 * quality score computed on the same aligned pixels.
 */
export async function extractFaceEmbedding(photoUri) {
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

  // pickProminentFace already guarantees both eye landmarks are present (it
  // throws NO_EYE_LANDMARKS otherwise), so there is no bbox-only fallback path
  // to carry over here. Coordinates are passed relative to the crop's
  // top-left corner, in the ORIGINAL photo's pixel units — the native module
  // derives its own scale factor from the actual decoded bitmap width, the
  // same defensive real-vs-requested-size handling this used to do in JS.
  const {leftEye, rightEye} = face.landmarks;

  let result;
  try {
    result = await FaceEmbed.extractEmbedding(cropUri, {
      leftEyeX: leftEye.position.x - cropX,
      leftEyeY: leftEye.position.y - cropY,
      rightEyeX: rightEye.position.x - cropX,
      rightEyeY: rightEye.position.y - cropY,
      cropSize,
    });
  } catch (e) {
    throw new Error('MODEL_ERROR');
  } finally {
    RNFS.unlink(cropUri).catch(() => {});
  }

  // Reject capture conditions the model was never going to do well on.
  // Thresholds are starting points; tune them from real captures (see
  // storage.js's match-log export).
  const quality = {sharpness: result.sharpness, brightness: result.brightness};
  if (quality.sharpness < MIN_SHARPNESS) {
    throw new Error('LOW_QUALITY_BLUR');
  }
  if (quality.brightness < MIN_BRIGHTNESS) {
    throw new Error('LOW_QUALITY_DARK');
  }
  if (quality.brightness > MAX_BRIGHTNESS) {
    throw new Error('LOW_QUALITY_BRIGHT');
  }

  return {embedding: result.embedding, quality};
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
    if (code === 'NO_EYE_LANDMARKS') return "Face detected, but the eyes aren't clear enough.";
    if (code === 'BAD_EYE_GEOMETRY') return 'The face angle looks off.';
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
  if (code === 'NO_EYE_LANDMARKS') {
    return tr('noEyesBody');
  }
  if (code === 'BAD_EYE_GEOMETRY') {
    return tr('badGeometryBody');
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
