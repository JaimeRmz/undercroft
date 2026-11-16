/**
 * Devil/angel deal rooms (CLAUDE.md §3): after defeating a floor's boss,
 * there's a chance a bonus room attaches to the boss room — a devil room
 * (items cost a heart container, or 3 soul hearts with none left) normally,
 * or an angel room (items are free) if the player took no red-heart damage
 * on the whole floor. Never on floor 1. The chance formula's two bonuses are
 * given verbatim by CLAUDE.md; the base rate and "recently" window are
 * [assumed], since CLAUDE.md doesn't give them.
 */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';
import { circlesOverlap } from '../engine/collision.js';
import { pickUpItem } from './items.js';
import { removeRedContainer } from './health.js';
import { priceForItem } from './shop.js';

/** `{ stage, noBossDamage, noFloorDamage, recentlySeen }` -> chance in [0,1]. Never rolls on floor 1. */
export function dealRoomChance({ stage, noBossDamage, noFloorDamage, recentlySeen }) {
  if (stage <= 1) return 0;
  let chance = CONFIG.DEAL_ROOM_BASE_CHANCE;
  if (noBossDamage) chance += CONFIG.DEAL_ROOM_NO_BOSS_DAMAGE_BONUS;
  if (noFloorDamage) chance = CONFIG.DEAL_ROOM_NO_FLOOR_DAMAGE_CHANCE; // a perfect floor supersedes the boss-only bonus
  if (recentlySeen) chance *= CONFIG.DEAL_ROOM_RECENT_MULT;
  return clamp(chance, 0, 1);
}

/** A perfect (no red damage) floor gets the angel variant; otherwise devil. */
export function rollDealRoomType(noFloorDamage) {
  return noFloorDamage ? 'angel' : 'devil';
}

export function spawnDevilItem(world, itemId, { x, y }) {
  return world.spawn('devilItem', { x, y, radius: 14, itemId, bought: false, tags: ['devilItem'] });
}

/** Removes 3 soul hearts specifically (not black), most-recently-gained first — same convention Health.applyDamage already uses. */
function removeThreeSoulHearts(playerHealth) {
  let removed = 0;
  for (let i = playerHealth.extra.length - 1; i >= 0 && removed < 3; i--) {
    if (playerHealth.extra[i].type === 'soul') {
      playerHealth.extra.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/**
 * Touch-to-buy for devil-room items. A character with `paysDealsWithCoins`
 * (P2.7) pays the same coin price a shop item would instead; everyone else
 * pays 1 heart container (2 halves) if they have any, else 3 soul hearts,
 * else the item simply can't be bought yet (left on its pedestal, no-op —
 * same as a shop item the player can't afford).
 */
export function resolveDevilDealPurchases(world, player, { inventory, stats, playerHealth, currency, pools, getItemDef, events } = {}) {
  for (const slot of world.entities.byType('devilItem')) {
    if (!slot.alive || slot.bought) continue;
    if (!circlesOverlap(slot.x, slot.y, slot.radius, player.x, player.y, player.radius)) continue;

    const def = getItemDef(slot.itemId);
    if (player.paysDealsWithCoins) {
      const price = def ? priceForItem(def) : 0;
      if (!currency || currency.coins < price) continue;
      currency.coins -= price;
    } else {
      const canPayRed = playerHealth.redMax > 0;
      const canPaySoul = !canPayRed && playerHealth.extra.filter((h) => h.type === 'soul').length >= 3;
      if (!canPayRed && !canPaySoul) continue;
      if (canPayRed) removeRedContainer(playerHealth, 2);
      else removeThreeSoulHearts(playerHealth);
    }

    if (def) {
      pickUpItem(inventory, stats, playerHealth, def, player, { world });
      pools?.removeFromAllPools(def.id);
      events?.emit('item:pickup', { id: def.id, name: def.name, description: def.description ?? '', x: slot.x, y: slot.y });
    }
    slot.bought = true;
    slot.destroy();
  }
}
