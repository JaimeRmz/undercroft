/**
 * The consumable slot (CLAUDE.md §3): one slot shared by cards/runes and
 * pills. Unlike trinkets there's no drop/swap input for this slot in
 * CLAUDE.md's control scheme, so a pickup is simply left alone while the
 * slot is occupied — same as Isaac's default single pocket-item slot. 'Q'
 * (useConsumable) fires whatever's held and empties the slot.
 */
import { circlesOverlap } from '../engine/collision.js';
import { useCard } from './cards.js';
import { usePill, pillDisplayName } from './pills.js';

export class ConsumableInventory {
  constructor() {
    this.current = null; // { kind: 'card', cardId } | { kind: 'pill', pillColor }
  }
}

export function spawnCardPickup(world, cardId, { x, y }) {
  return world.spawn('consumablePickup', { x, y, radius: 12, kind: 'card', cardId, tags: ['pickup'] });
}

export function spawnPillPickup(world, pillColor, { x, y }) {
  return world.spawn('consumablePickup', { x, y, radius: 12, kind: 'pill', pillColor, tags: ['pickup'] });
}

/** Touch resolution: fills the slot if (and only if) it's currently empty. */
export function resolveConsumablePickups(world, player, { inventory, events, getCardDef, getPillDef, pillIdentity }) {
  if (inventory.current) return;
  for (const pickup of world.entities.byType('consumablePickup')) {
    if (!pickup.alive) continue;
    if (!circlesOverlap(pickup.x, pickup.y, pickup.radius, player.x, player.y, player.radius)) continue;

    if (pickup.kind === 'card') {
      const def = getCardDef(pickup.cardId);
      if (!def) continue;
      inventory.current = { kind: 'card', cardId: pickup.cardId };
      events?.emit('item:pickup', { id: def.id, name: def.name, description: def.description ?? '' });
    } else {
      inventory.current = { kind: 'pill', pillColor: pickup.pillColor };
      events?.emit('item:pickup', { id: `pill:${pickup.pillColor}`, name: pillDisplayName(pickup.pillColor, pillIdentity, getPillDef), description: '' });
    }
    pickup.destroy();
    return;
  }
}

/** Fires whatever's held (if anything) and empties the slot. Returns true if something fired. */
export function useConsumableSlot(inventory, ctx, { getCardDef, pillIdentity, getPillDef }) {
  const held = inventory.current;
  if (!held) return false;
  if (held.kind === 'card') {
    const def = getCardDef(held.cardId);
    if (def) useCard(def, ctx);
  } else {
    usePill(held.pillColor, pillIdentity, getPillDef, ctx);
  }
  inventory.current = null;
  return true;
}
