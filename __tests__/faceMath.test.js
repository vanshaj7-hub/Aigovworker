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
