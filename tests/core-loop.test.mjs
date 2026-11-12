import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/core/loop.js';

test('tick() calls update() exactly once per full step accumulated', () => {
  let updates = 0;
  const loop = new FixedStepLoop({ step: 1 / 60, update: () => updates++ });
  loop.start();
  loop.tick(1 / 60);
  assert.equal(updates, 1);
  loop.tick(2 / 60);
  assert.equal(updates, 3);
});

test('partial frame time accumulates across calls instead of being dropped', () => {
  let updates = 0;
  const loop = new FixedStepLoop({ step: 1 / 60, update: () => updates++ });
  loop.start();
  loop.tick(0.5 / 60);
  assert.equal(updates, 0);
  loop.tick(0.5 / 60);
  assert.equal(updates, 1);
});

test('render receives leftover alpha in [0, 1)', () => {
  const alphas = [];
  const loop = new FixedStepLoop({
    step: 1 / 60,
    update: () => {},
    render: (alpha) => alphas.push(alpha),
  });
  loop.start();
  loop.tick(1.5 / 60);
  assert.equal(alphas.length, 1);
  assert.ok(alphas[0] >= 0 && alphas[0] < 1);
});

test('huge frameTime is clamped so the simulation cannot spiral forever', () => {
  let updates = 0;
  const loop = new FixedStepLoop({ step: 1 / 60, maxFrameTime: 0.25, update: () => updates++ });
  loop.start();
  loop.tick(10); // e.g. tab was backgrounded for 10s
  assert.ok(updates <= Math.ceil(0.25 / (1 / 60)) + 1);
});

test('tick() does nothing before start() or after stop()', () => {
  let updates = 0;
  const loop = new FixedStepLoop({ step: 1 / 60, update: () => updates++ });
  loop.tick(1);
  assert.equal(updates, 0);
  loop.start();
  loop.tick(1 / 60);
  assert.equal(updates, 1);
  loop.stop();
  loop.tick(1);
  assert.equal(updates, 1);
});
