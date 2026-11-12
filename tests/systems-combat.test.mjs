import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { spawnTear } from '../src/systems/projectiles.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { resolveCombat } from '../src/systems/combat.js';
import { createEventBus } from '../src/core/events.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chaser', contactDamageHalfHearts: 1 };

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('overlapping enemy deals contact damage to the player', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  spawnEnemy(world, CHASER_DEF, { x: 405, y: 400 }); // overlapping
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  resolveCombat(world, { player, playerHealth, events });
  assert.equal(playerHealth.red, 5); // lost 1 half-heart
});

test('a player tear hitting an enemy reduces its hp and destroys the tear', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 500, y: 400 });
  const tear = spawnTear(world, { x: 495, y: 400, dir: { x: 1, y: 0 }, stats: player.stats }); // overlapping enemy
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  resolveCombat(world, { player, playerHealth, events });
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(!tear.alive);
});

test('an enemy dies and emits enemy:death once hp drops to 0 or below', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats({ damageUps: 20 }) }); // big damage, one-shot
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 500, y: 400 });
  spawnTear(world, { x: 495, y: 400, dir: { x: 1, y: 0 }, stats: player.stats });
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  let died = false;
  events.on('enemy:death', () => (died = true));
  resolveCombat(world, { player, playerHealth, events });
  assert.ok(!enemy.alive);
  assert.ok(died);
});

test('an enemy tear hitting the player damages them and is destroyed', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const enemyTear = spawnTear(world, { x: 405, y: 400, dir: { x: -1, y: 0 }, stats: { shotSpeed: 1, damage: 2, range: 5 }, team: 'enemy' });
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  resolveCombat(world, { player, playerHealth, events });
  assert.equal(playerHealth.red, 4); // lost 2 halves (rounded damage)
  assert.ok(!enemyTear.alive);
});

test('player i-frames prevent a second contact hit on the next resolve call', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  spawnEnemy(world, CHASER_DEF, { x: 405, y: 400 });
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  resolveCombat(world, { player, playerHealth, events });
  resolveCombat(world, { player, playerHealth, events }); // same frame-equivalent call, still invulnerable
  assert.equal(playerHealth.red, 5); // only hit once
});
