import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  circlesOverlap,
  resolveCircleCircle,
  circleIntersectsAabb,
  resolveCircleVsAabb,
} from '../src/engine/collision.js';

test('circlesOverlap detects overlap and separation correctly', () => {
  assert.ok(circlesOverlap(0, 0, 5, 8, 0, 5)); // dist 8 < sum 10
  assert.ok(!circlesOverlap(0, 0, 5, 20, 0, 5)); // dist 20 > sum 10
});

test('resolveCircleCircle returns a unit push vector and correct overlap depth', () => {
  const hit = resolveCircleCircle(0, 0, 5, 8, 0, 5);
  assert.ok(hit);
  assert.ok(Math.abs(Math.hypot(hit.x, hit.y) - 1) < 1e-9);
  assert.ok(hit.overlap > 0 && hit.overlap < 10);
  // a is to the left of b, so push should point further left (negative x)
  assert.ok(hit.x < 0);
});

test('resolveCircleCircle returns null when not overlapping', () => {
  assert.equal(resolveCircleCircle(0, 0, 5, 100, 0, 5), null);
});

test('circleIntersectsAabb handles circle whose center is outside the box', () => {
  assert.ok(circleIntersectsAabb(15, 5, 6, 0, 0, 10, 10)); // just past the right edge, radius reaches in
  assert.ok(!circleIntersectsAabb(30, 5, 2, 0, 0, 10, 10));
});

test('resolveCircleVsAabb pushes a circle straight out when centered inside the box', () => {
  // Box centered differently so penetration axes differ; circle center dead-center.
  const hit = resolveCircleVsAabb(5, 2, 3, 0, 0, 10, 4); // closer to top edge (pen=2) than others
  assert.ok(hit);
  assert.ok(Math.abs(Math.hypot(hit.x, hit.y) - 1) < 1e-9);
});

test('resolveCircleVsAabb pushes a circle out along the nearest edge when overlapping from outside', () => {
  const hit = resolveCircleVsAabb(12, 5, 4, 0, 0, 10, 10); // approaching from the right
  assert.ok(hit);
  assert.ok(hit.x > 0); // pushed further right, away from the box
});

test('resolveCircleVsAabb returns null when far away', () => {
  assert.equal(resolveCircleVsAabb(100, 100, 2, 0, 0, 10, 10), null);
});
