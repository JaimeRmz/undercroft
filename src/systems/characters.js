/**
 * Playable characters (P2.7): each a data-driven starting loadout applied
 * once at run creation. Mechanics CLAUDE.md calls out by name — "soul hearts
 * only," "a unique weapon," "pays deals with coins" — are just specific
 * values of ordinary fields (redMax: 0, weaponType, paysDealsWithCoins)
 * rather than bespoke per-character code, so a mod can add its own character
 * through the same def shape.
 */
import { Health, addSoulHeart, addBlackHeart } from './health.js';
import { pickUpItem } from './items.js';
import { setWeaponType } from './weapons.js';
import { spawnFamiliar } from './familiars.js';
import { STAT_FIELD_APPLIERS } from './statEffects.js';

/** Builds the Health a character starts with: `redMax` (halves, default 6 = 3 hearts), plus optional starting soul/black hearts (halves). */
export function createCharacterHealth(def) {
  const health = new Health({ redMax: def.redMax ?? 6 });
  if (def.soulHearts) addSoulHeart(health, def.soulHearts);
  if (def.blackHearts) addBlackHeart(health, def.blackHearts);
  return health;
}

/**
 * Applies a character's stat deltas, weapon type override, starting items
 * (through the real pickUpItem pipeline, so grantsTearModifier/grantsFamiliar
 * on a starting item still work), active item, starting familiar, and
 * starting coins onto a freshly created run. Call once, right after the
 * player entity and empty inventories exist.
 */
export function applyCharacterStartingLoadout(def, { player, stats, playerHealth, inventory, currency, world, getItemDef, getFamiliarDef }) {
  for (const delta of def.statDeltas ?? []) {
    STAT_FIELD_APPLIERS[delta.stat]?.(stats, delta.value);
  }
  if (def.weaponType) setWeaponType(player, def.weaponType);
  if (def.paysDealsWithCoins) player.paysDealsWithCoins = true;
  if (def.startingCoins && currency) currency.coins += def.startingCoins;

  for (const itemId of def.startingItems ?? []) {
    const itemDef = getItemDef(itemId);
    if (itemDef) pickUpItem(inventory, stats, playerHealth, itemDef, player, { world, getFamiliarDef });
  }
  if (def.startingFamiliar) {
    const familiarDef = getFamiliarDef(def.startingFamiliar);
    if (familiarDef) spawnFamiliar(world, familiarDef, { player });
  }
}
