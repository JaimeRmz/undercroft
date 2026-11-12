import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { createEventBus } from '../src/core/events.js';
import { buildItemPools } from '../src/systems/items.js';
import {
  TrinketInventory,
  equipTrinket,
  unequipTrinket,
  spawnTrinketPickup,
  dropTrinket,
  resolveTrinketPickups,
} from '../src/systems/trinkets.js';

const LUCKY_CHARM = { id: 'test:lucky', name: 'Lucky Charm', effects: [{ stat: 'luck', value: 2 }] };
const SWIFT_BEAD = { id: 'test:swift', name: 'Swift Bead', effects: [{ stat: 'speed', value: 0.2 }] };

test('equipTrinket applies the new effect and, if one was already held, cleanly un-applies it first', () => {
  const stats = new Stats();
  const inventory = new TrinketInventory();

  equipTrinket(inventory, stats, LUCKY_CHARM);
  assert.equal(stats.luck, 2);
  assert.equal(inventory.current, LUCKY_CHARM);

  const previous = equipTrinket(inventory, stats, SWIFT_BEAD);
  assert.equal(previous, LUCKY_CHARM);
  assert.equal(stats.luck, 0, 'the old trinket\'s bonus must be fully removed on swap');
  assert.ok(Math.abs(stats.speed - (1 + 0.2)) < 1e-9);
  assert.equal(inventory.current, SWIFT_BEAD);
});

test('unequipTrinket clears the slot and reverses its effect; a no-op on an empty slot', () => {
  const stats = new Stats();
  const inventory = new TrinketInventory();
  assert.equal(unequipTrinket(inventory, stats), null);

  equipTrinket(inventory, stats, LUCKY_CHARM);
  const dropped = unequipTrinket(inventory, stats);
  assert.equal(dropped, LUCKY_CHARM);
  assert.equal(stats.luck, 0);
  assert.equal(inventory.current, null);
});

test('dropTrinket spawns the held trinket back on the ground and empties the slot; no-op when nothing is held', () => {
  const world = new World({ widthTiles: 20, heightTiles: 20, tileSize: 40 });
  const stats = new Stats();
  const inventory = new TrinketInventory();

  assert.equal(dropTrinket(world, inventory, stats, { x: 100, y: 100 }), null);

  equipTrinket(inventory, stats, LUCKY_CHARM);
  const pickup = dropTrinket(world, inventory, stats, { x: 100, y: 100 });
  assert.ok(pickup);
  assert.equal(pickup.trinketId, 'test:lucky');
  assert.equal(stats.luck, 0);
  assert.equal(inventory.current, null);
});

test('resolveTrinketPickups equips a touched trinket, removes it from pools, and emits item:pickup', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const pickup = spawnTrinketPickup(world, 'test:lucky', { x: 100, y: 100 });
  const inventory = new TrinketInventory();
  const pools = buildItemPools([LUCKY_CHARM]);
  const events = createEventBus();
  let payload;
  events.on('item:pickup', (p) => (payload = p));

  resolveTrinketPickups(world, player, {
    inventory,
    stats: player.stats,
    events,
    pools,
    getTrinketDef: (id) => (id === 'test:lucky' ? LUCKY_CHARM : null),
  });

  assert.ok(!pickup.alive);
  assert.equal(player.stats.luck, 2);
  assert.equal(pools.poolSize('treasure'), 0);
  assert.equal(payload.name, 'Lucky Charm');
});

test('resolveTrinketPickups swapping while already holding one drops the previous trinket at the same spot', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new TrinketInventory();
  equipTrinket(inventory, player.stats, LUCKY_CHARM);

  spawnTrinketPickup(world, 'test:swift', { x: 100, y: 100 });
  resolveTrinketPickups(world, player, {
    inventory,
    stats: player.stats,
    getTrinketDef: (id) => ({ 'test:lucky': LUCKY_CHARM, 'test:swift': SWIFT_BEAD })[id],
  });

  assert.equal(inventory.current, SWIFT_BEAD);
  assert.equal(player.stats.luck, 0);

  const dropped = world.entities.byType('trinketPickup').find((p) => p.alive);
  assert.ok(dropped, 'the previously-held trinket should reappear as a new pickup');
  assert.equal(dropped.trinketId, 'test:lucky');
  assert.equal(dropped.x, 100);
  assert.equal(dropped.y, 100);
});

test('resolveTrinketPickups ignores pickups the player has not reached', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const pickup = spawnTrinketPickup(world, 'test:lucky', { x: 5000, y: 5000 });
  const inventory = new TrinketInventory();
  resolveTrinketPickups(world, player, {
    inventory,
    stats: player.stats,
    getTrinketDef: () => LUCKY_CHARM,
  });
  assert.ok(pickup.alive);
  assert.equal(inventory.current, null);
});
