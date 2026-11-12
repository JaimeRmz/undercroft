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

function heldItemIds(inventory) {
  return new Set([...inventory.passives, ...inventory.actives.map((a) => a.id)]);
}

/**
 * Checks every rule not yet applied; if all of its `requires` ids are held,
 * applies `effect.statBonus` (stat deltas) and/or `effect.weaponType` (sets
 * the player's weapon type, subject to the normal priority rule), then marks
 * it applied so it never re-fires. Returns the list of rule ids that just fired.
 */
export function checkSynergies(inventory, stats, playerHealth, player, rules, appliedIds) {
  const held = heldItemIds(inventory);
  const justApplied = [];

  for (const rule of rules) {
    if (appliedIds.has(rule.id)) continue;
    if (!rule.requires.every((id) => held.has(id))) continue;

    for (const bonus of rule.effect?.statBonus ?? []) {
      applyStatBonus(stats, playerHealth, bonus);
    }
    if (rule.effect?.weaponType && player) {
      setWeaponType(player, rule.effect.weaponType);
    }
    if (rule.effect?.tearModifiers && player) {
      player.tearModifiers = [...(player.tearModifiers ?? []), ...rule.effect.tearModifiers];
    }

    appliedIds.add(rule.id);
    justApplied.push(rule.id);
  }

  return justApplied;
}
