import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  approach,
  moveToward,
  distance,
  distanceSq,
  normalize,
  normalizeDiagonal,
  wrapAngle,
} from '../src/core/math.js';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('lerp interpolates linearly', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
});

test('approach moves toward target and snaps when close, independent of dt chunking', () => {
  let v = 0;
  for (let i = 0; i < 120; i++) v = approach(v, 1, 10, 1 / 60);
  assert.ok(Math.abs(v - 1) < 1e-3);
  assert.equal(approach(1, 1, 10, 1 / 60), 1);
});

test('moveToward does not overshoot the target', () => {
  assert.equal(moveToward(0, 5, 2), 2);
  assert.equal(moveToward(4, 5, 2), 5);
  assert.equal(moveToward(5, 0, 100), 0);
});

test('distance and distanceSq agree', () => {
  assert.equal(distance(0, 0, 3, 4), 5);
  assert.equal(distanceSq(0, 0, 3, 4), 25);
});

test('normalize produces a unit vector', () => {
  const n = normalize(3, 4);
  assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-9);
});

test('normalize of zero vector returns zero, not NaN', () => {
  const n = normalize(0, 0);
  assert.deepEqual(n, { x: 0, y: 0 });
});

test('normalizeDiagonal makes diagonal speed equal cardinal speed', () => {
  const diag = normalizeDiagonal(1, 1);
  const mag = Math.hypot(diag.x, diag.y);
  assert.ok(Math.abs(mag - 1) < 1e-9);
  const cardinal = normalizeDiagonal(1, 0);
  assert.deepEqual(cardinal, { x: 1, y: 0 });
});

test('wrapAngle keeps angles in (-PI, PI]', () => {
  const wrapped = wrapAngle(Math.PI * 3);
  assert.ok(wrapped > -Math.PI && wrapped <= Math.PI);
});
