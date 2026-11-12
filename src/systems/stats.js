/**
 * Damage and tears stat formulas, taken verbatim from CLAUDE.md §3 (sourced from
 * the community wiki). These exact numbers are what tests/*.test.mjs pin down.
 */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';

/** dmg = baseDmg * charMult * sqrt(1 + 1.2*dmgUps) + flatDmg, then *= every multiplier. Ups diminish; multipliers don't. */
export function computeDamage({
  baseDmg = CONFIG.BASE_DAMAGE,
  charMult = 1,
  damageUps = 0,
  flatDamage = 0,
  multipliers = [],
} = {}) {
  let dmg = baseDmg * charMult * Math.sqrt(1 + 1.2 * damageUps) + flatDamage;
  for (const m of multipliers) dmg *= m;
  return dmg;
}

/**
 * Tear delay (in 30fps "logic frames") for a given tears stat T, before direct
 * tear-delay modifiers. Four piecewise branches per CLAUDE.md §3; soft-capped
 * at 5 for T > 0 (reached around T ~= 1.82), continuous across all boundaries.
 */
function baseTearDelay(tears) {
  if (tears > 0) {
    const delay = 16 - 6 * Math.sqrt(1 + 1.3 * tears);
    return Math.max(delay, CONFIG.SOFT_CAP_TEAR_DELAY_FLOOR);
  }
  if (tears === 0) {
    return CONFIG.BASE_TEAR_DELAY_AT_ZERO;
  }
  if (tears > -0.77) {
    return 16 - 6 * Math.sqrt(1 + 1.3 * tears) - 6 * tears;
  }
  return 16 - 6 * tears;
}

/** Applies direct tear-delay modifiers on top of the base curve (these CAN break the soft cap); floors at delay 1. */
export function computeTearDelay(tears, { directModifiers = 0 } = {}) {
  const delay = baseTearDelay(tears) + directModifiers;
  return Math.max(delay, CONFIG.MIN_TEAR_DELAY);
}

/** 30 / (delay + 1) shots per second — delay is in 30fps logic frames regardless of our 60Hz sim rate. */
export function tearDelayToFireRate(delay) {
  return 30 / (delay + 1);
}

/** Seconds between shots; frame-rate independent, safe to compare against an accumulated dt cooldown. */
export function tearDelayToCooldownSeconds(delay) {
  return 1 / tearDelayToFireRate(delay);
}

/** chance = base + luck*k, clamped to [0, 1]. */
export function luckProcChance(base, luck, k = 0.01) {
  return clamp(base + luck * k, 0, 1);
}

/** Holds a character/run's current stat values and derives damage/tears/speed from them. */
export class Stats {
  constructor(overrides = {}) {
    this.baseDamage = overrides.baseDamage ?? CONFIG.BASE_DAMAGE;
    this.charMult = overrides.charMult ?? 1;
    this.damageUps = overrides.damageUps ?? 0;
    this.flatDamage = overrides.flatDamage ?? 0;
    this.damageMultipliers = overrides.damageMultipliers ?? [];

    this.tears = overrides.tears ?? 0;
    this.tearDelayModifiers = overrides.tearDelayModifiers ?? 0;

    this.range = overrides.range ?? CONFIG.BASE_RANGE_TILES;
    this.shotSpeed = overrides.shotSpeed ?? CONFIG.BASE_SHOT_SPEED;
    this.speed = overrides.speed ?? CONFIG.BASE_SPEED;
    this.luck = overrides.luck ?? CONFIG.BASE_LUCK;
  }

  get damage() {
    return computeDamage({
      baseDmg: this.baseDamage,
      charMult: this.charMult,
      damageUps: this.damageUps,
      flatDamage: this.flatDamage,
      multipliers: this.damageMultipliers,
    });
  }

  get tearDelay() {
    return computeTearDelay(this.tears, { directModifiers: this.tearDelayModifiers });
  }

  get fireCooldownSeconds() {
    return tearDelayToCooldownSeconds(this.tearDelay);
  }

  get clampedSpeed() {
    return clamp(this.speed, CONFIG.MIN_SPEED, CONFIG.MAX_SPEED);
  }

  luckProcChance(base, k = 0.01) {
    return luckProcChance(base, this.luck, k);
  }
}
