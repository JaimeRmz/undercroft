import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { spawnTear } from '../src/systems/projectiles.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { resolveCombat } from '../src/systems/combat.js';
import { applyStatus } from '../src/systems/statusEffects.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chase', contactDamageHalfHearts: 1 };

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

test('a charmed enemy deals no contact damage to the player', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 405, y: 400 });
  applyStatus(enemy, 'charm');
  const playerHealth = new Health({ redMax: 6 });
  resolveCombat(world, { player, playerHealth, events: createEventBus() });
  assert.equal(playerHealth.red, 6, 'charmed enemy should not have hurt the player');
});

test('a charmed enemy damages another enemy it overlaps, on a cooldown rather than every tick', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() }); // far away, not involved
  const charmed = spawnEnemy(world, { ...CHASER_DEF, damage: 3 }, { x: 405, y: 400 });
  applyStatus(charmed, 'charm');
  const target = spawnEnemy(world, CHASER_DEF, { x: 405, y: 400 }); // overlapping
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();

  resolveCombat(world, { player, playerHealth, events });
  assert.equal(target.hp, target.maxHp - 3);

  resolveCombat(world, { player, playerHealth, events }); // still on cooldown
  assert.equal(target.hp, target.maxHp - 3, 'should not deal damage again before the cooldown elapses');

  for (let i = 0; i < CONFIG.CHARM_ATTACK_COOLDOWN_TICKS; i++) resolveCombat(world, { player, playerHealth, events });
  assert.equal(target.hp, target.maxHp - 6, 'cooldown elapsed, should attack again');
});
