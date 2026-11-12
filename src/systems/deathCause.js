/**
 * Turns the `source` carried by a 'health:death' event (an enemy/boss def id,
 * or a hazard keyword like 'bomb') into the name shown on the death screen.
 */
const HAZARD_NAMES = {
  bomb: 'Your own bomb',
  spikes: 'Spikes',
  'enemy-projectile': 'An enemy shot',
};

/** `lookups`: { getEnemyDef(id), getBossDef(id) } — either may be omitted. Always returns a non-empty string. */
export function describeDeathCause(source, { getEnemyDef, getBossDef } = {}) {
  if (!source) return 'Unknown causes';
  const def = getBossDef?.(source) ?? getEnemyDef?.(source);
  if (def?.name) return def.name;
  return HAZARD_NAMES[source] ?? 'Unknown causes';
}
