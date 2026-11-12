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

test('headAngle rotates the eyes away from the spec\'s baked eyeDefaultAngle (CLAUDE.md §3 head-turns-to-aim)', () => {
  const spec = {
    shape: 'circle',
    radius: 10,
    eyeDefaultAngle: -Math.PI / 2, // baked eyes assume "facing up"
    eyes: [{ dx: 0, dy: -5, r: 1 }],
  };
  const facingUp = computeSpriteDrawOps(spec, { headAngle: -Math.PI / 2 });
  assert.ok(Math.abs(facingUp[1].x - 0) < 1e-9 && Math.abs(facingUp[1].y - -5) < 1e-9, 'no rotation when aiming the baked default direction');

  const facingRight = computeSpriteDrawOps(spec, { headAngle: 0 });
  assert.ok(Math.abs(facingRight[1].x - 5) < 1e-9 && Math.abs(facingRight[1].y - 0) < 1e-9, 'rotated a quarter turn to face right');
});

test('bodyAngle places the belly patch toward the current movement direction', () => {
  const spec = { shape: 'circle', radius: 10, belly: { distanceFraction: 0.5, radius: 3, fill: '#fff' } };
  const ops = computeSpriteDrawOps(spec, { bodyAngle: 0 });
  const belly = ops.find((op) => op.radius === 3);
  assert.ok(belly, 'expected a belly draw op');
  assert.ok(Math.abs(belly.x - 5) < 1e-9 && Math.abs(belly.y - 0) < 1e-9);
});

test('no belly op is added when bodyAngle is not supplied (backward compatible with enemies that have no belly)', () => {
  const spec = { shape: 'circle', radius: 10, belly: { distanceFraction: 0.5, radius: 3, fill: '#fff' } };
  const ops = computeSpriteDrawOps(spec);
  assert.equal(ops.length, 1);
});
