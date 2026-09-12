/**
 * Pure-math tests for src/domain/faceMath.js — no React Native / native modules
 * involved, so these run under plain node via jest.
 */
import {it, describe, expect} from '@jest/globals';
import {
  OUT,
  l2normalize,
  cosineSimilarity,
  eyeGeometryPlausible,
  tensorQuality,
  averageEmbeddings,
  fitSimilarity,
  MIN_SHARPNESS,
  MIN_BRIGHTNESS,
  MAX_BRIGHTNESS,
} from '../src/domain/faceMath';

describe('eyeGeometryPlausible', () => {
  const face = {left: 0, top: 0, width: 200, height: 200};

  it('accepts a normal frontal eye pair', () => {
    expect(eyeGeometryPlausible({x: 60, y: 90}, {x: 140, y: 90}, face)).toBe(true);
  });

  it('rejects eyes far too close together for the face box (bad landmarks)', () => {
    expect(eyeGeometryPlausible({x: 98, y: 90}, {x: 102, y: 90}, face)).toBe(false);
  });

  it('rejects eyes far too far apart for the face box', () => {
    expect(eyeGeometryPlausible({x: 0, y: 90}, {x: 200, y: 92}, face)).toBe(false);
  });

  it('rejects an extreme roll angle', () => {
    expect(eyeGeometryPlausible({x: 90, y: 20}, {x: 110, y: 180}, face)).toBe(false);
  });

  it('is order-independent (left/right swapped)', () => {
    const a = eyeGeometryPlausible({x: 60, y: 90}, {x: 140, y: 92}, face);
    const b = eyeGeometryPlausible({x: 140, y: 92}, {x: 60, y: 90}, face);
    expect(a).toBe(b);
  });
});

describe('tensorQuality', () => {
  function makeTensor(fill) {
    const t = new Float32Array(OUT * OUT * 3);
    t.fill(fill);
    return t;
  }

  it('flags a flat (blurred/blank) tensor as low sharpness', () => {
    const t = makeTensor(0); // mid-grey, zero edge energy
    const q = tensorQuality(t);
    expect(q.sharpness).toBeLessThan(MIN_SHARPNESS);
  });

  it('flags a near-black tensor as too dark', () => {
    const t = makeTensor(-0.95); // near -1 -> near 0 brightness
    const q = tensorQuality(t);
    expect(q.brightness).toBeLessThan(MIN_BRIGHTNESS);
  });

  it('flags a near-white tensor as too bright', () => {
    const t = makeTensor(0.97);
    const q = tensorQuality(t);
    expect(q.brightness).toBeGreaterThan(MAX_BRIGHTNESS);
  });

  it('gives a mid-grey checkerboard high sharpness', () => {
    const t = new Float32Array(OUT * OUT * 3);
    for (let y = 0; y < OUT; y++) {
      for (let x = 0; x < OUT; x++) {
        const v = (x + y) % 2 === 0 ? 0.9 : -0.9;
        const o = (y * OUT + x) * 3;
        t[o] = v;
        t[o + 1] = v;
        t[o + 2] = v;
      }
    }
    const q = tensorQuality(t);
    expect(q.sharpness).toBeGreaterThan(MIN_SHARPNESS);
  });
});

describe('averageEmbeddings', () => {
  it('averages and re-normalizes multiple embeddings to unit length', () => {
    const e1 = l2normalize([1, 0, 0]);
    const e2 = l2normalize([1, 0.2, 0]);
    const e3 = l2normalize([1, -0.1, 0.1]);
    const avg = averageEmbeddings([e1, e2, e3]);
    const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    // The centroid of near-identical embeddings should stay close to each of them.
    expect(cosineSimilarity(avg, e1)).toBeGreaterThan(0.9);
  });

  it('a single embedding averages to itself', () => {
    const e = l2normalize([0.2, 0.5, -0.3, 0.7]);
    expect(averageEmbeddings([e])).toEqual(e);
  });
});

describe('fitSimilarity', () => {
  // Apply a known scale/rotation/translation to a set of points, then check
  // fitSimilarity recovers that same transform from the (src, dst) pairs.
  const applyTransform = (pts, a, b, tx, ty) =>
    pts.map(({x, y}) => ({x: a * x - b * y + tx, y: b * x + a * y + ty}));

  it('exactly recovers a known transform from 2 points (no residual)', () => {
    const src = [
      {x: 10, y: 20},
      {x: 90, y: 25},
    ];
    const scale = 1.4;
    const theta = (18 * Math.PI) / 180;
    const a = scale * Math.cos(theta);
    const b = scale * Math.sin(theta);
    const dst = applyTransform(src, a, b, 12, -7);

    const fit = fitSimilarity(src, dst);
    expect(fit.a).toBeCloseTo(a, 6);
    expect(fit.b).toBeCloseTo(b, 6);
    expect(fit.tx).toBeCloseTo(12, 6);
    expect(fit.ty).toBeCloseTo(-7, 6);
  });

  it('exactly recovers a known transform from 5 points (no residual)', () => {
    const src = [
      {x: 38, y: 52},
      {x: 74, y: 51},
      {x: 56, y: 72},
      {x: 42, y: 92},
      {x: 71, y: 92},
    ];
    const scale = 0.8;
    const theta = (-25 * Math.PI) / 180;
    const a = scale * Math.cos(theta);
    const b = scale * Math.sin(theta);
    const dst = applyTransform(src, a, b, -5, 30);

    const fit = fitSimilarity(src, dst);
    expect(fit.a).toBeCloseTo(a, 6);
    expect(fit.b).toBeCloseTo(b, 6);
    expect(fit.tx).toBeCloseTo(-5, 6);
    expect(fit.ty).toBeCloseTo(30, 6);
  });

  it('averages out noise across 5 points better than an exact 2-point fit would', () => {
    const src = [
      {x: 38, y: 52},
      {x: 74, y: 51},
      {x: 56, y: 72},
      {x: 42, y: 92},
      {x: 71, y: 92},
    ];
    const a = 1;
    const b = 0;
    const clean = applyTransform(src, a, b, 0, 0);
    // Perturb just the left-eye point (as if that one landmark were noisy) —
    // an exact 2-point (eyes-only) fit would fully absorb this into the
    // transform; the 5-point least-squares fit should be pulled far less.
    const noisy = clean.map((p, i) => (i === 0 ? {x: p.x + 6, y: p.y - 4} : p));

    const fit5 = fitSimilarity(src, noisy);
    const fit2 = fitSimilarity(src.slice(0, 2), noisy.slice(0, 2));

    const err5 = Math.hypot(fit5.a - a, fit5.b - b);
    const err2 = Math.hypot(fit2.a - a, fit2.b - b);
    expect(err5).toBeLessThan(err2);
  });
});
