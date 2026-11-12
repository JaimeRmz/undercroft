import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/core/config.js';
import { Rng } from '../src/core/rng.js';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import {
  applyStatus,
  hasStatus,
  tickEnemyStatus,
  applyStatusMovementOverride,
} from '../src/systems/statusEffects.js';

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('applyStatus sets a timed status; tickEnemyStatus expires it after its duration', () => {
  const enemy = { id: 'e' };
  applyStatus(enemy, 'slow');
  assert.ok(hasStatus(enemy, 'slow'));

  const dt = CONFIG.SLOW_DURATION_SECONDS + 0.1;
  tickEnemyStatus(enemy, dt);
  assert.ok(!hasStatus(enemy, 'slow'));
});

test('poison/burn tick DOT damage once per second and report it back to the caller', () => {
  const enemy = { id: 'e' };
  applyStatus(enemy, 'poison');

  let total = 0;
  for (let i = 0; i < 60; i++) total += tickEnemyStatus(enemy, 1 / 60).dotDamage;
  assert.ok(Math.abs(total - CONFIG.POISON_DPS) < 1e-9, 'one full second should report exactly one DPS tick');
});

test('tickEnemyStatus reports frozen while the freeze status is active', () => {
  const enemy = { id: 'e' };
  applyStatus(enemy, 'freeze');
  assert.ok(tickEnemyStatus(enemy, 0.1).frozen);
  tickEnemyStatus(enemy, CONFIG.FREEZE_DURATION_SECONDS);
  assert.ok(!tickEnemyStatus(enemy, 0.01).frozen);
});

test('a boss becomes status-immune for ~8s immediately after being afflicted', () => {
  const boss = { id: 'b', isBoss: true };
  assert.ok(applyStatus(boss, 'poison'));
  assert.ok(!applyStatus(boss, 'burn'), 'a second status should be blocked during the immunity window');
  assert.ok(hasStatus(boss, 'poison'), 'the status that was already applied keeps running');

  tickEnemyStatus(boss, CONFIG.BOSS_STATUS_IMMUNITY_SECONDS + 0.1);
  assert.ok(applyStatus(boss, 'burn'), 'immunity should have worn off');
});

test('applyStatus refreshes an already-active status\'s duration', () => {
  const enemy = { id: 'e' };
  applyStatus(enemy, 'slow');
  tickEnemyStatus(enemy, CONFIG.SLOW_DURATION_SECONDS - 0.5);
  applyStatus(enemy, 'slow');
  tickEnemyStatus(enemy, 0.6); // would have expired without the refresh
  assert.ok(hasStatus(enemy, 'slow'));
});

test('applyStatusMovementOverride: confuse replaces vx/vy with a random heading at enemy.speed', () => {
  const enemy = { x: 0, y: 0, speed: 100, vx: 1, vy: 1, status: {} };
  applyStatus(enemy, 'confuse');
  applyStatusMovementOverride(freshWorld(), enemy, null, 0, new Rng('confuse'));
  const speed = Math.hypot(enemy.vx, enemy.vy);
  assert.ok(Math.abs(speed - 100) < 1e-6);
});

test('applyStatusMovementOverride: fear moves the enemy directly away from the player', () => {
  const enemy = { x: 100, y: 0, speed: 50, vx: 0, vy: 0, status: {} };
  const player = { x: 0, y: 0 };
  applyStatus(enemy, 'fear');
  applyStatusMovementOverride(freshWorld(), enemy, player, 0, null);
  assert.ok(enemy.vx > 0, 'should flee in the +x direction, away from the player at x=0');
  assert.ok(Math.abs(enemy.vy) < 1e-9);
});

test('applyStatusMovementOverride: charm chases the nearest other enemy, or idles if alone', () => {
  const world = freshWorld();
  const charmed = spawnEnemy(world, { id: 'a', hp: 10, speed: 50, behavior: 'chase' }, { x: 0, y: 0 });
  applyStatus(charmed, 'charm');

  applyStatusMovementOverride(world, charmed, null, 0, null);
  assert.equal(charmed.vx, 0);
  assert.equal(charmed.vy, 0);

  const target = spawnEnemy(world, { id: 'b', hp: 10, behavior: 'chase' }, { x: 100, y: 0 });
  applyStatusMovementOverride(world, charmed, null, 0, null);
  assert.ok(charmed.vx > 0, 'should move toward the other enemy at +x');
});

test('applyStatusMovementOverride: slow scales down whatever velocity the AI (or another override) produced', () => {
  const enemy = { x: 0, y: 0, speed: 100, vx: 100, vy: 0, status: {} };
  applyStatus(enemy, 'slow');
  applyStatusMovementOverride(freshWorld(), enemy, null, 0, null);
  assert.ok(Math.abs(enemy.vx - 100 * CONFIG.SLOW_SPEED_MULT) < 1e-9);
});
