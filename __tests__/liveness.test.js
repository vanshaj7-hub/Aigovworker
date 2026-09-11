import {it, describe, expect} from '@jest/globals';
import {
  avgEyeOpenProbability,
  initialLivenessState,
  nextLivenessState,
} from '../src/domain/liveness';

describe('avgEyeOpenProbability', () => {
  it('averages both eyes when present', () => {
    expect(avgEyeOpenProbability({leftEyeOpenProbability: 0.8, rightEyeOpenProbability: 0.6})).toBeCloseTo(0.7);
  });
  it('returns null when either probability is missing (unsupported platform/version)', () => {
    expect(avgEyeOpenProbability({leftEyeOpenProbability: 0.8})).toBeNull();
    expect(avgEyeOpenProbability({})).toBeNull();
    expect(avgEyeOpenProbability(null)).toBeNull();
  });
});

describe('nextLivenessState', () => {
  it('confirms after a full open -> closed -> open cycle', () => {
    let s = initialLivenessState();
    s = nextLivenessState(s, 0.9); // open
    expect(s).toEqual({sawOpen: true, sawClosed: false, confirmed: false});
    s = nextLivenessState(s, 0.1); // closed
    expect(s).toEqual({sawOpen: true, sawClosed: true, confirmed: false});
    s = nextLivenessState(s, 0.9); // open again -> confirmed
    expect(s).toEqual({sawOpen: true, sawClosed: true, confirmed: true});
  });

  it('never confirms from open samples alone (no blink)', () => {
    let s = initialLivenessState();
    for (let i = 0; i < 5; i++) {
      s = nextLivenessState(s, 0.95);
    }
    expect(s.confirmed).toBe(false);
  });

  it('ignores null samples without losing progress', () => {
    let s = initialLivenessState();
    s = nextLivenessState(s, 0.9);
    s = nextLivenessState(s, null);
    s = nextLivenessState(s, 0.1);
    s = nextLivenessState(s, null);
    s = nextLivenessState(s, 0.9);
    expect(s.confirmed).toBe(true);
  });

  it('is a no-op once confirmed', () => {
    let s = {sawOpen: true, sawClosed: true, confirmed: true};
    expect(nextLivenessState(s, 0.05)).toBe(s);
  });

  it('does not confirm on borderline mid-range samples', () => {
    let s = initialLivenessState();
    s = nextLivenessState(s, 0.5); // neither clearly open nor closed
    expect(s.sawOpen).toBe(false);
  });
});
