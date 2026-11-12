import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { getBossPattern } from '../src/systems/ai/bossPatterns.js';
import { spawnBoss } from '../src/systems/bosses.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;
const BASE_DEF = { id: 'test:boss', name: 'Test Boss', hp: 50, radius: 20, phases: [{ hpThreshold: 1.0, patterns: [] }] };

function freshWorld() {
  return new World({ widthTiles: 60, heightTiles: 60, tileSize: 40 });
}

function setup(x = 100, y = 100, playerX = 300, playerY = 100) {
  const world = freshWorld();
  const player = createPlayer(world, { x: playerX, y: playerY, stats: new Stats() });
  const boss = spawnBoss(world, BASE_DEF, { x, y });
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  return { world, player, boss, playerHealth, events };
}

function enemyTears(world) {
  return world.entities.byType('projectile').filter((p) => p.team === 'enemy');
}

test('aimedBurst: fires a fixed number of aimed shots spaced over its duration', () => {
  const { world, player, boss } = setup();
  const pattern = getBossPattern('aimedBurst');
  pattern.onStart(world, boss, player);
  for (let i = 0; i < Math.ceil(pattern.durationSeconds / DT) + 2; i++) pattern.onTick(world, boss, player, DT);
  assert.equal(enemyTears(world).length, CONFIG.BOSS_AIMED_BURST_SHOTS);
});

test('ring: fires BOSS_RING_SHOT_COUNT shots evenly spaced in a full circle', () => {
  const { world, player, boss } = setup();
  getBossPattern('ring').onStart(world, boss, player);
  const tears = enemyTears(world);
  assert.equal(tears.length, CONFIG.BOSS_RING_SHOT_COUNT);
  const angles = tears.map((t) => Math.atan2(t.vy, t.vx)).sort((a, b) => a - b);
  for (let i = 1; i < angles.length; i++) {
    assert.ok(Math.abs(angles[i] - angles[i - 1] - (2 * Math.PI) / CONFIG.BOSS_RING_SHOT_COUNT) < 1e-6);
  }
});

test('spread: fires a fan of shots centered on the direction toward the player', () => {
  const { world, player, boss } = setup();
  getBossPattern('spread').onStart(world, boss, player);
  const tears = enemyTears(world);
  assert.equal(tears.length, CONFIG.BOSS_SPREAD_SHOT_COUNT);
  const middle = tears[Math.floor(tears.length / 2)];
  assert.ok(Math.abs(middle.vy) < 1e-6, 'middle shot should point straight at the player (same y)');
});

test('spiral: fires one shot per interval, rotating the angle each time', () => {
  const { world, player, boss } = setup();
  const pattern = getBossPattern('spiral');
  pattern.onStart(world, boss, player);
  for (let i = 0; i < Math.ceil(pattern.durationSeconds / DT); i++) pattern.onTick(world, boss, player, DT);
  const tears = enemyTears(world);
  assert.ok(tears.length >= 2);
  const angle0 = Math.atan2(tears[0].vy, tears[0].vx);
  const angle1 = Math.atan2(tears[1].vy, tears[1].vx);
  assert.ok(Math.abs(angle1 - angle0) > 0.01, 'successive shots should rotate');
});

test('charge: accelerates toward the player and stops early (done: true) on hitting a wall', () => {
  const { world, player, boss } = setup();
  world.tileGrid.setSolid(5, 10, true);
  const wallCenter = world.tileGrid.tileCenter(5, 10);
  boss.x = wallCenter.x - 40;
  boss.y = wallCenter.y;
  player.x = wallCenter.x + 400;
  player.y = wallCenter.y;

  const pattern = getBossPattern('charge');
  pattern.onStart(world, boss, player);
  assert.ok(Math.hypot(boss.vx, boss.vy) > 0, 'should have a charge velocity toward the player');

  let result;
  for (let i = 0; i < 300; i++) {
    result = pattern.onTick(world, boss, player, DT);
    if (result?.done) break;
  }
  assert.ok(result?.done, 'should signal done once it hits the wall');
  assert.equal(boss.vx, 0);
});

test('slam: damages the player if within BOSS_SLAM_RADIUS, not if farther away', () => {
  const { world, player, boss, playerHealth, events } = setup(100, 100, 100 + CONFIG.BOSS_SLAM_RADIUS - 10, 100);
  getBossPattern('slam').onStart(world, boss, player, { playerHealth, events });
  assert.ok(playerHealth.red < playerHealth.redMax);

  const far = setup(100, 100, 100 + CONFIG.BOSS_SLAM_RADIUS + 200, 100);
  getBossPattern('slam').onStart(far.world, far.boss, far.player, { playerHealth: far.playerHealth, events: far.events });
  assert.equal(far.playerHealth.red, far.playerHealth.redMax);
});

test('summonMinions: spawns BOSS_SUMMON_COUNT new enemies near the boss', () => {
  const { world, player, boss } = setup();
  const before = world.entities.byType('enemy').length;
  getBossPattern('summonMinions').onStart(world, boss, player, { rng: new Rng('summon') });
  assert.equal(world.entities.byType('enemy').length, before + CONFIG.BOSS_SUMMON_COUNT);
});

test('teleport: moves the boss to a new position within the room bounds', () => {
  const { world, player, boss } = setup();
  const before = { x: boss.x, y: boss.y };
  getBossPattern('teleport').onStart(world, boss, player, { rng: new Rng('tp') });
  assert.ok(boss.x !== before.x || boss.y !== before.y);
  assert.ok(boss.x >= 0 && boss.x <= world.tileGrid.width * world.tileGrid.tileSize);
});

test('telegraphedLaser: locks the beam direction at telegraph start, then damages the player only if still on that line', () => {
  const { world, player, boss, playerHealth, events } = setup(100, 100, 100 + 300, 100);
  const pattern = getBossPattern('telegraphedLaser');
  pattern.onTelegraphStart(world, boss, player);
  assert.deepEqual(boss._laserDir, { x: 1, y: 0 });

  pattern.onStart(world, boss, player, { playerHealth, events });
  assert.ok(playerHealth.red < playerHealth.redMax, 'player is on the locked line, should be hit');
});

test('telegraphedLaser: a player who dodged off the locked line after the telegraph takes no damage', () => {
  const { world, player, boss, playerHealth, events } = setup(100, 100, 400, 100);
  const pattern = getBossPattern('telegraphedLaser');
  pattern.onTelegraphStart(world, boss, player);
  player.y += 200; // dodge perpendicular to the locked beam direction
  pattern.onStart(world, boss, player, { playerHealth, events });
  assert.equal(playerHealth.red, playerHealth.redMax);
});

test('projectileRain: spawns shots at intervals over its duration, aimed at wherever the player is at that moment', () => {
  const { world, player, boss } = setup();
  const pattern = getBossPattern('projectileRain');
  pattern.onStart(world, boss, player);
  const rng = new Rng('rain');
  for (let i = 0; i < Math.ceil(pattern.durationSeconds / DT); i++) pattern.onTick(world, boss, player, DT, { rng });
  assert.ok(enemyTears(world).length >= Math.floor(CONFIG.BOSS_RAIN_DURATION_SECONDS / CONFIG.BOSS_RAIN_INTERVAL_SECONDS));
});
