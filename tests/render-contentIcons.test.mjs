/**
 * Every item/trinket/card/pill must render as a visually distinct icon
 * (P1.G3: "test that no two items render identically"). Exercises
 * resolve*Icon + drawIcon directly against the real mods/core content.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemIcon, resolveTrinketIcon, resolveCardIcon, resolvePillIcon, drawIcon } from '../src/render/contentIcons.js';
import { PILL_COLORS } from '../src/systems/pills.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';
import { loadRealRegistries } from './helpers/realContent.mjs';

/** A string fingerprint of everything drawn: shape kind + fill/stroke colors, in order. */
function fingerprint(resolveFn, input) {
  const ctx = createMockCtx(64, 64);
  drawIcon(ctx, resolveFn(input), 32, 32, 9);
  return ctx.calls.map((c) => `${c.kind}:${c.fillStyle ?? ''}:${c.strokeStyle ?? ''}`).join('|');
}

function assertAllUnique(fingerprints, labelFor) {
  const seen = new Map();
  for (let i = 0; i < fingerprints.length; i++) {
    const fp = fingerprints[i];
    if (seen.has(fp)) {
      assert.fail(`${labelFor(i)} renders identically to ${labelFor(seen.get(fp))}`);
    }
    seen.set(fp, i);
  }
}

test('every registered item renders a unique icon', async () => {
  const { registries } = await loadRealRegistries();
  const defs = registries.of('item').all();
  assert.ok(defs.length >= 30, 'expected the full item roster to be loaded');
  const fps = defs.map((def) => fingerprint(resolveItemIcon, def));
  assertAllUnique(fps, (i) => defs[i].id);
});

test('every registered trinket renders a unique icon', async () => {
  const { registries } = await loadRealRegistries();
  const defs = registries.of('trinket').all();
  assert.ok(defs.length >= 15);
  const fps = defs.map((def) => fingerprint(resolveTrinketIcon, def));
  assertAllUnique(fps, (i) => defs[i].id);
});

test('every registered card renders a unique icon', async () => {
  const { registries } = await loadRealRegistries();
  const defs = registries.of('card').all();
  assert.ok(defs.length >= 15);
  const fps = defs.map((def) => fingerprint(resolveCardIcon, def));
  assertAllUnique(fps, (i) => defs[i].id);
});

test('every pill color renders a unique icon (identity is color-only, never the hidden effect)', () => {
  const fps = PILL_COLORS.map((color) => fingerprint(resolvePillIcon, color));
  assertAllUnique(fps, (i) => PILL_COLORS[i]);
});

test('an active item gets a square icon, a passive item gets a circle', () => {
  assert.equal(resolveItemIcon({ id: 'core:x', type: 'active' }).shape, 'square');
  assert.equal(resolveItemIcon({ id: 'core:y', type: 'passive' }).shape, 'circle');
});

test('item/trinket quality adds one pip per quality level, drawn as extra arcs', () => {
  const ctx0 = createMockCtx(64, 64);
  drawIcon(ctx0, resolveItemIcon({ id: 'core:q0', type: 'passive', quality: 0 }), 32, 32, 9);
  const ctx3 = createMockCtx(64, 64);
  drawIcon(ctx3, resolveItemIcon({ id: 'core:q0', type: 'passive', quality: 3 }), 32, 32, 9);
  assert.equal(ctx3.calls.filter((c) => c.kind === 'arc').length - ctx0.calls.filter((c) => c.kind === 'arc').length, 3);
});

test('resolvePillIcon never leaks the hidden effect id into the icon spec', () => {
  const icon = resolvePillIcon('red');
  assert.deepEqual(Object.keys(icon).sort(), ['colorName', 'shape']);
});
