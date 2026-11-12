/**
 * Shared {stat, value} effect-list applier for the Stats fields every
 * stat-granting content kind (items, trinkets, pills, cards) can touch.
 * Centralized so all four don't each carry their own copy of the same map.
 */
export const STAT_FIELD_APPLIERS = {
  damageUps: (stats, v) => (stats.damageUps += v),
  flatDamage: (stats, v) => (stats.flatDamage += v),
  tears: (stats, v) => (stats.tears += v),
  range: (stats, v) => (stats.range += v),
  shotSpeed: (stats, v) => (stats.shotSpeed += v),
  speed: (stats, v) => (stats.speed += v),
  luck: (stats, v) => (stats.luck += v),
};

/** Applies a {stat, value}[] effect list to Stats, scaled by `sign` (pass -1 to reverse a reversible grant). Unknown stat names are ignored. */
export function applyStatEffects(stats, effects, sign = 1) {
  for (const effect of effects ?? []) {
    STAT_FIELD_APPLIERS[effect.stat]?.(stats, effect.value * sign);
  }
}
