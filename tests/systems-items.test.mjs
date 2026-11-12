import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer, updatePlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { createInputState } from '../src/engine/input.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';
import {
  ItemInventory,
  applyPassiveItem,
  pickUpItem,
  chargeActivesOnRoomClear,
  useActiveItem,
  ItemPools,
  buildItemPools,
  spawnItemPedestal,
  resolveItemPedestals,
} from '../src/systems/items.js';

const DAMAGE_ITEM = { id: 'test:dmg', name: 'Test Fang', type: 'passive', effects: [{ stat: 'damageUps', value: 2 }] };
const HEART_ITEM = { id: 'test:heart', name: 'Test Heart', type: 'passive', effects: [{ stat: 'redHeartContainers', value: 2 }] };
const HEAL_ACTIVE = { id: 'test:heal', name: 'Test Heal', type: 'active', maxCharges: 2, activeEffect: { type: 'heal', value: 4 } };
const NOVA_ACTIVE = { id: 'test:nova', name: 'Test Nova', type: 'active', maxCharges: 1, activeEffect: { type: 'nova', radius: 100, damage: 50 } };
const SPEED_ACTIVE = { id: 'test:speed', name: 'Test Speed', type: 'active', maxCharges: 1, activeEffect: { type: 'speedBoost', multiplier: 2, duration: 1 } };
const TELEPORT_ACTIVE = { id: 'test:tp', name: 'Test TP', type: 'active', maxCharges: 1, activeEffect: { type: 'teleport' } };

test('applyPassiveItem adds a stat delta directly onto Stats', () => {
  const stats = new Stats();
  applyPassiveItem(stats, new Health(), DAMAGE_ITEM);
  assert.equal(stats.damageUps, 2);
});

test('applyPassiveItem routes heart-container effects through Health, not Stats', () => {
  const stats = new Stats();
  const health = new Health({ redMax: 6 });
  applyPassiveItem(stats, health, HEART_ITEM);
  assert.equal(health.redMax, 8);
  assert.equal(health.red, 8); // addRedContainer also heals the new capacity
});

test('pickUpItem records passives in inventory and applies them; actives join at 0 charge without an effect', () => {
  const inventory = new ItemInventory();
  const stats = new Stats();
  const health = new Health();
  pickUpItem(inventory, stats, health, DAMAGE_ITEM);
  assert.deepEqual(inventory.passives, ['test:dmg']);
  assert.equal(stats.damageUps, 2);

  pickUpItem(inventory, stats, health, HEAL_ACTIVE);
  assert.equal(inventory.actives.length, 1);
  assert.equal(inventory.actives[0].charge, 0);
  assert.equal(inventory.actives[0].maxCharges, 2);
});

test('chargeActivesOnRoomClear adds one charge per clear, capped at maxCharges', () => {
  const inventory = new ItemInventory();
  pickUpItem(inventory, new Stats(), new Health(), HEAL_ACTIVE); // maxCharges 2
  chargeActivesOnRoomClear(inventory);
  assert.equal(inventory.actives[0].charge, 1);
  chargeActivesOnRoomClear(inventory);
  assert.equal(inventory.actives[0].charge, 2);
  chargeActivesOnRoomClear(inventory);
  assert.equal(inventory.actives[0].charge, 2); // capped
});

test('useActiveItem refuses to fire below full charge, and resets charge to 0 after firing', () => {
  const inventory = new ItemInventory();
  pickUpItem(inventory, new Stats(), new Health(), HEAL_ACTIVE);
  const playerHealth = new Health({ redMax: 6 });
  playerHealth.red = 2;

  assert.equal(useActiveItem(inventory, 0, HEAL_ACTIVE, { playerHealth }), false);
  assert.equal(playerHealth.red, 2);

  chargeActivesOnRoomClear(inventory);
  chargeActivesOnRoomClear(inventory);
  assert.equal(useActiveItem(inventory, 0, HEAL_ACTIVE, { playerHealth }), true);
  assert.equal(playerHealth.red, 6);
  assert.equal(inventory.actives[0].charge, 0);
});

