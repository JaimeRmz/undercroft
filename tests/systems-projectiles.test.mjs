import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { spawnTear, updateProjectiles } from '../src/systems/projectiles.js';
import { Stats } from '../src/systems/stats.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

test('spawnTear sets velocity along dir scaled by shotSpeed, plus inherited owner velocity', () => {
  const world = new World();
  const stats = new Stats({ shotSpeed: 2 });
  const tear = spawnTear(world, { x: 100, y: 100, dir: { x: 1, y: 0 }, stats, ownerVelocity: { x: 10, y: 0 } });
  const expectedVx = 1 * (2 * CONFIG.TEAR_BASE_SPEED_PX_PER_SEC) + 10 * CONFIG.SHOT_INHERITS_PLAYER_VELOCITY;
  assert.ok(Math.abs(tear.vx - expectedVx) < 1e-6);
  assert.equal(tear.vy, 0);
  assert.equal(tear.damage, stats.damage);
});

test('P1.G7: spawnTear emits tear:fired (muzzle-puff hook) with the spawn position, direction and team, when given an events bus', () => {
  const world = new World();
  const stats = new Stats();
  const events = createEventBus();
  let seen = null;
  events.on('tear:fired', (payload) => { seen = payload; });
  spawnTear(world, { x: 42, y: 7, dir: { x: 0, y: -1 }, stats, team: 'enemy', events });
  assert.deepEqual(seen, { x: 42, y: 7, dir: { x: 0, y: -1 }, team: 'enemy' });
});

test('spawnTear without an events bus does not throw (events is optional)', () => {
  const world = new World();
  assert.doesNotThrow(() => spawnTear(world, { x: 0, y: 0, dir: { x: 1, y: 0 }, stats: new Stats() }));
});

test('updateProjectiles moves the tear and arcs its height up then back to 0 across its range', () => {
  const world = new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 }); // big open room, no walls in the way
  const stats = new Stats({ range: 1 }); // short range so the test runs fast
  const tear = spawnTear(world, { x: 100, y: 100, dir: { x: 1, y: 0 }, stats });
  const events = createEventBus();

  const heights = [];
  for (let i = 0; i < 2000 && tear.alive; i++) {
    updateProjectiles(world, 1 / 240, events); // small dt for fine-grained sampling
    heights.push(tear.height);
  }
  assert.ok(!tear.alive, 'tear should have expired at max range');
  const mid = heights[Math.floor(heights.length / 2)];
  assert.ok(mid > 0, 'tear should be above 0 height mid-flight');
  assert.ok(heights[0] >= 0 && heights[0] < mid);
});

test('updateProjectiles destroys the tear early and emits projectile:splash on hitting a solid tile', () => {
  const world = new World({ widthTiles: 10, heightTiles: 10, tileSize: 40 });
  world.tileGrid.setSolid(5, 2, true); // wall tile directly in the tear's path
  world.tileGrid.setBlocksProjectile(5, 2, true);
  const stats = new Stats({ range: 100 }); // long range; wall should stop it first
  const tear = spawnTear(world, { x: 40, y: 100, dir: { x: 1, y: 0 }, stats });
  const events = createEventBus();
  let splash;
  events.on('projectile:splash', (p) => (splash = p));

  for (let i = 0; i < 500 && tear.alive; i++) {
    updateProjectiles(world, 1 / 60, events);
  }
  assert.ok(!tear.alive);
  assert.ok(splash);
  assert.equal(splash.reason, 'wall');
});

test('updateProjectiles flies straight over a pit tile (ground-only solid) without splashing', () => {
  const world = new World({ widthTiles: 20, heightTiles: 10, tileSize: 40 }); // wide open room, well past the pit tile
  world.tileGrid.setSolid(5, 2, true); // a pit is solid for ground movement...
  // ...but NOT in the blocksProjectile bitset, so a tear should sail right over it, into the open floor beyond.
  const stats = new Stats({ range: 10 }); // expires inside the room, well before the far wall
  const tear = spawnTear(world, { x: 40, y: 100, dir: { x: 1, y: 0 }, stats });
  const events = createEventBus();
  let splash;
  events.on('projectile:splash', (p) => (splash = p));

  for (let i = 0; i < 500 && tear.alive; i++) {
    updateProjectiles(world, 1 / 60, events);
  }
  assert.ok(!tear.alive, 'tear should still expire eventually, at max range');
  assert.equal(splash.reason, 'range');
});
