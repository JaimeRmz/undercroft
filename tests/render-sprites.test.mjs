import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSpriteDrawOps, SPRITES } from '../src/render/sprites.js';

test('a circle spec produces a circle op with the right radius/colors', () => {
  const ops = computeSpriteDrawOps({ shape: 'circle', radius: 10, fill: '#fff', outline: '#000', outlineWidth: 2 });
  const body = ops.find((op) => op.fill === '#fff');
  assert.equal(body.op, 'circle');
  assert.equal(body.radius, 10);
});

test('a rect spec centers the rect on the local origin', () => {
  const ops = computeSpriteDrawOps({ shape: 'rect', width: 20, height: 10, fill: '#abc' });
  const body = ops.find((op) => op.fill === '#abc');
  assert.equal(body.op, 'rect');
  assert.equal(body.x, -10);
  assert.equal(body.y, -5);
});

test('a spec with a radius gets an automatic shadow op first, unless shadow: false', () => {
  const withShadow = computeSpriteDrawOps({ shape: 'circle', radius: 10, fill: '#fff' });
  assert.equal(withShadow[0].op, 'circle');
  assert.ok(withShadow[0].fill.startsWith('rgba(0, 0, 0'), 'expected a dark shadow fill first');
  const noShadow = computeSpriteDrawOps({ shape: 'circle', radius: 10, fill: '#fff', shadow: false });
  assert.ok(!noShadow[0].fill.startsWith('rgba(0, 0, 0'), 'shadow: false should skip the shadow op');
});

test('eyes are appended as additional circle ops at their offsets', () => {
  const ops = computeSpriteDrawOps({
    shape: 'circle',
    radius: 10,
    eyes: [{ dx: -2, dy: -2, r: 1 }, { dx: 2, dy: -2, r: 1 }],
  });
  const eyes = ops.filter((op) => op.radius === 1);
  assert.equal(eyes.length, 2);
  assert.equal(eyes[0].x, -2);
  assert.equal(eyes[1].x, 2);
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
  const eye = (ops) => ops.find((op) => op.radius === 1);
  const facingUp = computeSpriteDrawOps(spec, { headAngle: -Math.PI / 2 });
  const eyeUp = eye(facingUp);
  assert.ok(Math.abs(eyeUp.x - 0) < 1e-9 && Math.abs(eyeUp.y - -5) < 1e-9, 'no rotation when aiming the baked default direction');

  const facingRight = computeSpriteDrawOps(spec, { headAngle: 0 });
  const eyeRight = eye(facingRight);
  assert.ok(Math.abs(eyeRight.x - 5) < 1e-9 && Math.abs(eyeRight.y - 0) < 1e-9, 'rotated a quarter turn to face right');
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
  assert.ok(!ops.some((op) => op.radius === 3), 'no belly op should be present');
});

test('spec.accessories are appended to the draw-ops list', () => {
  const accessory = { op: 'circle', x: 5, y: 5, radius: 2, fill: '#0f0' };
  const ops = computeSpriteDrawOps({ shape: 'circle', radius: 10, fill: '#fff', accessories: [accessory] });
  assert.ok(ops.includes(accessory));
});