test('nova active damages/kills enemies in radius around the player', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'e', hp: 10, behavior: 'chaser' }, { x: 130, y: 100 });
  const inventory = new ItemInventory();
  pickUpItem(inventory, new Stats(), new Health(), NOVA_ACTIVE);
  chargeActivesOnRoomClear(inventory);
  const events = createEventBus();
  useActiveItem(inventory, 0, NOVA_ACTIVE, { world, player, events });
  assert.ok(!enemy.alive);
});

test('speedBoost active sets a temporary multiplier that player.js consumes and expires', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  pickUpItem(inventory, new Stats(), new Health(), SPEED_ACTIVE);
  chargeActivesOnRoomClear(inventory);
  useActiveItem(inventory, 0, SPEED_ACTIVE, { player });
  assert.equal(player.speedBoostMult, 2);

  const input = createInputState();
  input.moveX = 1;
  for (let i = 0; i < 10; i++) updatePlayer(world, player, input, 1 / 60);
  const boostedSpeed = Math.hypot(player.vx, player.vy);

  for (let i = 0; i < 120; i++) updatePlayer(world, player, input, 1 / 60); // past the 1s duration
  assert.equal(player.speedBoostMult, 1);
  const normalSpeed = Math.hypot(player.vx, player.vy);
  assert.ok(boostedSpeed > normalSpeed);
});

test('teleport active moves the player to a valid in-bounds tile', () => {
  const world = new World({ widthTiles: 20, heightTiles: 20, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  pickUpItem(inventory, new Stats(), new Health(), TELEPORT_ACTIVE);
  chargeActivesOnRoomClear(inventory);
  useActiveItem(inventory, 0, TELEPORT_ACTIVE, { world, player, rng: new Rng('tp-test') });
  assert.ok(player.x >= 0 && player.x <= 20 * 40);
  assert.ok(player.y >= 0 && player.y <= 20 * 40);
});

test('ItemPools: draw respects weight, and removeFromAllPools strips an id from every pool', () => {
  const pools = new ItemPools();
  pools.register('treasure', 'a', 9);
  pools.register('treasure', 'b', 1);
  pools.register('shop', 'a', 1);
  const rng = new Rng('pool-draw');
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 500; i++) counts[pools.draw('treasure', rng)]++;
  assert.ok(counts.a > counts.b * 3);

  pools.removeFromAllPools('a');
  assert.equal(pools.poolSize('treasure'), 1);
  assert.equal(pools.poolSize('shop'), 0);
});

test('buildItemPools defaults to the "treasure" pool when a def specifies none', () => {
  const pools = buildItemPools([{ id: 'x', name: 'X' }]);
  assert.equal(pools.poolSize('treasure'), 1);
});

test('resolveItemPedestals: touching a pedestal picks up the item, removes it from pools, and emits item:pickup', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const pedestal = spawnItemPedestal(world, 'test:dmg', { x: 100, y: 100 });
  const inventory = new ItemInventory();
  const pools = buildItemPools([DAMAGE_ITEM]);
  const events = createEventBus();
  let payload;
  events.on('item:pickup', (p) => (payload = p));

  resolveItemPedestals(world, player, {
    inventory,
    stats: player.stats,
    playerHealth: new Health(),
    events,
    pools,
    getItemDef: (id) => (id === 'test:dmg' ? DAMAGE_ITEM : null),
  });

  assert.ok(!pedestal.alive);
  assert.equal(player.stats.damageUps, 2);
  assert.equal(pools.poolSize('treasure'), 0);
  assert.equal(payload.name, 'Test Fang');
});

test('resolveItemPedestals ignores pedestals the player has not reached', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const pedestal = spawnItemPedestal(world, 'test:dmg', { x: 5000, y: 5000 });
  const inventory = new ItemInventory();
  resolveItemPedestals(world, player, {
    inventory,
    stats: player.stats,
    playerHealth: new Health(),
    getItemDef: () => DAMAGE_ITEM,
  });
  assert.ok(pedestal.alive);
  assert.equal(inventory.passives.length, 0);
});
