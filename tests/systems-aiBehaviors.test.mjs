import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { spawnEnemy, updateEnemies, isEnemyDamageBlocked, killEnemy } from '../src/systems/enemies.js';
import { createPlayer } from '../src/systems/player.js';
import { spawnTear } from '../src/systems/projectiles.js';
import { resolveCombat } from '../src/systems/combat.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

function freshWorld() {
  return new World({ widthTiles: 60, heightTiles: 60, tileSize: 40 });
}

const DT = 1 / 60;

test('wander: picks a direction and moves, ignoring the player entirely', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 2000, y: 2000, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 50, behavior: 'wander' }, { x: 400, y: 400, rng: new Rng(1) });
  const rng = new Rng(2);
  for (let i = 0; i < 60; i++) updateEnemies(world, player, DT, { rng });
  assert.ok(enemy.x !== 400 || enemy.y !== 400, 'should have moved somewhere');
});

test('hopLeap: stays idle then leaps toward the player in a short fast burst', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 600, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 60, behavior: 'hopLeap' }, { x: 400, y: 400 });
  for (let i = 0; i < 10; i++) updateEnemies(world, player, DT, {});
  assert.equal(enemy.hopPhase, 'idle');
  assert.equal(enemy.vx, 0);

  for (let i = 0; i < Math.ceil(CONFIG.HOP_IDLE_SECONDS / DT) + 2; i++) updateEnemies(world, player, DT, {});
  assert.equal(enemy.hopPhase, 'leaping');
  assert.ok(enemy.vx > 60, 'leap velocity should be a multiple of base speed, toward the player');
});

test('dashCharger: telegraphs (frozen, winding up) for ENEMY_ATTACK_TELEGRAPH_SECONDS, then dashes at high speed', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 700, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 60, behavior: 'dashCharger' }, { x: 400, y: 400 }); // same y: aligned immediately
  updateEnemies(world, player, DT, {});
  assert.ok(enemy.windingUp, 'should telegraph before dashing, not dash instantly');
  assert.ok(!enemy.dashing);
  assert.equal(enemy.vx, 0, 'frozen in place while winding up');

  for (let i = 0; i < Math.ceil(CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS / DT) + 1; i++) updateEnemies(world, player, DT, {});
  assert.ok(enemy.dashing);
  assert.ok(!enemy.windingUp);
  assert.ok(Math.abs(enemy.vx) > 60 * 2, 'dash speed should be a large multiple of base speed');
});

test('dashCharger: slowly repositions (does not dash) when not aligned', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 700, y: 700, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 60, behavior: 'dashCharger' }, { x: 400, y: 400 });
  updateEnemies(world, player, DT, {});
  assert.ok(!enemy.dashing);
  assert.ok(Math.hypot(enemy.vx, enemy.vy) < 60, 'repositioning speed should be slower than full dash speed');
});

test('fleeingSpawner: flees directly away from the player and stops spawning minions after its cap', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 1000, y: 1000, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 10, speed: 50, behavior: 'fleeingSpawner' }, { x: 400, y: 400 });
  const rng = new Rng('spawner');
  const events = createEventBus();
  let spawnedCount = 0;
  events.on('enemy:spawned', () => spawnedCount++);

  // Plenty of time for the spawner to hit its cap several times over.
  const seconds = CONFIG.FLEEING_SPAWNER_INTERVAL_SECONDS * (CONFIG.FLEEING_SPAWNER_MAX_MINIONS + 5);
  for (let i = 0; i < Math.ceil(seconds / DT); i++) updateEnemies(world, player, DT, { events, rng });

  assert.ok(enemy.x < 400 && enemy.y < 400, 'should have fled away from the player (up/left of its start)');
  assert.equal(spawnedCount, CONFIG.FLEEING_SPAWNER_MAX_MINIONS, 'should stop spawning once it hits the cap, not spawn forever');
});

test('hideAndPopShooter: invulnerable while hidden, vulnerable and shooting while popped', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 600, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, behavior: 'hideAndPopShooter', fireCooldownSeconds: 0.1 }, { x: 400, y: 400 });
  assert.ok(isEnemyDamageBlocked(world, enemy), 'starts hidden/invulnerable');

  const events = createEventBus();
  let shots = 0;
  events.on('enemy:shoot', () => shots++);
  // Land in the middle of the "popped" window, not right at the hidden->popped->hidden cycle boundary.
  for (let i = 0; i < Math.ceil((CONFIG.HIDE_SECONDS + CONFIG.POP_SECONDS / 2) / DT); i++) updateEnemies(world, player, DT, { events });

  assert.equal(enemy.popPhase, 'popped');
  assert.ok(!isEnemyDamageBlocked(world, enemy), 'should be vulnerable once popped');
  assert.ok(shots > 0, 'should have fired at least one shot while popped');
});

test('burrower: invulnerable and fast while burrowed, vulnerable and still once surfaced', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 1000, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 50, behavior: 'burrower' }, { x: 400, y: 400 });
  updateEnemies(world, player, DT, {});
  assert.ok(isEnemyDamageBlocked(world, enemy));
  assert.ok(enemy.vx > 0, 'burrowed phase should move fast toward the player');

  for (let i = 0; i < Math.ceil(CONFIG.BURROW_SECONDS / DT) + 2; i++) updateEnemies(world, player, DT, {});
  assert.equal(enemy.burrowPhase, 'surfaced');
  assert.ok(!isEnemyDamageBlocked(world, enemy));
  assert.equal(enemy.vx, 0, 'surfaced phase should be stationary');
});

