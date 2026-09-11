// Pure (no React-Native/model dependencies) maths for the face pipeline, so it
// can be unit-tested with node. face.js does the native detect/crop/decode and
// the TFLite inference, and calls into here for the geometry and vector maths.

// Model input size.
export const OUT = 112;

// Canonical eye positions for a 112x112 aligned face — the two eye points of the
// widely used ArcFace 5-point template. Aligning every face so its eyes land on
// these points is what MobileFaceNet expects; feeding an unaligned, stretched
// bounding box (the old behaviour) is the main reason matches were weak.
export const TGT_LEFT_EYE = {x: 38.2946, y: 51.6963};
export const TGT_RIGHT_EYE = {x: 73.5318, y: 51.5014};

export function l2normalize(vec) {
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  return vec.map(v => v / norm);
}

/** Cosine similarity of two L2-normalized embeddings (a plain dot product). */
export function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * A square region around the face (side = factor × the larger bbox dimension),
 * centred on the face and clamped inside the image. Kept square so the later
 * resize introduces no aspect distortion.
 *
 * All arithmetic is done as integers and the rectangle is clamped AFTER rounding,
 * so the returned crop always satisfies 0 <= x, 0 <= y, x + size <= imgW and
 * y + size <= imgH. Rounding x/y/size independently (the old behaviour) could push
 * y + size one pixel past the image height when a large face sat near an edge,
 * which made ImageEditor.cropImage throw "y + height must be <= bitmap.height()".
 */
export function computeSquareCrop(face, imgW, imgH, factor = 2.0) {
  const W = Math.floor(imgW);
  const H = Math.floor(imgH);
  const cx = face.left + face.width / 2;
  const cy = face.top + face.height / 2;
  let size = Math.max(face.width, face.height) * factor;
  size = Math.floor(Math.min(size, W, H));
  let x = Math.round(cx - size / 2);
  let y = Math.round(cy - size / 2);
  // Clamp the (already integer) rectangle fully inside the image.
  if (x < 0) x = 0;
  else if (x + size > W) x = W - size;
  if (y < 0) y = 0;
  else if (y + size > H) y = H - size;
  return {x, y, size};
}

/**
 * Inverse map for eye alignment: given the two detected eye points (in the
 * coordinate space of the decoded crop), returns f(ox, oy) -> [sx, sy] that, for
 * each output pixel in the 112x112 aligned image, gives the source pixel to
 * sample. It is the inverse of the unique similarity transform (scale + rotation
 * + translation) that maps the detected eyes onto TGT_LEFT_EYE / TGT_RIGHT_EYE.
 */
export function eyeAlignInverseMap(L, R, tgtL = TGT_LEFT_EYE, tgtR = TGT_RIGHT_EYE) {
  const dPx = R.x - L.x;
  const dPy = R.y - L.y;
  const dQx = tgtR.x - tgtL.x;
  const dQy = tgtR.y - tgtL.y;
  const dP = Math.hypot(dPx, dPy) || 1;
  const dQ = Math.hypot(dQx, dQy) || 1;
  const s = dQ / dP; // forward scale (source -> output)
  const alpha = Math.atan2(dQy, dQx) - Math.atan2(dPy, dPx); // forward rotation
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  // Forward: q = s·Rot(alpha)·p + t, with t chosen so L -> tgtL.
  const rLx = cosA * L.x - sinA * L.y;
  const rLy = sinA * L.x + cosA * L.y;
  const tx = tgtL.x - s * rLx;
  const ty = tgtL.y - s * rLy;
  // Inverse: p = Rot(-alpha)·(q - t)/s.
  return (ox, oy) => {
    const ux = (ox - tx) / s;
    const uy = (oy - ty) / s;
    return [cosA * ux + sinA * uy, -sinA * ux + cosA * uy];
  };
}

/**
 * Fallback map when no eye landmarks are available: map the face bounding box
 * (in decoded-crop coordinates), grown by `margin`, across the 112x112 output.
 */
export function bboxInverseMap(faceInCrop, margin = 0.25) {
  const rx = faceInCrop.x - faceInCrop.w * margin;
  const ry = faceInCrop.y - faceInCrop.h * margin;
  const rw = faceInCrop.w * (1 + 2 * margin);
  const rh = faceInCrop.h * (1 + 2 * margin);
  return (ox, oy) => [rx + (ox / (OUT - 1)) * rw, ry + (oy / (OUT - 1)) * rh];
}

