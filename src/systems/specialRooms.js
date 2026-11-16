/**
 * P2.6 special room mechanics that aren't big enough to earn their own file:
 * curse rooms (a spiked door that hurts entering and leaving), sacrifice
 * rooms (spikes that pay out after enough hits), challenge rooms (waves of
 * enemies, full-health entry only), and arcade machines (a slot machine and
 * a fortune-telling machine). Devil/angel deal rooms are big enough to get
 * their own file (deals.js).
 */
import { CONFIG } from '../core/config.js';
import { circlesOverlap } from '../engine/collision.js';
import { ROOM_TYPE } from './floorgen.js';
import { applyDamage } from './health.js';
import { spawnEnemy } from './enemies.js';
import { findGroundSpawnTile } from './spawnPlacement.js';
import { spawnPickup, PICKUP_TYPE, spawnRewardPickup } from './pickups.js';
import { spawnItemPedestal } from './items.js';
import { spawnCardPickup } from './consumables.js';

// --- Curse rooms: a spiked door, both directions -----------------------------------------------

/** Applies CONFIG.CURSE_DOOR_DAMAGE_HALF_HEARTS once for each side of the crossing that was a curse room. */
export function applyCurseDoorDamage(playerHealth, { leavingType, enteringType }, { events } = {}) {
  let applied = 0;
  if (leavingType === ROOM_TYPE.CURSE) applied += applyDamage(playerHealth, CONFIG.CURSE_DOOR_DAMAGE_HALF_HEARTS, { events, source: 'curse-door' }).applied;
  if (enteringType === ROOM_TYPE.CURSE) applied += applyDamage(playerHealth, CONFIG.CURSE_DOOR_DAMAGE_HALF_HEARTS, { events, source: 'curse-door' }).applied;
  return applied;
}

// --- Sacrifice rooms: spikes that pay out -------------------------------------------------------

export function spawnSacrificeSpike(world, { x, y }) {
  return world.spawn('sacrificeSpike', { x, y, radius: 14, hitCooldown: 0, hits: 0, payouts: 0, tags: ['sacrificeSpike'] });
}

/** Touching the spike (off cooldown) deals damage and counts toward a payout every SACRIFICE_PAYOUT_HITS hits, up to SACRIFICE_MAX_PAYOUTS per visit. */
export function resolveSacrificeSpikes(world, player, { playerHealth, events, rng, trinketPools, cardPools } = {}) {
  for (const spike of world.entities.byType('sacrificeSpike')) {
    if (!spike.alive) continue;
    spike.hitCooldown = Math.max(0, spike.hitCooldown - 1);
    if (spike.hitCooldown > 0) continue;
    if (!circlesOverlap(spike.x, spike.y, spike.radius, player.x, player.y, player.radius)) continue;

    const result = applyDamage(playerHealth, 1, { events, source: 'sacrifice-spike' });
    if (result.applied <= 0) continue; // blocked by the player's own post-hit invulnerability; don't start the cooldown or count it

    spike.hitCooldown = 30; // [assumed] half a second at 60Hz, so one overlap = one hit, not one per tick
    spike.hits += 1;

    if (spike.hits >= CONFIG.SACRIFICE_PAYOUT_HITS && spike.payouts < CONFIG.SACRIFICE_MAX_PAYOUTS) {
      spike.hits = 0;
      spike.payouts += 1;
      const category = rng.pick(['coin', 'heart', 'trinket', 'card']);
      spawnRewardPickup(world, category, { x: spike.x, y: spike.y - 24, rng, trinketPools, cardPools });
      events?.emit('sacrifice:payout', { spike });
    }
  }
}

// --- Challenge rooms: waves of enemies, full-health entry only -----------------------------------

/** True if the player is at full red health (extra soul/black hearts don't count either way, per CLAUDE.md §3). */
export function isAtFullRedHealth(playerHealth) {
  return playerHealth.red >= playerHealth.redMax;
}

