/**
 * Pickup rendering (P2.Q Q2c): pickups pop out with a bouncing overshoot and
 * settle; coins spin on their vertical axis with a glint; hearts pulse. The
 * animation state is derived purely (testable); drawPickup is the canvas part.
 */

const POP_SECONDS = 0.35; // pop-in duration when a pickup first appears
const COIN_SPIN_RATE = 6; // radians/sec of the coin's vertical-axis spin
const HEART_PULSE_RATE = 5;

const HEART_TYPES = new Set(['heart_half', 'heart_full', 'heart_soul', 'heart_black']);

/** Overshoot ease (easeOutBack): springs past 1 then settles, giving the pop a bouncy feel. */
function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/** Advances a pickup's cosmetic timers. Render-only (no sim determinism needed), like walk-bob. */
export function updatePickupAnim(pickup, dt) {
  pickup.animTime = (pickup.animTime ?? 0) + dt;
  if (pickup.spawnTimer === undefined) pickup.spawnTimer = POP_SECONDS; // first sighting → pop in
  pickup.spawnTimer = Math.max(0, pickup.spawnTimer - dt);
}

/**
 * Pure derived animation state for a pickup:
 * - popScale: overall scale, overshooting 1 during the pop then settling
 * - hop: upward pixel offset that rises and settles during the pop
 * - spinWidth: horizontal width fraction (coins only; <0 means showing the back)
 * - glint: true at the spin extremes (coin face flat to camera) for a highlight
 * - pulse: scale multiplier that breathes (hearts only)
 */
export function pickupAnimState(pickup) {
  const t = pickup.animTime ?? 0;
  const popFrac = pickup.spawnTimer > 0 ? 1 - pickup.spawnTimer / POP_SECONDS : 1;
  const popScale = popFrac >= 1 ? 1 : Math.max(0, easeOutBack(popFrac));
  const hop = pickup.spawnTimer > 0 ? Math.sin(popFrac * Math.PI) * 6 : 0;

  let spinWidth = 1;
  let glint = false;
  let pulse = 1;
  if (pickup.pickupType === 'coin') {
    const phase = Math.cos(t * COIN_SPIN_RATE);
    spinWidth = phase; // sweeps +1 → 0 → -1 → 0 → +1, the edge-on moment at 0
    glint = Math.abs(phase) > 0.85; // face flat to the camera → catch the light
  } else if (HEART_TYPES.has(pickup.pickupType)) {
    pulse = 1 + 0.12 * Math.sin(t * HEART_PULSE_RATE);
  }
  return { popScale, hop, spinWidth, glint, pulse };
}

/** Draws one animated pickup at its world position, `base` = drawn radius in logical px. */
export function drawPickup(ctx, pickup, camera, dt, color, base = 8) {
  updatePickupAnim(pickup, dt);
  const { popScale, hop, spinWidth, glint, pulse } = pickupAnimState(pickup);
  const screen = camera.worldToScreen(pickup.x, pickup.y);
  const z = camera.zoom;

  ctx.save();
  ctx.translate(screen.x, screen.y - hop * z);
  const s = popScale * pulse;
  // Coins spin on their vertical axis: squash the width toward 0 at the edge-on moment.
  ctx.scale(s * Math.max(0.08, Math.abs(spinWidth)), s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, base * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Glint: a small bright sparkle on a coin when its face is flat to the camera.
  if (glint) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.arc(screen.x - base * 0.3 * z, screen.y - (hop + base * 0.3) * z, base * 0.28 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
