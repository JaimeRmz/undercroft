/**
 * P1.G6: every boss attack and dangerous enemy attack (dash charger, turret,
 * hop leap) must show a visible wind-up, not just mechanically delay.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawEnemyTelegraph, drawBossTelegraph } from '../src/render/telegraphs.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';
import { CONFIG } from '../src/core/config.js';
import { bossPatternRegistry } from '../src/systems/ai/bossPatterns.js';

function calls(fn) {
  const ctx = createMockCtx(64, 64);
  fn(ctx);
  return ctx.calls;
}

test('a dashCharger winding up draws a warning ring plus a line preview along its locked dash direction', () => {
  const enemy = { radius: 14, windingUp: true, windUpTimer: CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS, dashDir: { x: 1, y: 0 } };
  const c = calls((ctx) => drawEnemyTelegraph(ctx, enemy, { x: 100, y: 100 }, 1));
  assert.ok(c.some((call) => call.kind === 'arc'), 'expected a warning ring (arc)');
  assert.ok(c.some((call) => call.kind === 'stroke'), 'expected the line preview to be stroked');
});

test('an enemy not currently winding up/firing-soon/hopping-soon draws nothing', () => {
  const enemy = { radius: 14, windingUp: false, fireCooldownSeconds: 1.2, fireCooldown: 1.0, hopPhase: 'leaping' };
  const c = calls((ctx) => drawEnemyTelegraph(ctx, enemy, { x: 100, y: 100 }, 1));
  assert.equal(c.length, 0);
});

test('a turret within the telegraph window of its fire cooldown draws a warning ring', () => {
  const enemy = { radius: 14, fireCooldownSeconds: 1.2, fireCooldown: 0.1 };
  const c = calls((ctx) => drawEnemyTelegraph(ctx, enemy, { x: 100, y: 100 }, 1));
  assert.ok(c.some((call) => call.kind === 'arc'));
});

test('a turret outside the telegraph window (fireCooldown still high) draws nothing', () => {
  const enemy = { radius: 14, fireCooldownSeconds: 1.2, fireCooldown: 1.0 };
  const c = calls((ctx) => drawEnemyTelegraph(ctx, enemy, { x: 100, y: 100 }, 1));
  assert.equal(c.length, 0);
});

test('a hopper about to leap (idle phase, near the end of its timer) draws a warning ring', () => {
  const enemy = { radius: 13, hopPhase: 'idle', aiTimer: 0.1 };
  const c = calls((ctx) => drawEnemyTelegraph(ctx, enemy, { x: 100, y: 100 }, 1));
  assert.ok(c.some((call) => call.kind === 'arc'));
});

test('every registered boss pattern telegraphs at least 0.4 seconds (CLAUDE.md P1.G6)', () => {
  for (const [id, pattern] of bossPatternRegistry) {
    assert.ok(pattern.telegraphSeconds >= 0.4, `${id} telegraphs only ${pattern.telegraphSeconds}s`);
  }
});

test('a boss not in telegraph state draws nothing', () => {
  const boss = { radius: 28, patternState: 'cooldown', currentPatternId: 'ring' };
  const c = calls((ctx) => drawBossTelegraph(ctx, boss, { x: 0, y: 0 }, { x: 100, y: 100 }, 1));
  assert.equal(c.length, 0);
});

test('a boss telegraphing "charge" draws a ring plus a line preview straight at the player', () => {
  const boss = { x: 0, y: 0, radius: 28, patternState: 'telegraph', currentPatternId: 'charge', patternTimer: 0.5 };
  const player = { x: 100, y: 0 };
  const c = calls((ctx) => drawBossTelegraph(ctx, boss, player, { x: 0, y: 0 }, 1));
  assert.ok(c.some((call) => call.kind === 'arc'));
  assert.ok(c.some((call) => call.kind === 'stroke'));
});

test('a boss telegraphing "slam" draws an area preview (a filled circle)', () => {
  const boss = { x: 0, y: 0, radius: 28, patternState: 'telegraph', currentPatternId: 'slam', patternTimer: 0.6 };
  const c = calls((ctx) => drawBossTelegraph(ctx, boss, null, { x: 0, y: 0 }, 1));
  assert.ok(c.some((call) => call.kind === 'fill'));
});

test('a boss telegraphing "telegraphedLaser" draws a full-length beam preview along the locked direction', () => {
  const boss = { x: 0, y: 0, radius: 28, patternState: 'telegraph', currentPatternId: 'telegraphedLaser', patternTimer: 0.8, _laserDir: { x: 0, y: 1 } };
  const c = calls((ctx) => drawBossTelegraph(ctx, boss, null, { x: 0, y: 0 }, 1));
  assert.ok(c.some((call) => call.kind === 'stroke'));
});
