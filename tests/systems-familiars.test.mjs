import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { spawnFamiliar, updateFamiliars } from '../src/systems/familiars.js';
import { pickUpItem, ItemInventory } from '../src/systems/items.js';
import { Health } from '../src/systems/health.js';
import { placeFamiliarsInRoom } from '../src/systems/roomEntry.js';

const ORBIT_DEF = { id: 'test:orbiter', name: 'Test Orbiter', behavior: 'orbit', radius: 8, damage: 2, orbitRadius: 40, orbitSpeed: 10 };
const HOVER_DEF = { id: 'test:hover', name: 'Test Hover', behavior: 'hover', radius: 8, damage: 2, followOffsetX: -20, followOffsetY: 0 };
const FOLLOW_DEF = { id: 'test:follow', name: 'Test Follower', behavior: 'follow', radius: 8, damage: 5, followOffsetX: 0, followOffsetY: -20, fireCooldownSeconds: 0.1, range: 10 };
const CHASER_DEF = { id: 'core:chaser', hp: 10, speed: 0, radius: 14, behavior: 'chase' };

test('spawnFamiliar creates a familiar entity at the player\'s position carrying its def\'s behavior/stats', () => {
  const world = new World();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const familiar = spawnFamiliar(world, ORBIT_DEF, { player });
  assert.equal(familiar.type, 'familiar');
  assert.equal(familiar.x, 100);
  assert.equal(familiar.y, 100);
  assert.equal(familiar.behavior, 'orbit');
  assert.equal(familiar.damage, 2);
});

test('an "orbit" familiar sweeps a circle around the player at orbitRadius', () => {
  const world = new World();
  const player = createPlayer(world, { x: 200, y: 200, stats: new Stats() });
  const familiar = spawnFamiliar(world, ORBIT_DEF, { player });

  for (let i = 0; i < 60; i++) updateFamiliars(world, player, 1 / 60, {});
  const dist = Math.hypot(familiar.x - player.x, familiar.y - player.y);
  assert.ok(Math.abs(dist - ORBIT_DEF.orbitRadius) < 0.5, `expected ~${ORBIT_DEF.orbitRadius}px from the player, got ${dist}`);
});

test('a "hover" familiar eases toward a fixed offset from the player and tracks it as the player moves', () => {
  const world = new World();
  const player = createPlayer(world, { x: 300, y: 300, stats: new Stats() });
  const familiar = spawnFamiliar(world, HOVER_DEF, { player });

  for (let i = 0; i < 300; i++) updateFamiliars(world, player, 1 / 60, {});
  assert.ok(Math.abs(familiar.x - (player.x + HOVER_DEF.followOffsetX)) < 1);
  assert.ok(Math.abs(familiar.y - (player.y + HOVER_DEF.followOffsetY)) < 1);

  player.x += 100; // player moves away; the familiar should keep tracking the offset, not stay put
  for (let i = 0; i < 300; i++) updateFamiliars(world, player, 1 / 60, {});
  assert.ok(Math.abs(familiar.x - (player.x + HOVER_DEF.followOffsetX)) < 1);
});

test('"orbit" and "hover" familiars damage any enemy they touch, on a cooldown (not every single tick)', () => {
  const world = new World();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const familiar = spawnFamiliar(world, HOVER_DEF, { player });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: familiar.x, y: familiar.y }); // start overlapping

  updateFamiliars(world, player, 1 / 60, {});
  const hpAfterOneHit = enemy.hp;
  assert.ok(hpAfterOneHit < CHASER_DEF.hp, 'contact damage should have landed once');

  for (let i = 0; i < 5; i++) updateFamiliars(world, player, 1 / 60, {});
  assert.equal(enemy.hp, hpAfterOneHit, 'should not deal damage again while the contact cooldown is still running');
});

test('a "follow" familiar fires a tear at the nearest enemy in range on a cooldown, and does nothing with no target in range', () => {
  const world = new World();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  spawnFamiliar(world, FOLLOW_DEF, { player });
  spawnEnemy(world, CHASER_DEF, { x: 100, y: 50 }); // within FOLLOW_DEF.range (10 tiles)

  for (let i = 0; i < 30; i++) updateFamiliars(world, player, 1 / 60, {}); // > fireCooldownSeconds (0.1s)
  assert.ok(world.entities.byType('projectile').length > 0, 'expected the follower to have fired at least one tear');

  world.entities.clear();
  const player2 = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  spawnFamiliar(world, FOLLOW_DEF, { player: player2 });
  for (let i = 0; i < 30; i++) updateFamiliars(world, player2, 1 / 60, {});
  assert.equal(world.entities.byType('projectile').length, 0, 'should not fire with no enemy in range');
});

test('pickUpItem spawns a familiar when the def has grantsFamiliar and a world/getFamiliarDef are supplied in ctx', () => {
  const world = new World();
  const player = createPlayer(world, { x: 50, y: 60, stats: new Stats() });
  const inventory = new ItemInventory();
  const itemDef = { id: 'test:item-with-familiar', type: 'passive', effects: [], grantsFamiliar: 'test:orbiter' };
  const getFamiliarDef = (id) => (id === 'test:orbiter' ? ORBIT_DEF : null);

  pickUpItem(inventory, new Stats(), new Health(), itemDef, player, { world, getFamiliarDef });
  assert.equal(world.entities.byType('familiar').length, 1);
});

test('pickUpItem does not throw and spawns no familiar when ctx is omitted, even for a grantsFamiliar item', () => {
  const inventory = new ItemInventory();
  const itemDef = { id: 'test:item-with-familiar', type: 'passive', effects: [], grantsFamiliar: 'test:orbiter' };
  assert.doesNotThrow(() => pickUpItem(inventory, new Stats(), new Health(), itemDef, { x: 0, y: 0 }));
});

test('placeFamiliarsInRoom re-homes every familiar from the old world into the new one and snaps it to the player', () => {
  const fromWorld = new World();
  const toWorld = new World();
  const player = createPlayer(fromWorld, { x: 10, y: 10, stats: new Stats() });
  const familiar = spawnFamiliar(fromWorld, ORBIT_DEF, { player });

  player.x = 500;
  player.y = 400;
  placeFamiliarsInRoom(fromWorld, toWorld, player);

  assert.equal(fromWorld.entities.byType('familiar').length, 0);
  assert.equal(toWorld.entities.byType('familiar').length, 1);
  assert.equal(familiar.x, 500);
  assert.equal(familiar.y, 400);
});

test('placeFamiliarsInRoom is a no-op when the old and new world are the same (e.g. no room change happened)', () => {
  const world = new World();
  const player = createPlayer(world, { x: 10, y: 10, stats: new Stats() });
  spawnFamiliar(world, ORBIT_DEF, { player });
  placeFamiliarsInRoom(world, world, player);
  assert.equal(world.entities.byType('familiar').length, 1);
});
