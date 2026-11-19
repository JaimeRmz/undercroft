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

/**
 * Hurt tint (P2.Q Q2a): a brief red wash overlaid on the player when hurt,
 * distinct from the white hit flash and the i-frame blink. Fades out over its life.
 */
export function triggerHurtTint(entity, seconds = CONFIG.PLAYER_HURT_TINT_SECONDS) {
  entity.hurtTintTimer = seconds;
  entity.hurtTintDuration = seconds;
}

export function updateHurtTint(entity, dt) {
  if (entity.hurtTintTimer > 0) entity.hurtTintTimer = Math.max(0, entity.hurtTintTimer - dt);
}

/** 0..1 red-overlay strength: strongest at the moment of the hit, fading to 0. */
export function hurtTintAlpha(entity) {
  const timer = entity.hurtTintTimer ?? 0;
  if (timer <= 0) return 0;
  return 0.5 * (timer / (entity.hurtTintDuration || CONFIG.PLAYER_HURT_TINT_SECONDS));
}

const SQUASH_SECONDS = 0.18; // [assumed] a quick, readable squash-and-recover on taking damage

const SQUASH_AMOUNT = 0.25; // default peak stretch (squash-on-hit)

/**
 * Squash-on-hit (P1.G5) / recoil-on-fire (P2.Q Q1b): a brief vertical-compress/
 * horizontal-stretch that eases back to normal. `amount` is the peak stretch —
 * a gentler value gives the lighter per-shot recoil so rapid fire doesn't jitter.
 */
export function triggerSquash(entity, seconds = SQUASH_SECONDS, amount = SQUASH_AMOUNT) {
  entity.squashTimer = seconds;
  entity.squashDuration = seconds;
  entity.squashAmount = amount;
}

export function updateSquash(entity, dt) {
  if (entity.squashTimer > 0) entity.squashTimer = Math.max(0, entity.squashTimer - dt);
}

/** {x, y} scale multipliers: squashed flat and wide at the moment of impact, springing back to {1,1}. */
export function squashScale(entity) {
  const timer = entity.squashTimer ?? 0;
  if (timer <= 0) return { x: 1, y: 1 };
  const frac = timer / (entity.squashDuration || SQUASH_SECONDS); // 1 at impact -> 0 as it recovers
  const amount = (entity.squashAmount ?? SQUASH_AMOUNT) * frac;
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
