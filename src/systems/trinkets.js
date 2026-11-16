/**
 * Trinkets: one held slot, swapped (not stacked) by walking over a new one
 * (CLAUDE.md §3). Unlike passive items — which apply a stat delta once and
 * keep it forever — a trinket's bonus must cleanly disappear the instant
 * it's swapped or dropped, so its effects are restricted to simple Stats
 * fields that can be subtracted back out exactly (same shape as items.js's
 * STAT_FIELD_APPLIERS, just reversible).
 */
import { circlesOverlap } from '../engine/collision.js';
import { applyStatEffects } from './statEffects.js';

export class TrinketInventory {
  constructor() {
    this.current = null; // the held trinket's def, or null
  }
}

/** Equips `def` into the slot, first un-applying whatever was previously held. Returns the previously-held def (or null). */
export function equipTrinket(inventory, stats, def) {
  const previous = inventory.current;
  if (previous) applyStatEffects(stats, previous.effects, -1);
  applyStatEffects(stats, def.effects, 1);
  inventory.current = def;
  return previous;
}

/** Clears the slot without replacing it (the drop-trinket input action). Returns the dropped def (or null). */
export function unequipTrinket(inventory, stats) {
  if (!inventory.current) return null;
  applyStatEffects(stats, inventory.current.effects, -1);
  const dropped = inventory.current;
  inventory.current = null;
  return dropped;
}

export function spawnTrinketPickup(world, trinketId, { x, y }) {
  return world.spawn('trinketPickup', { x, y, radius: 12, trinketId, tags: ['pickup'] });
}

/** Explicit drop (Ctrl): un-equips and spawns the dropped trinket back on the ground at (x,y). No-op if nothing is held. */
export function dropTrinket(world, inventory, stats, { x, y }) {
  const dropped = unequipTrinket(inventory, stats);
  return dropped ? spawnTrinketPickup(world, dropped.id, { x, y }) : null;
}

/**
 * Touch resolution: swaps the touched trinket into the slot. Whatever was
 * previously held (if anything) is dropped as a new pickup at the same spot
 * — not re-added to the floor pools, since "taken or seen" removal from
 * pools is permanent per CLAUDE.md §3, regardless of what the slot does with
 * it afterward.
 */
export function resolveTrinketPickups(world, player, { inventory, stats, events, pools, getTrinketDef }) {
  for (const pickup of world.entities.byType('trinketPickup')) {
    if (!pickup.alive) continue;
    if (!circlesOverlap(pickup.x, pickup.y, pickup.radius, player.x, player.y, player.radius)) continue;
    const def = getTrinketDef(pickup.trinketId);
    if (!def) continue;

    const previous = equipTrinket(inventory, stats, def);
    pools?.removeFromAllPools(def.id);
    events?.emit('item:pickup', { id: def.id, name: def.name, description: def.description ?? '', x: pickup.x, y: pickup.y });
    pickup.destroy();
    if (previous) spawnTrinketPickup(world, previous.id, { x: pickup.x, y: pickup.y });
  }
}
