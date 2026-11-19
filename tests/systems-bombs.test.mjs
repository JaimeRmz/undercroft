import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { Room } from '../src/systems/room.js';
import { createPlayer } from '../src/systems/player.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { placeBomb, updateBombs } from '../src/systems/bombs.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chase' };

test('a bomb does nothing before its fuse expires', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const bomb = placeBomb(world, { x: 100, y: 100, fuseSeconds: 1 });
  updateBombs(world, 0.5, {});
  assert.ok(bomb.alive);
  assert.ok(bomb.fuse > 0);
});

test('once the fuse expires, the bomb explodes, damages nearby enemies, and destroys itself', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 110, y: 100 });
  const bomb = placeBomb(world, { x: 100, y: 100, fuseSeconds: 1, radius: 60, damage: 100 });
  const events = createEventBus();
  updateBombs(world, 1.1, { events });
  assert.ok(!bomb.alive);
  assert.ok(!enemy.alive); // 100 damage one-shots a 5hp chaser
});

test('an enemy outside the blast radius takes no damage', () => {
  const world = new World({ widthTiles: 100, heightTiles: 100, tileSize: 40 });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 100 + 2000, y: 100 });
  const bomb = placeBomb(world, { x: 100, y: 100, fuseSeconds: 1, radius: 60 });
  updateBombs(world, 1.1, {});
  assert.ok(enemy.alive);
  assert.equal(enemy.hp, enemy.maxHp);
});

test('the player takes self-damage when caught in their own blast', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  const bomb = placeBomb(world, { x: 100, y: 100, fuseSeconds: 1, radius: 60 });
  updateBombs(world, 1.1, { player, playerHealth, events: createEventBus() });
  assert.ok(playerHealth.red < 6);
});

test('a bomb explosion destroys rocks within the blast radius but leaves distant rocks alone', () => {
  const room = new Room();
  const nearTileCenter = room.world.tileGrid.tileCenter(6, 3);
  room.placeRock(6, 3);
  room.placeRock(1, 1); // far corner, should survive
  const bomb = placeBomb(room.world, { x: nearTileCenter.x, y: nearTileCenter.y, fuseSeconds: 1, radius: 60 });
  updateBombs(room.world, 1.1, { room, events: createEventBus() });
  assert.equal(room.getTileType(6, 3), 'floor');
  assert.equal(room.getTileType(1, 1), 'rock');
});

test('a bombed tinted rock drops a guaranteed reward pickup (P2.Q Q3a)', () => {
  const room = new Room();
  const c = room.world.tileGrid.tileCenter(6, 3);
  room.placeTintedRock(6, 3);
  const bomb = placeBomb(room.world, { x: c.x, y: c.y, fuseSeconds: 1, radius: 60 });
  updateBombs(room.world, 1.1, { room, events: createEventBus(), rng: new Rng('q3a') });
  assert.equal(room.getTileType(6, 3), 'floor', 'tinted rock is destroyed');
  assert.ok(room.world.entities.byType('pickup').some((p) => p.alive), 'a reward pickup dropped');
});

test('a bombed mound is destroyed like a rock (P2.Q Q3a)', () => {
  const room = new Room();
  const c = room.world.tileGrid.tileCenter(6, 3);
  room.placeMound(6, 3);
  placeBomb(room.world, { x: c.x, y: c.y, fuseSeconds: 1, radius: 60 });
  updateBombs(room.world, 1.1, { room, events: createEventBus(), rng: new Rng('q3b') });
  assert.equal(room.getTileType(6, 3), 'floor');
});

test('bomb:explode event carries position and radius', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
  placeBomb(world, { x: 50, y: 60, fuseSeconds: 1, radius: 70 });
  const events = createEventBus();
  let payload;
  events.on('bomb:explode', (p) => (payload = p));
  updateBombs(world, 1.1, { events });
  assert.deepEqual(payload, { x: 50, y: 60, radius: 70 });
});
