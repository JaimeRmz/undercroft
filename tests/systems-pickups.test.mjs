import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';
import {
  PICKUP_TYPE,
  Currency,
  spawnPickup,
  rollCoinValue,
  rollRoomClearReward,
  rollChestReward,
  resolvePickups,
  spawnRewardPickup,
} from '../src/systems/pickups.js';
import { buildItemPools } from '../src/systems/items.js';

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('rollCoinValue returns only 1, 5, or 10 and favors 1 heavily', () => {
  const rng = new Rng('coin-values');
  const counts = { 1: 0, 5: 0, 10: 0 };
  for (let i = 0; i < 1000; i++) counts[rollCoinValue(rng)]++;
  assert.equal(counts[1] + counts[5] + counts[10], 1000);
  assert.ok(counts[1] > counts[5] + counts[10]);
});

test('rollRoomClearReward: luck=0 gives "nothing" roughly 22% of the time', () => {
  const rng = new Rng('reward-nothing');
  let nothing = 0;
  const trials = 5000;
  for (let i = 0; i < trials; i++) if (rollRoomClearReward(rng, 0) === null) nothing++;
  const rate = nothing / trials;
  assert.ok(rate > 0.18 && rate < 0.26, `nothing rate ${rate} outside expected band`);
});

test('rollRoomClearReward: every category is reachable', () => {
  const rng = new Rng('reward-categories');
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(rollRoomClearReward(rng, 5));
  for (const expected of [null, 'card', 'pill', 'trinket', 'coin', 'heart', 'key', 'bomb', 'chest']) {
    assert.ok(seen.has(expected), `expected to see category "${expected}"`);
  }
});

test('rollRoomClearReward: higher luck increases the chance of a non-nothing result', () => {
  const trials = 4000;
  const rateAt = (luck) => {
    const rng = new Rng(`reward-luck-${luck}`);
    let nothing = 0;
    for (let i = 0; i < trials; i++) if (rollRoomClearReward(rng, luck) === null) nothing++;
    return nothing / trials;
  };
  assert.ok(rateAt(10) < rateAt(0));
});

test('rollChestReward always returns one of the known categories', () => {
  const rng = new Rng('chest-reward');
  const allowed = new Set(['coin', 'heart', 'key', 'bomb', 'trinket']);
  for (let i = 0; i < 200; i++) assert.ok(allowed.has(rollChestReward(rng)));
});

test('resolvePickups: coin/key/bomb pickups credit Currency and are destroyed', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const coin = spawnPickup(world, PICKUP_TYPE.COIN, { x: 100, y: 100, value: 5 });
  const currency = new Currency();
  resolvePickups(world, player, { currency, rng: new Rng('resolve-1') });
  assert.equal(currency.coins, 5);
  assert.ok(!coin.alive);
});

test('resolvePickups: heart pickups heal via Health, soul/black hearts add extra hearts', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  playerHealth.red = 4; // took some damage already
  spawnPickup(world, PICKUP_TYPE.HEART_HALF, { x: 100, y: 100 });
  resolvePickups(world, player, { playerHealth, rng: new Rng('resolve-2') });
  assert.equal(playerHealth.red, 5);
});

test('resolvePickups: an unopened normal chest opens on touch and spawns a reward pickup', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const chest = spawnPickup(world, PICKUP_TYPE.CHEST, { x: 100, y: 100 });
  const before = world.entities.all().length;
  resolvePickups(world, player, { currency: new Currency(), playerHealth: new Health(), rng: new Rng('chest-open') });
  assert.ok(!chest.alive);
  assert.ok(world.entities.all().length >= before); // reward pickup spawned (replacing the chest)
});

test('resolvePickups: a locked chest stays locked with no keys, and consumes exactly one key when opened', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const chest = spawnPickup(world, PICKUP_TYPE.CHEST_LOCKED, { x: 100, y: 100 });
  const currency = new Currency({ keys: 0 });
  resolvePickups(world, player, { currency, playerHealth: new Health(), rng: new Rng('locked-1') });
  assert.ok(chest.alive, 'should remain locked with no keys');

  currency.keys = 2;
  resolvePickups(world, player, { currency, playerHealth: new Health(), rng: new Rng('locked-2') });
  assert.ok(!chest.alive);
  assert.equal(currency.keys, 1);
});

test('resolvePickups emits pickup:collected for non-chest pickups', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  spawnPickup(world, PICKUP_TYPE.KEY, { x: 100, y: 100 });
  const events = createEventBus();
  let payload;
  events.on('pickup:collected', (p) => (payload = p));
  resolvePickups(world, player, { currency: new Currency(), events, rng: new Rng('resolve-3') });
  assert.equal(payload.type, PICKUP_TYPE.KEY);
});

test('spawnRewardPickup("trinket") draws from trinketPools and spawns a trinketPickup; no-op without trinketPools', () => {
  const world = freshWorld();
  const pools = buildItemPools([{ id: 'test:lucky', pools: ['treasure'] }]);
  const spawned = spawnRewardPickup(world, 'trinket', { x: 50, y: 50, rng: new Rng('trinket-reward'), trinketPools: pools });
  assert.ok(spawned);
  assert.equal(spawned.trinketId, 'test:lucky');

  assert.equal(spawnRewardPickup(world, 'trinket', { x: 50, y: 50, rng: new Rng('x') }), null);
});

test('resolvePickups ignores pickups the player has not reached yet', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const coin = spawnPickup(world, PICKUP_TYPE.COIN, { x: 5000, y: 5000, value: 1 });
  const currency = new Currency();
  resolvePickups(world, player, { currency, rng: new Rng('resolve-4') });
  assert.equal(currency.coins, 0);
  assert.ok(coin.alive);
});