test('frontArmoredKnight: takes only a fraction of damage from a tear fired from the side it faces', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 500, y: 400, stats: new Stats({ damageUps: 20 }) });
  const enemy = spawnEnemy(world, { id: 'a', hp: 100, speed: 50, behavior: 'frontArmoredKnight' }, { x: 400, y: 400 });
  updateEnemies(world, player, DT, {}); // sets enemy.facing toward the player
  assert.deepEqual(enemy.facing, { x: 1, y: 0 });

  // facing = (1,0): the knight's front is its +x side (toward the player). A shot fired from that
  // side travels leftward (-x) into it — "incoming from" the front.
  const frontTear = spawnTear(world, { x: enemy.x + 5, y: enemy.y, dir: { x: -1, y: 0 }, stats: player.stats });
  const events = createEventBus();
  resolveCombat(world, { player, playerHealth: new Health({ redMax: 6 }), events });
  const hpAfterFront = enemy.hp;
  assert.ok(hpAfterFront > 100 - 5, 'a front hit should be heavily reduced by armor');

  // A shot from the opposite (-x) side travels rightward (+x) into it — "incoming from" behind — full damage.
  const backTear = spawnTear(world, { x: enemy.x - 5, y: enemy.y, dir: { x: 1, y: 0 }, stats: player.stats });
  resolveCombat(world, { player, playerHealth: new Health({ redMax: 6 }), events });
  assert.ok(hpAfterFront - enemy.hp > 5, 'a back hit should deal much more damage than a front hit');
});

test('fourDirectionBouncer: moves along one cardinal axis and reverses on hitting a wall', () => {
  const world = freshWorld();
  world.tileGrid.setSolid(11, 10, true);
  const center = world.tileGrid.tileCenter(10, 10);
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, behavior: 'fourDirectionBouncer' }, { x: center.x, y: center.y, rng: new Rng(7) });
  assert.ok((enemy.aiDir.x === 0) !== (enemy.aiDir.y === 0), 'direction should be purely cardinal');

  const initialDirX = enemy.aiDir.x;
  for (let i = 0; i < 300; i++) updateEnemies(world, player, DT, {});
  if (initialDirX !== 0) assert.ok(enemy.aiDir.x === initialDirX || enemy.aiDir.x === -initialDirX);
});

test('wallPhasingGhost: flies straight through a wall tile toward the player', () => {
  const world = freshWorld();
  world.tileGrid.setSolid(10, 10, true);
  const center = world.tileGrid.tileCenter(10, 10);
  const player = createPlayer(world, { x: center.x + 200, y: center.y, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 60, behavior: 'wallPhasingGhost' }, { x: center.x, y: center.y });
  assert.ok(enemy.flies);
  for (let i = 0; i < 30; i++) updateEnemies(world, player, DT, {});
  assert.ok(enemy.x > center.x, 'should have moved through the solid tile toward the player');
});

test('orbiter: sweeps a fixed-radius circle around its own spawn point (not the player, which it could never catch up to)', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 2000, y: 2000, stats: new Stats() }); // far away and irrelevant to its path
  const anchor = { x: 1000, y: 1000 };
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 90, behavior: 'orbiter' }, { x: anchor.x, y: anchor.y });
  for (let i = 0; i < 120; i++) updateEnemies(world, player, DT, {});
  const dist = Math.hypot(enemy.x - anchor.x, enemy.y - anchor.y);
  assert.ok(Math.abs(dist - CONFIG.ORBITER_RADIUS) < 1, `expected ~${CONFIG.ORBITER_RADIUS}px from its anchor, got ${dist}`);
});

test('mirrorOfPlayer: moves with the player\'s current velocity but also slowly homes in (never permanently uncatchable)', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, { id: 'a', hp: 5, speed: 180, behavior: 'mirrorOfPlayer' }, { x: 800, y: 400 });
  player.vx = 50;
  player.vy = 0;
  const initialDist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  for (let i = 0; i < 600; i++) updateEnemies(world, player, DT, {}); // 10 seconds
  const laterDist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  assert.ok(laterDist < initialDist, 'distance should shrink over time, not stay frozen forever');
});

test('exploder: deals AoE damage to the player on death if in range', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 420, y: 400, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  const enemy = spawnEnemy(world, { id: 'a', hp: 1, behaviors: ['exploder'] }, { x: 400, y: 400 });
  const events = createEventBus();
  killEnemy(world, enemy, { player, playerHealth, events });
  assert.ok(playerHealth.red < playerHealth.redMax, 'player should have taken explosion damage');
});

test('splitter: spawns two smaller children at half HP, keeping the other behaviors but not re-splitting', () => {
  const world = freshWorld();
  const enemy = spawnEnemy(world, { id: 'a', hp: 10, speed: 70, radius: 20, behaviors: ['chase', 'splitter'] }, { x: 400, y: 400 });
  const before = world.entities.byType('enemy').filter((e) => e.alive).length;
  killEnemy(world, enemy, {});
  const children = world.entities.byType('enemy').filter((e) => e.alive);
  assert.equal(children.length, before - 1 + CONFIG.SPLITTER_CHILD_COUNT);
  for (const child of children) {
    assert.equal(child.maxHp, Math.max(1, Math.round(10 * CONFIG.SPLITTER_HP_FRACTION)));
    assert.ok(child.behaviors.includes('chase'));
    assert.ok(!child.behaviors.includes('splitter'), 'children should not themselves split again');
  }
});
