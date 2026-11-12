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
