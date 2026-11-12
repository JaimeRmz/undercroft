/**
 * Hitstop: a brief full-simulation freeze on a heavy hit (CLAUDE.md §3,
 * "~2-frame hitstop on heavy hits"). A single shared counter is enough —
 * like the event bus, it's a cross-cutting feel concern, not per-run state,
 * and it decays to 0 within a couple of frames regardless.
 */
let framesRemaining = 0;

export function triggerHitstop(frames) {
  framesRemaining = Math.max(framesRemaining, frames);
}

/** Call once per tick before running gameplay systems. Returns true (and consumes one frame) if the tick should be skipped. */
export function consumeHitstopFrame() {
  if (framesRemaining <= 0) return false;
  framesRemaining -= 1;
  return true;
}

export function isHitstopped() {
  return framesRemaining > 0;
}

export function resetHitstop() {
  framesRemaining = 0;
}
