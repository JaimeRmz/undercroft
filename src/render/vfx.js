/**
 * Cosmetic entity timers (hit flash) read by the renderer. Systems (combat.js)
 * set hitFlashTimer directly on the entity when a hit lands; the renderer
 * decays it using its own per-frame dt since it's purely visual and doesn't
 * need fixed-step determinism.
 */
import { CONFIG } from '../core/config.js';

export function triggerHitFlash(entity, seconds = CONFIG.HIT_FLASH_SECONDS) {
  entity.hitFlashTimer = seconds;
}

export function updateHitFlash(entity, dt) {
  if (entity.hitFlashTimer > 0) entity.hitFlashTimer = Math.max(0, entity.hitFlashTimer - dt);
}

/**
 * Alpha for the player sprite while invulnerable: toggles between faint and
 * solid every CONFIG.INVULN_BLINK_FRAMES frames. Never reaches 0, so the
 * player is always at least faintly visible. Returns 1 when not invulnerable.
 */
export function playerBlinkAlpha(invulnSecondsLeft) {
  if (!(invulnSecondsLeft > 0)) return 1;
  const frame = Math.floor((invulnSecondsLeft * CONFIG.TICK_RATE) / CONFIG.INVULN_BLINK_FRAMES);
  return frame % 2 === 0 ? 0.3 : 1;
}

export function isFlashing(entity) {
  return (entity.hitFlashTimer ?? 0) > 0;
}

const SQUASH_SECONDS = 0.18; // [assumed] a quick, readable squash-and-recover on taking damage

/** Squash-on-hit (P1.G5): a brief vertical-compress/horizontal-stretch that eases back to normal. */
export function triggerSquash(entity, seconds = SQUASH_SECONDS) {
  entity.squashTimer = seconds;
  entity.squashDuration = seconds;
}

export function updateSquash(entity, dt) {
  if (entity.squashTimer > 0) entity.squashTimer = Math.max(0, entity.squashTimer - dt);
}

/** {x, y} scale multipliers: squashed flat and wide at the moment of impact, springing back to {1,1}. */
export function squashScale(entity) {
  const timer = entity.squashTimer ?? 0;
  if (timer <= 0) return { x: 1, y: 1 };
  const frac = timer / (entity.squashDuration || SQUASH_SECONDS); // 1 at impact -> 0 as it recovers
  const amount = 0.25 * frac;
  return { x: 1 + amount, y: 1 - amount };
}

/** Walk bob (P1.G5): advances a phase while moving, frozen while still, for a small up/down bounce. */
export function updateWalkBob(entity, dt, movingFraction) {
  entity.bobPhase = (entity.bobPhase ?? 0) + dt * 10 * movingFraction;
}

export function walkBobOffset(entity, amplitude = 2) {
  return Math.sin(entity.bobPhase ?? 0) * amplitude;
}

/** Champion pulse (P1.G5): a slow breathing scale applied to the tinted ring drawn around a champion enemy. */
export function updateChampionPulse(entity, dt) {
  entity.championPulseT = (entity.championPulseT ?? 0) + dt;
}

export function championPulseScale(entity) {
  return 1 + 0.15 * Math.sin((entity.championPulseT ?? 0) * 6);
}
