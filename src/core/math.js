/** Pure math helpers shared by engine and systems. No randomness here — see rng.js. */

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Exponential approach, framerate-independent: moves `current` toward `target` at `rate` per second. */
export function approach(current, target, rate, dt) {
  if (current === target) return target;
  const t = 1 - Math.exp(-rate * dt);
  const next = lerp(current, target, t);
  return Math.abs(next - target) < 1e-4 ? target : next;
}

/** Moves `current` toward `target` by at most `delta`, without overshoot. */
export function moveToward(current, target, delta) {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function distanceSq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** Normalizes diagonal movement input so diagonal speed equals cardinal speed. */
export function normalizeDiagonal(x, y) {
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2; // 1/sqrt(2)
    return { x: x * inv, y: y * inv };
  }
  return { x, y };
}

export function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecScale(a, s) {
  return { x: a.x * s, y: a.y * s };
}

/** Wraps an angle (radians) into (-PI, PI]. */
export function wrapAngle(a) {
  a = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a <= -Math.PI ? a + Math.PI * 2 : a;
}