/** Bilinear sample of the RGB at (x, y) from an RGBA buffer; edges are clamped. */
export function sampleRGB(data, w, h, x, y) {
  if (x < 0) x = 0;
  else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0;
  else if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
    const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
  return out;
}

/** Horizontally mirror a HWC float tensor (used for flip test-time augmentation). */
export function flipTensorH(t, w, h, c) {
  const out = new Float32Array(t.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * c;
      const dst = (y * w + (w - 1 - x)) * c;
      for (let k = 0; k < c; k++) {
        out[dst + k] = t[src + k];
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------- quality gates
 *
 * The on-device model is only as good as the landmarks and the crop it is fed.
 * Field testing showed impostors scoring 60-65% (vs. the ~0.27 seen in offline
 * Python validation) — the offline numbers were produced with high-precision
 * MediaPipe iris landmarks, while the shipped app aligns on ML Kit's coarser
 * face landmarks. A bad landmark pair still "succeeds" (no exception), it just
 * produces a warped crop that narrows genuine/impostor separation. These gates
 * catch the geometrically-implausible cases before they reach the model, and
 * the blur/exposure gate catches capture conditions the model was never going
 * to do well on either way.
 *
 * The specific numbers below are starting points, not measured constants —
 * calibrate them from real captures (see storage.js's match-log export) the
 * same way MATCH_THRESHOLD itself was tuned.
 */

export const EYE_DIST_RATIO_MIN = 0.28; // eyes implausibly close together for the face box
export const EYE_DIST_RATIO_MAX = 0.62; // eyes implausibly far apart for the face box
export const MAX_ROLL_DEG = 40; // beyond this, a genuine attendance photo — or the landmarks — can't be trusted

/**
 * Sanity-checks a detected eye pair against its face box before trusting it for
 * alignment. Order-independent (leftEye/rightEye vs. image-left/image-right
 * doesn't matter here, only their separation and tilt).
 */
export function eyeGeometryPlausible(L, R, face) {
  const eyeDist = Math.hypot(R.x - L.x, R.y - L.y);
  const boxSize = Math.max(face.width, face.height) || 1;
  const ratio = eyeDist / boxSize;
  if (!(ratio >= EYE_DIST_RATIO_MIN && ratio <= EYE_DIST_RATIO_MAX)) {
    return false;
  }
  const rawDeg = Math.abs((Math.atan2(R.y - L.y, R.x - L.x) * 180) / Math.PI);
  const roll = rawDeg > 90 ? 180 - rawDeg : rawDeg; // fold so eye order doesn't matter
  return roll <= MAX_ROLL_DEG;
}

export const MIN_SHARPNESS = 15; // below this the aligned crop reads as motion-blurred/out-of-focus
export const MIN_BRIGHTNESS = 35; // near-black frame (covered lens, heavy backlight/silhouette)
export const MAX_BRIGHTNESS = 235; // blown-out highlights, no usable texture left

/**
 * Cheap blur/exposure score computed directly on the final aligned [-1,1] RGB
 * tensor — the same pixels the embedding is computed from, so a bad score
 * means the embedding itself is unreliable, not just the source photo.
 * `sharpness` is a Laplacian-variance edge-energy measure (higher = crisper);
 * `brightness` is the mean luma rescaled to 0-255.
 */
export function tensorQuality(tensor, w = OUT, h = OUT) {
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    const v = (tensor[o] + tensor[o + 1] + tensor[o + 2]) / 3;
    gray[i] = v;
    sum += v;
  }
  const brightness = (sum / (w * h)) * 127.5 + 127.5;
  let lapSum = 0;
  let lapSumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap;
      lapSumSq += lap * lap;
      n++;
    }
  }
  const mean = n ? lapSum / n : 0;
  const variance = n ? lapSumSq / n - mean * mean : 0;
  // Rescale from the tensor's [-1,1] range to an 8-bit-equivalent range so this
  // reads like the standard Laplacian-variance blur metrics used elsewhere.
  const sharpness = variance * (127.5 * 127.5);
  return {brightness, sharpness};
}

/** Average multiple L2-normalized embeddings into one centroid, then re-normalize. */
export function averageEmbeddings(embeddings) {
  const dim = embeddings[0].length;
  const out = new Array(dim).fill(0);
  for (const e of embeddings) {
    for (let i = 0; i < dim; i++) {
      out[i] += e[i] / embeddings.length;
    }
  }
  return l2normalize(out);
}
