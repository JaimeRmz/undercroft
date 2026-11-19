/**
 * P2.Q Q1a: tears render as glossy droplets whose size scales with damage, with
 * a floor shadow whose offset from the droplet reads as the shot's arc height.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tearRadius, computeTearDrawOps, drawTear } from '../src/render/tears.js';
import { CONFIG } from '../src/core/config.js';
import { Camera } from '../src/render/camera.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';

test('tearRadius scales with damage but stays clamped', () => {
  const base = tearRadius({ damage: 3.5 });
  assert.equal(base, CONFIG.TEAR_RADIUS, 'base damage → base radius');
  assert.ok(tearRadius({ damage: 14 }) > base, 'more damage → bigger tear');
  assert.ok(tearRadius({ damage: 0.1 }) < base, 'tiny damage → smaller tear');
  // Clamps both ends.
  assert.ok(tearRadius({ damage: 1000 }) <= CONFIG.TEAR_RADIUS * 1.9 + 1e-9, 'upper clamp');
  assert.ok(tearRadius({ damage: 0 }) >= CONFIG.TEAR_RADIUS * 0.7 - 1e-9, 'lower clamp');
  // Missing damage falls back to base.
  assert.equal(tearRadius({}), CONFIG.TEAR_RADIUS);
});

test('a glossy droplet has an offset highlight circle', () => {
  const ops = computeTearDrawOps(6, 'player');
  const body = ops.find((o) => o.radius === 6);
  assert.ok(body && body.outline, 'body circle has an outline');
  // The highlight is a smaller circle offset up-and-left of center.
  const highlight = ops.find((o) => o.x < 0 && o.y < 0 && o.radius < 6);
  assert.ok(highlight, 'droplet has a top-left glossy highlight');
});

test('enemy tears get a glow ring and a bright core; player tears do not', () => {
  const enemy = computeTearDrawOps(6, 'enemy');
  const player = computeTearDrawOps(6, 'player');
  assert.ok(enemy.some((o) => o.radius > 6), 'enemy tear has a glow ring larger than the body');
  assert.ok(enemy.length > player.length, 'enemy tear draws more (glow + core) than a player tear');
});

test('drawTear draws both a ground shadow and the lifted droplet', () => {
  const camera = new Camera({ viewportWidth: 640, viewportHeight: 360 });
  camera.centerOn(100, 100);
  const low = createMockCtx(640, 360);
  const high = createMockCtx(640, 360);
  // Same tear, once at ground level and once mid-arc: the droplet's screen Y must rise.
  const tearLow = { x: 100, y: 100, height: 0, damage: 3.5, team: 'player' };
  const tearHigh = { x: 100, y: 100, height: CONFIG.TEAR_ARC_HEIGHT, damage: 3.5, team: 'player' };
  drawTear(low, tearLow, camera);
  drawTear(high, tearHigh, camera);
  assert.ok(low.calls.filter((c) => c.kind === 'arc').length >= 2, 'shadow + droplet both drawn');
  // Both draw a shadow at the same ground Y; the droplet is the arc that differs.
  const dropletYs = (ctx) => ctx.calls.filter((c) => c.kind === 'arc').map((c) => c.y);
  const minLow = Math.min(...dropletYs(low));
  const minHigh = Math.min(...dropletYs(high));
  assert.ok(minHigh < minLow, 'a higher-arcing tear draws its droplet further up the screen');
});
