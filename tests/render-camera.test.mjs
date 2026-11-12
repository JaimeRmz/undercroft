import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/render/camera.js';
import { Rng } from '../src/core/rng.js';

test('worldToScreen centers the camera position in the viewport', () => {
  const camera = new Camera({ x: 100, y: 200, viewportWidth: 1000, viewportHeight: 800 });
  const screen = camera.worldToScreen(100, 200);
  assert.equal(screen.x, 500);
  assert.equal(screen.y, 400);
});

test('worldToScreen scales by zoom', () => {
  const camera = new Camera({ x: 0, y: 0, zoom: 2, viewportWidth: 1000, viewportHeight: 800 });
  const screen = camera.worldToScreen(10, 0);
  assert.equal(screen.x, 500 + 20);
});

test('shake offsets worldToScreen while active, and clears once it expires', () => {
  const camera = new Camera();
  const rng = new Rng(1);
  camera.shake(10, 0.1);
  camera.update(0.05, rng);
  const beforeExpiry = camera.worldToScreen(0, 0);
  assert.ok(beforeExpiry.x !== camera.viewportWidth / 2 || beforeExpiry.y !== camera.viewportHeight / 2);

  camera.update(1, rng); // well past the shake duration
  const afterExpiry = camera.worldToScreen(0, 0);
  assert.equal(afterExpiry.x, camera.viewportWidth / 2);
  assert.equal(afterExpiry.y, camera.viewportHeight / 2);
});

test('shake() extends duration/magnitude but does not shrink an in-progress shake', () => {
  const camera = new Camera();
  camera.shake(5, 0.2);
  camera.shake(2, 0.05); // weaker/shorter — should not reduce the existing shake
  assert.equal(camera.shakeMagnitude, 5);
  assert.equal(camera.shakeTimer, 0.2);
});
