/**
 * P1.G4: tile rendering must actually read as distinct per type (not flat,
 * identical rectangles) and doors must visually reflect lock state / destination.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFloorTile, drawWallTile, drawRockTile, drawMoundTile, drawTintedRockTile, drawPitTile, drawDoorTile } from '../src/render/tiles.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';

function callCount(fn) {
  const ctx = createMockCtx(64, 64);
  fn(ctx);
  return ctx.calls.length;
}

test('every tile drawer produces more than a single flat fillRect (adds texture/shading)', () => {
  assert.ok(callCount((ctx) => drawFloorTile(ctx, 0, 0, 40, '#2b2b33', 3, 4)) > 1);
  assert.ok(callCount((ctx) => drawWallTile(ctx, 0, 0, 40, '#232330')) > 1);
  assert.ok(callCount((ctx) => drawRockTile(ctx, 0, 0, 40, '#5a5248', 3, 4)) > 1);
  assert.ok(callCount((ctx) => drawMoundTile(ctx, 0, 0, 40, '#5a5248', 1)) > 1);
  assert.ok(callCount((ctx) => drawTintedRockTile(ctx, 0, 0, 40, '#5a5248')) > 1);
  assert.ok(callCount((ctx) => drawPitTile(ctx, 0, 0, 40, '#0a0a0c')) > 1);
});

test('a damaged mound draws its crack, a full-hp one does not (P2.Q Q3a)', () => {
  const full = callCount((ctx) => drawMoundTile(ctx, 0, 0, 40, '#5a5248', 1));
  const chipped = callCount((ctx) => drawMoundTile(ctx, 0, 0, 40, '#5a5248', 0.1));
  assert.ok(chipped > full, 'a chipped mound draws extra crack strokes');
});

test('rock tiles have two stable shaded variants by tile position ("blocks distinct from rocks")', () => {
  const a = (() => {
    const ctx = createMockCtx(64, 64);
    drawRockTile(ctx, 0, 0, 40, '#5a5248', 0, 0);
    return ctx.calls.map((c) => c.kind).join(',');
  })();
  const b = (() => {
    const ctx = createMockCtx(64, 64);
    drawRockTile(ctx, 0, 0, 40, '#5a5248', 1, 0);
    return ctx.calls.map((c) => c.kind).join(',');
  })();
  // Not asserting which is which (hash-derived), just that position actually changes the draw pattern.
  assert.notEqual(a, b);
});

test('drawRockTile is deterministic: same tile position always draws the same pattern', () => {
  const run = () => {
    const ctx = createMockCtx(64, 64);
    drawRockTile(ctx, 0, 0, 40, '#5a5248', 5, 2);
    return ctx.calls.map((c) => `${c.kind}:${c.fillStyle ?? ''}`).join('|');
  };
  assert.equal(run(), run());
});

test('a door with no special state draws the plain default color, no grate/keyhole extras', () => {
  const ctx = createMockCtx(64, 64);
  drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: false, keyLocked: false, leadsToType: 'normal' });
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].fillStyle, '#443322');
});

test('an enemy-locked door renders a distinct sealed color plus a grate, not the default door color', () => {
  const ctx = createMockCtx(64, 64);
  drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: true, keyLocked: false });
  assert.notEqual(ctx.calls[0].fillStyle, '#443322');
  assert.ok(ctx.calls.length > 1, 'expected a grate/bar overlay beyond the base fill');
});

test('a key-locked door renders a distinct gold color plus a keyhole, not the default door color', () => {
  const ctx = createMockCtx(64, 64);
  drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: false, keyLocked: true });
  assert.notEqual(ctx.calls[0].fillStyle, '#443322');
  assert.ok(ctx.calls.length > 1, 'expected a keyhole overlay beyond the base fill');
});

test('doors leading to treasure, shop, boss, and every P2.6 special room type each get their own distinct tint', () => {
  const colorFor = (leadsToType) => {
    const ctx = createMockCtx(64, 64);
    drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: false, keyLocked: false, leadsToType });
    return ctx.calls[0].fillStyle;
  };
  const types = ['treasure', 'shop', 'boss', 'normal', 'challenge', 'curse', 'sacrifice', 'arcade', 'devil', 'angel'];
  const colors = types.map(colorFor);
  assert.equal(new Set(colors).size, types.length, `expected ${types.length} distinct colors, got ${JSON.stringify(colors)}`);
});

test('an enemy-locked door that also leads to a boss room still reads as locked (lock state takes priority over destination tint)', () => {
  const ctx = createMockCtx(64, 64);
  drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: true, keyLocked: false, leadsToType: 'boss' });
  const boss = (() => {
    const c2 = createMockCtx(64, 64);
    drawDoorTile(c2, 0, 0, 40, '#443322', { locked: false, keyLocked: false, leadsToType: 'boss' });
    return c2.calls[0].fillStyle;
  })();
  assert.notEqual(ctx.calls[0].fillStyle, boss);
});

test('P1.G7: a non-null pulse draws an extra flash ring beyond the normal door fill/overlay', () => {
  const withoutPulse = callCount((ctx) => drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: false, keyLocked: false }, null));
  const withPulse = callCount((ctx) => drawDoorTile(ctx, 0, 0, 40, '#443322', { locked: false, keyLocked: false }, 0.2));
  assert.equal(withPulse, withoutPulse + 2); // beginPath+stroke is recorded as a stroke call plus the arc path call
});
