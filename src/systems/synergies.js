/**
 * Explicit synergy rules (CLAUDE.md §3): JSON definitions of "when items A and
 * B are both held, apply an extra effect." Loaded through the mod loader as
 * the "synergy" content kind (mods/core/synergies/*.json). Each rule fires at
 * most once per run, the moment both requirements become satisfied.
 */
import { addRedContainer, addSoulHeart, addBlackHeart } from './health.js';
import { setWeaponType } from './weapons.js';

const STAT_FIELD_APPLIERS = {
  damageUps: (stats, v) => (stats.damageUps += v),
  flatDamage: (stats, v) => (stats.flatDamage += v),
  tears: (stats, v) => (stats.tears += v),
  range: (stats, v) => (stats.range += v),
  shotSpeed: (stats, v) => (stats.shotSpeed += v),
  speed: (stats, v) => (stats.speed += v),
  luck: (stats, v) => (stats.luck += v),
};

function applyStatBonus(stats, playerHealth, bonus) {
  if (bonus.stat === 'redHeartContainers') addRedContainer(playerHealth, bonus.value);
  else if (bonus.stat === 'soulHearts') addSoulHeart(playerHealth, bonus.value);
  else if (bonus.stat === 'blackHearts') addBlackHeart(playerHealth, bonus.value);
  else STAT_FIELD_APPLIERS[bonus.stat]?.(stats, bonus.value);
}

/** The set of item ids the player currently holds (passives + actives), used by anything that keys off "which items are held" (synergy rules, transformations' set-tag counting). */
export function heldItemIds(inventory) {
  return new Set([...inventory.passives, ...inventory.actives.map((a) => a.id)]);
}

/**
 * Applies a `{ statBonus?, weaponType?, tearModifiers? }` effect bundle — the
 * shape shared by synergy rules and transformations (P2.5), since both are
 * "when a condition over held items is met, grant this once."
 */
export function applyEffectBundle(stats, playerHealth, player, effect) {
  for (const bonus of effect?.statBonus ?? []) {
    applyStatBonus(stats, playerHealth, bonus);
  }
  if (effect?.weaponType && player) {
    setWeaponType(player, effect.weaponType);
  }
  if (effect?.tearModifiers && player) {
    player.tearModifiers = [...(player.tearModifiers ?? []), ...effect.tearModifiers];
  }
}

/**
 * Checks every rule not yet applied; if all of its `requires` ids are held,
 * applies its effect bundle, then marks it applied so it never re-fires.
 * Returns the list of rule ids that just fired.
 */
export function checkSynergies(inventory, stats, playerHealth, player, rules, appliedIds) {
  const held = heldItemIds(inventory);
  const justApplied = [];

  for (const rule of rules) {
    if (appliedIds.has(rule.id)) continue;
    if (!rule.requires.every((id) => held.has(id))) continue;

    applyEffectBundle(stats, playerHealth, player, rule.effect);

    appliedIds.add(rule.id);
    justApplied.push(rule.id);
  }

  return justApplied;
}
