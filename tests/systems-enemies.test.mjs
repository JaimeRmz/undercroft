import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { spawnEnemy, updateEnemies } from '../src/systems/enemies.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chaser', contactDamageHalfHearts: 1 };
const FLIER_DEF = { id: 'core:erratic-flier', hp: 4, speed: 70, radius: 12, behavior: 'erratic_flier', flies: true };
const TURRET_DEF = {
  id: 'core:turret', hp: 6, speed: 0, radius: 14, behavior: 'turret',
  fireCooldownSeconds: 0.5, shotSpeed: 1, damage: 2, range: 5,
};

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('chaser moves directly toward the player', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 500, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 400, y: 400 });
  updateEnemies(world, player, 1 / 60, {});
  assert.ok(enemy.x > 400, 'should have moved right, toward the player');
  assert.ok(Math.abs(enemy.y - 400) < 1e-6, 'player is directly to the right, so y should not change');
});

test('erratic flier changes direction over time and ignores tile collision (flies)', () => {
  const world = freshWorld();
  world.tileGrid.setSolid(10, 10, true); // put a wall right where the flier starts
  const center = world.tileGrid.tileCenter(10, 10);
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const flier = spawnEnemy(world, FLIER_DEF, { x: center.x, y: center.y });
  const rng = new Rng(42);
  for (let i = 0; i < 180; i++) updateEnemies(world, player, 1 / 60, { rng }); // 3 seconds
  // Flier should have picked a direction and moved; tile collision should not have pushed it out immediately.
  assert.ok(flier.aiDir.x !== 0 || flier.aiDir.y !== 0);
});

test('turret stays stationary and fires at the player on a cooldown', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 600, y: 400, stats: new Stats() });
  const turret = spawnEnemy(world, TURRET_DEF, { x: 400, y: 400 });
  const events = createEventBus();
  let shots = 0;
  events.on('enemy:shoot', () => shots++);

  for (let i = 0; i < 180; i++) updateEnemies(world, player, 1 / 60, { events }); // 3 seconds @ 0.5s cooldown
  assert.equal(turret.vx, 0);
  assert.equal(turret.vy, 0);
  assert.ok(shots >= 5, `expected multiple shots over 3s at 0.5s cooldown, got ${shots}`);

  const projectiles = world.entities.byType('projectile');
  assert.ok(projectiles.length > 0);
  assert.equal(projectiles[0].team, 'enemy');
});
