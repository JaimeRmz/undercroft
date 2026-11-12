/**
 * Shop rooms (CLAUDE.md §3/§4): a handful of priced items and pickups laid
 * out on pedestals, bought by walking into them if the player can afford the
 * price. One slot is marked "on sale" at a discount (a sale sign). Prices
 * and the sale discount are [assumed] — CLAUDE.md doesn't give a formula.
 */
import { circlesOverlap } from '../engine/collision.js';
import { pickUpItem } from './items.js';
import { spawnPickup, PICKUP_TYPE } from './pickups.js';

const ITEM_BASE_PRICE = 15; // [assumed] coins
const ITEM_PRICE_PER_QUALITY = 5; // [assumed]
const PICKUP_PRICES = { [PICKUP_TYPE.HEART_FULL]: 3, [PICKUP_TYPE.KEY]: 3, [PICKUP_TYPE.BOMB]: 3, [PICKUP_TYPE.BATTERY]: 5 }; // [assumed]
const SALE_DISCOUNT = 0.5; // [assumed] 50% off the one on-sale slot

export function priceForItem(def) {
  return ITEM_BASE_PRICE + (def.quality ?? 0) * ITEM_PRICE_PER_QUALITY;
}

export function spawnShopItem(world, { x, y, kind, itemId, pickupType, price, onSale = false }) {
  return world.spawn('shopItem', {
    x,
    y,
    radius: 14,
    kind, // 'item' | 'pickup'
    itemId,
    pickupType,
    price,
    onSale,
    displayPrice: onSale ? Math.max(1, Math.round(price * SALE_DISCOUNT)) : price,
    sold: false,
    tags: ['shopItem'],
  });
}

/**
 * Stocks a shop room at the given slot positions: draws up to `itemSlots`
 * distinct items from the "shop" pool and fills any remaining slots with
 * priced pickups (heart/key/bomb/battery). One random slot goes on sale.
 */
export function stockShop(world, positions, { pools, itemDefsById, rng, itemSlots = 2 }) {
  const slots = [];
  const drawn = new Set();

  for (let i = 0; i < Math.min(itemSlots, positions.length); i++) {
    const itemId = pools?.draw('shop', rng);
    if (!itemId || drawn.has(itemId)) break;
    drawn.add(itemId);
    const def = itemDefsById(itemId);
    if (!def) break;
    slots.push({ kind: 'item', itemId, price: priceForItem(def) });
  }

  const pickupChoices = [PICKUP_TYPE.HEART_FULL, PICKUP_TYPE.KEY, PICKUP_TYPE.BOMB, PICKUP_TYPE.BATTERY];
  while (slots.length < positions.length) {
    const pickupType = rng.pick(pickupChoices);
    slots.push({ kind: 'pickup', pickupType, price: PICKUP_PRICES[pickupType] });
  }

  const saleIndex = slots.length > 0 ? rng.int(0, slots.length - 1) : -1;
  const spawned = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const pos = positions[i];
    spawned.push(spawnShopItem(world, { x: pos.x, y: pos.y, onSale: i === saleIndex, ...slot }));
  }
  return spawned;
}

/**
 * Touch-to-buy: if the player overlaps an unsold shop slot and has enough
 * coins, spends them, grants the item/pickup, and removes the slot. Items
 * are also removed from every pool so they can't reappear elsewhere.
 */
export function resolveShopPurchases(world, player, { inventory, stats, playerHealth, currency, pools, getItemDef, events } = {}) {
  for (const slot of world.entities.byType('shopItem')) {
    if (!slot.alive || slot.sold) continue;
    if (!circlesOverlap(slot.x, slot.y, slot.radius, player.x, player.y, player.radius)) continue;
    if (!currency || currency.coins < slot.displayPrice) continue;

    currency.coins -= slot.displayPrice;
    slot.sold = true;

    if (slot.kind === 'item') {
      const def = getItemDef(slot.itemId);
      if (def) {
        pickUpItem(inventory, stats, playerHealth, def, player);
        pools?.removeFromAllPools(def.id);
        events?.emit('item:pickup', { id: def.id, name: def.name, description: def.description ?? '' });
      }
    } else {
      spawnPickup(world, slot.pickupType, { x: slot.x, y: slot.y });
    }

    events?.emit('shop:purchased', { kind: slot.kind, price: slot.displayPrice });
    slot.destroy();
  }
}
