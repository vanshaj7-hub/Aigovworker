import {Image} from 'react-native';
import FaceDetection from '@react-native-ml-kit/face-detection';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import {decode as decodeJpeg} from 'jpeg-js';
import {toByteArray} from 'base64-js';
import {loadTensorflowModel} from 'react-native-fast-tflite';
import {
  OUT,
  bboxInverseMap,
  computeSquareCrop,
  cosineSimilarity as cosine,
  eyeAlignInverseMap,
  flipTensorH,
  l2normalize,
  sampleRGB,
} from './domain/faceMath';

// Cosine similarity required to count as the same person: a match above 65%
// marks the worker Present; anything at or below is treated as not matched (marked
// Absent, retryable). Real on-device captures (front-facing worker, variable
// light, jpeg) sit lower than the clean offline pairs did, and 0.70 was rejecting
// genuine same-person captures (seen ~0.66 with only a shirt change), so 0.65
// gives realistic captures room while still separating different people (typical
// impostors land well under ~0.4). Lower toward 0.55-0.6 only if genuine workers
// are still rejected; raise if a wrong person is ever accepted.
export const MATCH_THRESHOLD = 0.65;

// Resolution of the intermediate square crop we decode and sample from. Larger
// than the model input so the alignment resampling has detail to work with.
const DECODE = 256;

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
  return byArea[0];
}

/** Run the model on a HWC [-1,1] tensor and return the raw output vector. */
function embed(model, tensor) {
  return Array.from(model.runSync([tensor])[0]);
}

/**
 * Crop the image to a rectangle (in image pixels) at native resolution, no
 * resize — used to restrict matching to the face region the supervisor framed in
 * the on-screen oval. Cropping away the background also stops a bystander's face
 * from tripping the MULTIPLE_FACES guard.
 */
async function cropToRoi(photoUri, roi) {
  const crop = await ImageEditor.cropImage(photoUri, {
    offset: {x: Math.max(0, Math.round(roi.x)), y: Math.max(0, Math.round(roi.y))},
    size: {width: Math.round(roi.w), height: Math.round(roi.h)},
    format: 'jpeg',
    quality: 0.98,
  });
  return typeof crop === 'string' ? crop : crop.uri;
}

/**
 * Detect the prominent face, align it by its eyes onto the canonical template,
 * resample to the model input with bilinear filtering, and return the
 * L2-normalized embedding averaged with its horizontal mirror for robustness.
 * Also returns a square face crop URI for display.
 *
 * Pass `opts.roi` ({x, y, w, h} in image pixels — the oval region on the capture
 * screen) to match against only that region. If the ROI has no usable face (e.g.
 * a bad crop) we fall back to the whole image, so ROI can only help, never regress.
 */
export async function extractFaceEmbedding(photoUri, opts = {}) {
  if (opts && opts.roi) {
    try {
      const roiUri = await cropToRoi(photoUri, opts.roi);
      return await extractFromImage(roiUri);
    } catch (e) {
      // ROI produced no clean face (or the crop failed) — fall through and try the
      // whole frame, which is exactly what we would have done without an ROI.
    }
  }
  return await extractFromImage(photoUri);
}

async function extractFromImage(photoUri) {
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

  // Average the embedding with its horizontal mirror (test-time augmentation) —
  // a cheap, standard way to get a more stable face representation.
  const e1 = embed(model, input);
  const e2 = embed(model, flipTensorH(input, OUT, OUT, 3));
  const avg = e1.map((v, i) => (v + e2[i]) / 2);
  return {embedding: l2normalize(avg), faceUri: cropUri};
}

export function faceErrorMessage(err, tr) {
  const code = err && err.message;
  if (!tr) {
    return code === 'NO_FACE'
      ? 'No face detected.'
      : code === 'MULTIPLE_FACES'
      ? 'More than one face in the frame.'
      : `Face processing failed: ${code || 'unknown error'}`;
  }
  if (code === 'NO_FACE') {
    return tr('noFaceBody');
  }
  if (code === 'MULTIPLE_FACES') {
    return tr('manyFacesBody');
  }
  return `${tr('noFaceTitle')}: ${code || ''}`.trim();
}
