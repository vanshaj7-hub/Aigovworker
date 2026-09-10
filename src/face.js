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

// Cosine similarity above which two embeddings are treated as the same person.
// With aligned crops and flip-averaged embeddings, genuine pairs sit comfortably
// above this and different people well below it.
export const MATCH_THRESHOLD = 0.55;

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
  // Prefer detections that actually have both eye landmarks: a real face has
  // eyes, so this filters the occasional non-face region ML Kit reports (which is
  // what caused wrong-area crops). Fall back to all detections if none qualify.
  const withEyes = faces.filter(
    f => f.landmarks && f.landmarks.leftEye && f.landmarks.rightEye,
  );
  const pool = withEyes.length ? withEyes : faces;
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
 * Full pipeline: detect the prominent face, align it by its eyes onto the
 * canonical template (falling back to the bounding box when landmarks are
 * missing), resample to the model input with bilinear filtering, and return the
 * L2-normalized embedding averaged with its horizontal mirror for robustness.
 * Also returns a square face crop URI for display.
 */
export async function extractFaceEmbedding(photoUri) {
  const model = await getModel();
  const face = await pickProminentFace(photoUri);
  const {width: imgW, height: imgH} = await getImageSize(photoUri);

  const {x: cropX, y: cropY, size: cropSize} = computeSquareCrop(face.frame, imgW, imgH);
  if (cropSize < 8) {
    throw new Error('NO_FACE');
  }

  const crop = await ImageEditor.cropImage(photoUri, {
    offset: {x: cropX, y: cropY},
    size: {width: cropSize, height: cropSize},
    displaySize: {width: DECODE, height: DECODE},
    resizeMode: 'cover',
    format: 'jpeg',
    quality: 0.98,
  });
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