/** Stamps a Room with its wave list; the first wave is spawned immediately by the caller (stockRoom), so this starts at index 1. */
export function setChallengeWaves(room, waves) {
  room.challengeWaves = waves;
  room.challengeWaveIndex = 1;
  room.challengeWaveTimer = 0;
}

/** Call once per tick on a room that might be mid-challenge: spawns the next wave once the current one is fully cleared. */
export function updateChallengeRoom(room, dt, { rng } = {}) {
  if (!room.challengeWaves || room.challengeWaveIndex >= room.challengeWaves.length) return;
  const alive = room.world.entities.byType('enemy').some((e) => e.alive);
  if (alive) {
    room.challengeWaveTimer = 0;
    return;
  }
  room.challengeWaveTimer += dt;
  if (room.challengeWaveTimer < CONFIG.CHALLENGE_WAVE_INTERVAL_SECONDS) return;

  const wave = room.challengeWaves[room.challengeWaveIndex];
  for (const def of wave) {
    const pos = findGroundSpawnTile(room, rng, { flies: def.flies ?? false });
    spawnEnemy(room.world, def, { x: pos.x, y: pos.y, rng });
  }
  room.challengeWaveIndex += 1;
  room.challengeWaveTimer = 0;
}

// --- Arcade: a slot machine and a fortune-telling machine ----------------------------------------

export function spawnSlotMachine(world, { x, y }) {
  return world.spawn('slotMachine', { x, y, radius: 14, used: false, tags: ['machine'] });
}

export function spawnFortuneMachine(world, { x, y }) {
  return world.spawn('fortuneMachine', { x, y, radius: 14, used: false, tags: ['machine'] });
}

/** One pull/use per visit (resets once the player steps off), gated by CONFIG.ARCADE_SLOT_COST coins. */
export function resolveArcadeMachines(world, player, { currency, events, rng, itemPools, cardPools } = {}) {
  for (const machine of world.entities.byType('slotMachine')) {
    if (!machine.alive) continue;
    const overlapping = circlesOverlap(machine.x, machine.y, machine.radius, player.x, player.y, player.radius);
    if (!overlapping) {
      machine.used = false;
      continue;
    }
    if (machine.used || !currency || currency.coins < CONFIG.ARCADE_SLOT_COST) continue;
    currency.coins -= CONFIG.ARCADE_SLOT_COST;
    machine.used = true;

    const outcome = rng.weighted([
      { item: 'nothing', weight: 40 },
      { item: 'coins_small', weight: 35 },
      { item: 'coins_big', weight: 15 },
      { item: 'item', weight: 10 },
    ]);
    events?.emit('arcade:slot', { outcome });
    if (outcome === 'coins_small') spawnPickup(world, PICKUP_TYPE.COIN, { x: machine.x, y: machine.y - 20, value: 3 });
    else if (outcome === 'coins_big') spawnPickup(world, PICKUP_TYPE.COIN, { x: machine.x, y: machine.y - 20, value: 10 });
    else if (outcome === 'item') {
      const itemId = itemPools?.draw('shop', rng);
      if (itemId) spawnItemPedestal(world, itemId, { x: machine.x, y: machine.y - 24 });
    }
  }

  for (const machine of world.entities.byType('fortuneMachine')) {
    if (!machine.alive) continue;
    const overlapping = circlesOverlap(machine.x, machine.y, machine.radius, player.x, player.y, player.radius);
    if (!overlapping) {
      machine.used = false;
      continue;
    }
    if (machine.used || !currency || currency.coins < CONFIG.ARCADE_SLOT_COST) continue;
    currency.coins -= CONFIG.ARCADE_SLOT_COST;
    machine.used = true;

    const cardId = cardPools?.draw('treasure', rng);
    events?.emit('arcade:fortune', { cardId });
    if (cardId) spawnCardPickup(world, cardId, { x: machine.x, y: machine.y - 24 });
  }
}
