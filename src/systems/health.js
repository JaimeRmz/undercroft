/**
 * Health: red heart containers + soul/black hearts, all counted in halves.
 * Damage removes soul/black hearts first (most-recently-gained first, i.e.
 * "rightmost" in the HUD), then red. Losing a black heart deals room damage
 * (left to the combat system to apply — we just emit the event). Max 12
 * hearts (24 halves) total across every type (CLAUDE.md §3).
 */
import { CONFIG } from '../core/config.js';

const MAX_HALVES = CONFIG.MAX_HEART_CONTAINERS * 2;

export class Health {
  constructor({ redMax = 6, red = redMax } = {}) {
    this.redMax = redMax;
    this.red = red;
    this.extra = []; // ordered list of { type: 'soul' | 'black' }, one entry per half-heart
    this.invulnTimer = 0;
    this.alive = true;
  }

  get totalHalves() {
    return this.red + this.extra.length;
  }

  get totalContainerHalves() {
    return this.redMax + this.extra.length;
  }

  get isInvulnerable() {
    return this.invulnTimer > 0;
  }
}

function remainingCapacity(health) {
  return Math.max(0, MAX_HALVES - health.totalContainerHalves);
}

/** Grows max red hearts (and heals that amount), capped at the 24-half total. */
export function addRedContainer(health, halves) {
  const grant = Math.min(halves, remainingCapacity(health));
  health.redMax += grant;
  health.red += grant;
  return grant;
}

export function addSoulHeart(health, halves) {
  const grant = Math.min(halves, remainingCapacity(health));
  for (let i = 0; i < grant; i++) health.extra.push({ type: 'soul' });
  return grant;
}

export function addBlackHeart(health, halves) {
  const grant = Math.min(halves, remainingCapacity(health));
  for (let i = 0; i < grant; i++) health.extra.push({ type: 'black' });
  return grant;
}

/** Shrinks max red hearts (current red is capped to the new max), used by devil deals / health-for-power trades. Floors at 0. */
export function removeRedContainer(health, halves) {
  const remove = Math.min(halves, health.redMax);
  health.redMax -= remove;
  health.red = Math.min(health.red, health.redMax);
  return remove;
}

/** Heals red hearts up to redMax; if the build has no red containers, heals soul hearts instead. */
export function heal(health, halves) {
  if (health.redMax > 0) {
    const grant = Math.min(halves, health.redMax - health.red);
    health.red += grant;
    return grant;
  }
  return addSoulHeart(health, halves);
}

export function tickInvuln(health, dt) {
  if (health.invulnTimer > 0) health.invulnTimer = Math.max(0, health.invulnTimer - dt);
}

/**
 * Applies `halves` half-hearts of damage, ignored while invulnerable. Consumes
 * extra (soul/black) hearts from the end of the list first, then red. Returns
 * a breakdown and triggers i-frames + death/black-heart events as needed.
 */
export function applyDamage(health, halves, { events, source } = {}) {
  if (!health.alive || health.isInvulnerable || halves <= 0) {
    return { applied: 0, redLost: 0, extraLost: 0, blackLost: 0 };
  }

  let remaining = halves;
  let redLost = 0;
  let extraLost = 0;
  let blackLost = 0;

  while (remaining > 0 && health.extra.length > 0) {
    const heart = health.extra.pop();
    remaining -= 1;
    extraLost += 1;
    if (heart.type === 'black') blackLost += 1;
  }

  if (remaining > 0) {
    const take = Math.min(remaining, health.red);
    health.red -= take;
    redLost += take;
    remaining -= take;
  }

  health.invulnTimer = CONFIG.INVULN_FRAMES / CONFIG.TICK_RATE;

  if (blackLost > 0) events?.emit('health:blackHeartLost', { count: blackLost, source });
  events?.emit('health:damaged', { redLost, extraLost, blackLost, source });

  if (health.totalHalves <= 0) {
    health.alive = false;
    events?.emit('health:death', { source });
  }

  return { applied: redLost + extraLost, redLost, extraLost, blackLost };
}
