/**
 * Floor-descent transition (P1.G7 "a short transition when descending to the
 * next floor"): fade to black, swap the floor while the screen is covered,
 * fade back in. Pure state machine — main.js owns calling `advanceFloor` at
 * the 'swap' instant and reads `floorTransitionAlpha` to paint the overlay.
 */
export const FLOOR_FADE_OUT_SECONDS = 0.35;
export const FLOOR_FADE_IN_SECONDS = 0.35;

export function createFloorTransitionState() {
  return { active: false, phase: null, t: 0 };
}

export function startFloorTransition(state) {
  state.active = true;
  state.phase = 'out';
  state.t = 0;
}

/** Advances by dt. Returns 'swap' the tick the screen goes fully black (caller should advance the floor then), 'done' the tick the fade-in finishes, else null. */
export function updateFloorTransition(state, dt) {
  if (!state.active) return null;
  state.t += dt;
  if (state.phase === 'out' && state.t >= FLOOR_FADE_OUT_SECONDS) {
    state.phase = 'in';
    state.t = 0;
    return 'swap';
  }
  if (state.phase === 'in' && state.t >= FLOOR_FADE_IN_SECONDS) {
    state.active = false;
    state.phase = null;
    return 'done';
  }
  return null;
}

/** Black-overlay alpha [0,1] for the current phase/t: ramps up during 'out', back down during 'in'. */
export function floorTransitionAlpha(state) {
  if (!state.active) return 0;
  if (state.phase === 'out') return Math.min(1, state.t / FLOOR_FADE_OUT_SECONDS);
  return Math.max(0, 1 - state.t / FLOOR_FADE_IN_SECONDS);
}
