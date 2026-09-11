// Pure blink-liveness state machine — no React Native / ML Kit dependency, so
// it is unit-testable with node. CaptureScreen.js feeds it per-frame eye-open
// samples from ML Kit's classificationMode: 'all' and owns the fail-open
// timeout (a real timer, so it lives outside this pure module).
//
// A worker photo held up to the camera cannot blink on cue, so requiring one
// full eyes-open -> eyes-closed -> eyes-open cycle before the shutter unlocks
// is a cheap deterrent against the "photo of a photo" attack — without adding
// a new native dependency or a bundled anti-spoof model this session has no
// way to build/test on a real device.

export const OPEN_THRESHOLD = 0.6;
export const CLOSED_THRESHOLD = 0.4;

export function initialLivenessState() {
  return {sawOpen: false, sawClosed: false, confirmed: false};
}

/**
 * Advances the state machine with one sample: the average of ML Kit's
 * left/right eye-open probabilities for the current frame, or null when
 * they weren't reported (no face that frame, or the platform/version doesn't
 * supply them) — a null sample is simply skipped, it never resets progress
 * that was already made, only the fail-open timeout (owned by the caller)
 * should give up waiting.
 */
export function nextLivenessState(state, avgEyeOpen) {
  if (state.confirmed || avgEyeOpen == null) {
    return state;
  }
  if (!state.sawOpen) {
    return avgEyeOpen >= OPEN_THRESHOLD ? {...state, sawOpen: true} : state;
  }
  if (!state.sawClosed) {
    return avgEyeOpen < CLOSED_THRESHOLD ? {...state, sawClosed: true} : state;
  }
  return avgEyeOpen >= OPEN_THRESHOLD ? {...state, confirmed: true} : state;
}

/** Averages ML Kit's per-eye open probabilities; null if either is missing. */
export function avgEyeOpenProbability(face) {
  const l = face && face.leftEyeOpenProbability;
  const r = face && face.rightEyeOpenProbability;
  return typeof l === 'number' && typeof r === 'number' ? (l + r) / 2 : null;
}
