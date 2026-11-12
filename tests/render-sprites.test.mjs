import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSpriteDrawOps, SPRITES } from '../src/render/sprites.js';

test('a circle spec produces a circle op with the right radius/colors', () => {
  const ops = computeSpriteDrawOps({ shape: 'circle', radius: 10, fill: '#fff', outline: '#000', outlineWidth: 2 });
  assert.equal(ops[0].op, 'circle');
  assert.equal(ops[0].radius, 10);
  assert.equal(ops[0].fill, '#fff');
});

test('a rect spec centers the rect on the local origin', () => {
  const ops = computeSpriteDrawOps({ shape: 'rect', width: 20, height: 10, fill: '#abc' });
  assert.equal(ops[0].op, 'rect');
  assert.equal(ops[0].x, -10);
  assert.equal(ops[0].y, -5);
});

test('eyes are appended as additional circle ops at their offsets', () => {
  const ops = computeSpriteDrawOps({
    shape: 'circle',
    radius: 10,
    eyes: [{ dx: -2, dy: -2, r: 1 }, { dx: 2, dy: -2, r: 1 }],
  });
  assert.equal(ops.length, 3);
  assert.equal(ops[1].x, -2);
  assert.equal(ops[2].x, 2);
});

test('every built-in sprite spec resolves to at least one draw op', () => {
  for (const [id, spec] of Object.entries(SPRITES)) {
    const ops = computeSpriteDrawOps(spec);
    assert.ok(ops.length > 0, `expected ${id} to produce draw ops`);
  }
});
