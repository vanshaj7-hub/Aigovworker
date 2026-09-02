import {Image} from 'react-native';
import FaceDetection from '@react-native-ml-kit/face-detection';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import {decode as decodeJpeg} from 'jpeg-js';
import {toByteArray} from 'base64-js';
import {loadTensorflowModel} from 'react-native-fast-tflite';

// Cosine similarity above which two embeddings are treated as the same person.
// MobileFaceNet genuine pairs typically score > 0.6; impostors < 0.35.
export const MATCH_THRESHOLD = 0.55;

const FACE_MARGIN = 0.2;

let modelPromise = null;

export function getModel() {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(
      require('./assets/mobile_face_net.tflite'),
    );
  }
  return modelPromise;
}

function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({width, height}),
      reject,
    );
  });
}

async function pickProminentFace(photoUri) {
  const faces = await FaceDetection.detect(photoUri, {
    performanceMode: 'accurate',
    minFaceSize: 0.1,
  });
  if (!faces || faces.length === 0) {
    throw new Error('NO_FACE');
  }
  const byArea = [...faces].sort(
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

function l2normalize(vec) {
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => v / norm);
}

export function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Full pipeline: detect the prominent face in the photo, crop it with a
 * margin, resize to the model input size, and return the L2-normalized
 * embedding plus the cropped face thumbnail URI.
 */
export async function extractFaceEmbedding(photoUri) {
  const model = await getModel();
  const inputShape = model.inputs[0].shape; // e.g. [1, 112, 112, 3]
  const inputH = inputShape[1];
  const inputW = inputShape[2];

  const face = await pickProminentFace(photoUri);
  const {width: imgW, height: imgH} = await getImageSize(photoUri);

  const f = face.frame;
  const marginX = f.width * FACE_MARGIN;
  const marginY = f.height * FACE_MARGIN;
  const x = Math.max(0, Math.round(f.left - marginX));
  const y = Math.max(0, Math.round(f.top - marginY));
  const w = Math.min(imgW - x, Math.round(f.width + marginX * 2));
  const h = Math.min(imgH - y, Math.round(f.height + marginY * 2));
  if (w <= 0 || h <= 0) {
    throw new Error('NO_FACE');
  }

  const crop = await ImageEditor.cropImage(photoUri, {
    offset: {x, y},
    size: {width: w, height: h},
    displaySize: {width: inputW, height: inputH},
    resizeMode: 'stretch',
    format: 'jpeg',
    quality: 0.95,
  });
  const cropUri = typeof crop === 'string' ? crop : crop.uri;

  const base64 = await RNFS.readFile(cropUri, 'base64');
  const jpegBytes = toByteArray(base64);
  const {width: dw, height: dh, data} = decodeJpeg(jpegBytes, {
    useTArray: true,
  });

  // RGBA -> normalized RGB float tensor, nearest-neighbor sampled if the
  // decoded size differs from the model input size.
  const input = new Float32Array(inputW * inputH * 3);
  for (let py = 0; py < inputH; py++) {
    const sy = dh === inputH ? py : Math.min(dh - 1, Math.floor((py * dh) / inputH));
    for (let px = 0; px < inputW; px++) {
      const sx = dw === inputW ? px : Math.min(dw - 1, Math.floor((px * dw) / inputW));
      const si = (sy * dw + sx) * 4;
      const di = (py * inputW + px) * 3;
      input[di] = (data[si] - 127.5) / 127.5;
      input[di + 1] = (data[si + 1] - 127.5) / 127.5;
      input[di + 2] = (data[si + 2] - 127.5) / 127.5;
    }
  }

  const outputs = model.runSync([input]);
  const embedding = l2normalize(Array.from(outputs[0]));
  return {embedding, faceUri: cropUri};
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
