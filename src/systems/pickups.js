/**
 * Pickups: coins, keys, bombs-as-pickup, hearts (half/full/soul/black),
 * batteries, chests (normal/locked), and the room-clear reward roll formula
 * (CLAUDE.md §3). Chests are touch-to-open rather than instantly consumed.
 */
import { clamp } from '../core/math.js';
import { circlesOverlap } from '../engine/collision.js';
import { heal, addSoulHeart, addBlackHeart } from './health.js';

export const PICKUP_TYPE = {
  COIN: 'coin',
  KEY: 'key',
  BOMB: 'bomb',
  HEART_HALF: 'heart_half',
  HEART_FULL: 'heart_full',
  HEART_SOUL: 'heart_soul',
  HEART_BLACK: 'heart_black',
  BATTERY: 'battery',
  CHEST: 'chest',
  CHEST_LOCKED: 'chest_locked',
};

/** Player wallet counters. Hearts live on Health; coins/keys/bombs live here. */
export class Currency {
  constructor({ coins = 0, bombs = 1, keys = 0 } = {}) {
    this.coins = coins;
    this.bombs = bombs;
    this.keys = keys;
  }
}

export function spawnPickup(world, type, { x, y, value = 1 } = {}) {
  return world.spawn('pickup', { x, y, radius: 10, pickupType: type, value, opened: false, tags: ['pickup'] });
}

/** Coin value distribution: mostly 1s, sometimes 5 or 10 (CLAUDE.md §3 lists denominations 1/5/10). */
export function rollCoinValue(rng) {
  return rng.weighted([
    { item: 1, weight: 80 },
    { item: 5, weight: 15 },
    { item: 10, weight: 5 },
  ]);
}

/**
 * Room clear reward roll, verbatim formula from CLAUDE.md §3:
 * roll = rand()*clamp(luck,0,10)*0.1 + rand(). <0.22 nothing; 0.22-0.30
 * card/pill/trinket; then coin/heart/key/bomb bands (split evenly, [assumed]);
 * >0.95 chest.
 */
export function rollRoomClearReward(rng, luck = 0) {
  const roll = rng.next() * clamp(luck, 0, 10) * 0.1 + rng.next();
  if (roll < 0.22) return null;
  if (roll < 0.3) return rng.pick(['card', 'pill', 'trinket']);
  const bandWidth = (0.95 - 0.3) / 4;
  const bandIndex = Math.floor((roll - 0.3) / bandWidth);
  if (roll >= 0.95) return 'chest';
  return ['coin', 'heart', 'key', 'bomb'][clamp(bandIndex, 0, 3)];
}

/** [assumed] Chest reward odds — CLAUDE.md doesn't specify them separately from the room-clear roll. */
export function rollChestReward(rng) {
  return rng.weighted([
    { item: 'coin', weight: 40 },
    { item: 'heart', weight: 25 },
    { item: 'key', weight: 15 },
    { item: 'bomb', weight: 15 },
    { item: 'trinket', weight: 5 },
  ]);
}

function applyNonChestPickup(pickup, { currency, playerHealth, events }) {
  switch (pickup.pickupType) {
    case PICKUP_TYPE.COIN:
      currency.coins += pickup.value;
      break;
    case PICKUP_TYPE.KEY:
      currency.keys += pickup.value;
      break;
    case PICKUP_TYPE.BOMB:
      currency.bombs += pickup.value;
      break;
    case PICKUP_TYPE.HEART_HALF:
      heal(playerHealth, 1);
      break;
    case PICKUP_TYPE.HEART_FULL:
      heal(playerHealth, 2);
      break;
    case PICKUP_TYPE.HEART_SOUL:
      addSoulHeart(playerHealth, 2);
      break;
    case PICKUP_TYPE.HEART_BLACK:
      addBlackHeart(playerHealth, 2);
      break;
    case PICKUP_TYPE.BATTERY:
      events?.emit('battery:collected', { pickup });
      break;
    default:
      break;
  }
}

/** Touch resolution for every pickup type, including chest open/lock logic. Call once per tick. */
export function resolvePickups(world, player, { currency, playerHealth, events, rng } = {}) {
  for (const pickup of world.entities.byType('pickup')) {
    if (!pickup.alive) continue;
    if (!circlesOverlap(pickup.x, pickup.y, pickup.radius, player.x, player.y, player.radius)) continue;

    if (pickup.pickupType === PICKUP_TYPE.CHEST || pickup.pickupType === PICKUP_TYPE.CHEST_LOCKED) {
      if (pickup.opened) continue;
      if (pickup.pickupType === PICKUP_TYPE.CHEST_LOCKED) {
        if (!currency || currency.keys <= 0) continue; // stays locked, no key
        currency.keys -= 1;
      }
      pickup.opened = true;
      const reward = rollChestReward(rng);
      events?.emit('chest:opened', { chest: pickup, reward });
      spawnRewardPickup(world, reward, { x: pickup.x, y: pickup.y, rng });
      pickup.destroy();
      continue;
    }

    applyNonChestPickup(pickup, { currency, playerHealth, events });
    events?.emit('pickup:collected', { type: pickup.pickupType, value: pickup.value });
    pickup.destroy();
  }
}

/** Spawns the concrete pickup for a reward category string ('coin'/'heart'/'key'/'bomb'/'chest'/...). No-op for types without an entity yet (card/pill/trinket — P2). */
export function spawnRewardPickup(world, category, { x, y, rng }) {
  switch (category) {
    case 'coin':
      return spawnPickup(world, PICKUP_TYPE.COIN, { x, y, value: rollCoinValue(rng) });
    case 'heart':
      return spawnPickup(world, PICKUP_TYPE.HEART_HALF, { x, y });
    case 'key':
      return spawnPickup(world, PICKUP_TYPE.KEY, { x, y });
    case 'bomb':
      return spawnPickup(world, PICKUP_TYPE.BOMB, { x, y });
    case 'chest':
      return spawnPickup(world, PICKUP_TYPE.CHEST, { x, y });
    default:
      return null; // card/pill/trinket: no entity yet, deferred to P2
  }
}
