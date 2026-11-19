/**
 * P2.Q Q3c: decorative floor props are cosmetic, deterministic, and only
 * appear on plain floor tiles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/systems/room.js';
import { drawFloorProps } from '../src/render/props.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';

function renderProps(room, chapter, isFloorTile) {
  const ctx = createMockCtx(640, 360);
  drawFloorProps(ctx, room, {
    isFloorTile: isFloorTile ?? ((tx, ty) => room.getTileType(tx, ty) === 'floor'),
    toScreen: (wx, wy) => ({ x: wx, y: wy }),
    size: 40,
    chapter,
  });
  return ctx;
}

test('props draw something on a plain room floor (P2.Q Q3c)', () => {
  const room = new Room();
  assert.ok(renderProps(room, 1).calls.length > 0, 'a dressed room draws at least one prop');
});

test('props are deterministic: the same room renders identically twice (P2.Q Q3c)', () => {
  const room = new Room();
  const a = renderProps(room, 1).calls.length;
  const b = renderProps(room, 1).calls.length;
  assert.equal(a, b);
});

test('props never draw on non-floor tiles (P2.Q Q3c)', () => {
  const room = new Room();
  // Claim no tile is a floor → nothing to dress.
  const ctx = renderProps(room, 1, () => false);
  assert.equal(ctx.calls.length, 0);
});

test('each chapter has its own prop style (P2.Q Q3c)', () => {
  const room = new Room();
  // Fingerprint by the set of fill/stroke colors each chapter uses.
  const fingerprint = (chapter) => {
    const colors = new Set();
    for (const c of renderProps(room, chapter).calls) {
      if (c.fillStyle) colors.add(`f:${c.fillStyle}`);
      if (c.strokeStyle) colors.add(`s:${c.strokeStyle}`);
    }
    return [...colors].sort().join('|');
  };
  const prints = [1, 2, 3, 4, 5].map(fingerprint);
  assert.equal(new Set(prints).size, 5, 'all five chapters dress the floor differently');
});
