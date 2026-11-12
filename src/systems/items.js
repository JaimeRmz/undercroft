/**
 * Item system v1: passive items apply a fixed stat delta once on pickup;
 * active items charge up (one charge per room clear) and fire a simple,
 * immediate effect when used at full charge. Pools, pedestals, pickup banner,
 * and inventory bookkeeping live here; tear modifiers, weapon types, and
 * explicit item-combo synergies are handled by synergies.js/weapons.js.
 */
import { addRedContainer, addSoulHeart, addBlackHeart, heal } from './health.js';
import { circlesOverlap } from '../engine/collision.js';
import { applyEnemyDamage } from './enemies.js';
import { STAT_FIELD_APPLIERS } from './statEffects.js';

export class ItemInventory {
  constructor() {
    this.passives = []; // ids, in pickup order
    this.actives = []; // { id, charge, maxCharges }
    this.seenIds = new Set(); // ids taken or seen — for pool removal
  }
}

export function applyPassiveItem(stats, playerHealth, def) {
  for (const effect of def.effects ?? []) {
    if (effect.stat === 'redHeartContainers') addRedContainer(playerHealth, effect.value);
    else if (effect.stat === 'soulHearts') addSoulHeart(playerHealth, effect.value);
    else if (effect.stat === 'blackHearts') addBlackHeart(playerHealth, effect.value);
    else STAT_FIELD_APPLIERS[effect.stat]?.(stats, effect.value);
  }
}

/** Records an item as taken and, for passives, applies its effects immediately (plus a permanent tear modifier, if `def.grantsTearModifier` names one). Active items just join the inventory at 0 charge. */
export function pickUpItem(inventory, stats, playerHealth, def, player) {
  inventory.seenIds.add(def.id);
  if (def.type === 'passive') {
    inventory.passives.push(def.id);
    applyPassiveItem(stats, playerHealth, def);
    if (def.grantsTearModifier && player) {
      player.tearModifiers = [...(player.tearModifiers ?? []), def.grantsTearModifier];
    }
  } else if (def.type === 'active') {
    inventory.actives.push({ id: def.id, charge: 0, maxCharges: def.maxCharges ?? 3 });
  }
}

/** Call once per room clear: adds one charge to every active item (CLAUDE.md §3). */
export function chargeActivesOnRoomClear(inventory) {
  for (const active of inventory.actives) {
    active.charge = Math.min(active.charge + 1, active.maxCharges);
  }
}

function applyActiveEffect(def, { world, player, playerHealth, events, rng }) {
  const effect = def.activeEffect;
  if (!effect) return;
  switch (effect.type) {
    case 'heal':
      heal(playerHealth, effect.value ?? 2);
      break;
    case 'nova': {
      const radius = effect.radius ?? 100;
      const damage = effect.damage ?? 10;
      for (const enemy of world.entities.byType('enemy')) {
        if (!enemy.alive) continue;
        if (!circlesOverlap(player.x, player.y, radius, enemy.x, enemy.y, enemy.radius)) continue;
        applyEnemyDamage(world, enemy, damage, { player, playerHealth, events, rng });
      }
      break;
    }
    case 'speedBoost':
      player.speedBoostTimer = effect.duration ?? 3;
      player.speedBoostMult = effect.multiplier ?? 1.5;
      break;
    case 'teleport': {
      const tx = rng.int(2, world.tileGrid.width - 3);
      const ty = rng.int(2, world.tileGrid.height - 3);
      const center = world.tileGrid.tileCenter(tx, ty);
      player.x = center.x;
      player.y = center.y;
      break;
    }
    default:
      break;
  }
}

/** Uses the active item at `index` if fully charged; resets its charge and fires its effect. Returns true if it fired. */
export function useActiveItem(inventory, index, def, ctx = {}) {
  const active = inventory.actives[index];
  if (!active || active.charge < active.maxCharges) return false;
  applyActiveEffect(def, ctx);
  active.charge = 0;
  ctx.events?.emit('item:used', { id: def.id });
  return true;
}

/** Weighted item pools per CLAUDE.md §3 (treasure/shop/boss/secret/devil/angel/curse, plus mod-defined). */
export class ItemPools {
  constructor() {
    this.pools = new Map();
  }

  register(poolName, id, weight = 1) {
    if (!this.pools.has(poolName)) this.pools.set(poolName, []);
    this.pools.get(poolName).push({ id, weight });
  }

  /** Called once an item has been taken or seen — removes it from every pool so it can't reappear. */
  removeFromAllPools(id) {
    for (const entries of this.pools.values()) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx !== -1) entries.splice(idx, 1);
    }
  }

  draw(poolName, rng) {
    const entries = this.pools.get(poolName);
    if (!entries || entries.length === 0) return null;
    return rng.weighted(entries.map((e) => ({ item: e.id, weight: e.weight })));
  }

  poolSize(poolName) {
    return this.pools.get(poolName)?.length ?? 0;
  }
}

/** Builds pools from a list of item defs, each carrying a `pools` array (defaults to ['treasure']) and optional `weight`. */
export function buildItemPools(itemDefs) {
  const pools = new ItemPools();
  for (const def of itemDefs) {
    const poolNames = def.pools ?? ['treasure'];
    const weight = def.weight ?? 1;
    for (const poolName of poolNames) pools.register(poolName, def.id, weight);
  }
  return pools;
}

export function spawnItemPedestal(world, itemId, { x, y }) {
  return world.spawn('itemPedestal', { x, y, radius: 14, itemId, tags: ['pedestal'] });
}

/**
 * Touch resolution for pedestals: picks up the item, removes it from every
 * pool, and emits 'item:pickup' (name + description) for the pickup banner.
 * `getItemDef(id)` is injected so this stays decoupled from the registry singleton.
 */
export function resolveItemPedestals(world, player, { inventory, stats, playerHealth, events, pools, getItemDef }) {
  for (const pedestal of world.entities.byType('itemPedestal')) {
    if (!pedestal.alive) continue;
    if (!circlesOverlap(pedestal.x, pedestal.y, pedestal.radius, player.x, player.y, player.radius)) continue;
    const def = getItemDef(pedestal.itemId);
    if (!def) continue;

    pickUpItem(inventory, stats, playerHealth, def, player);
    pools?.removeFromAllPools(def.id);
    events?.emit('item:pickup', { id: def.id, name: def.name, description: def.description ?? '' });
    pedestal.destroy();
  }
}
