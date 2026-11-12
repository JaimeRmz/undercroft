import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../src/render/viewport.js';
import { VIEW_W, VIEW_H, ROOM_RECT, ZONES, isOutsideRoom } from '../src/ui/layout.js';

test('scale is always a whole number and the canvas never exceeds the window', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [1366, 768], [2560, 1440], [3840, 2160], [800, 600], [1000, 500], [2000, 400]]) {
    const v = computeViewport(w, h, VIEW_W, VIEW_H, 1);
    assert.ok(Number.isInteger(v.scale) && v.scale >= 1);
    if (w >= VIEW_W && h >= VIEW_H) {
      assert.ok(v.cssW <= w && v.cssH <= h, `${w}x${h}: canvas ${v.cssW}x${v.cssH} overflows`);
      const next = computeViewport(w, h, VIEW_W, VIEW_H, 1).scale + 1;
      assert.ok(VIEW_W * next > w || VIEW_H * next > h, 'a larger integer scale would still have fit');
    }
  }
});

test('1920x1080 fills exactly at 3x and 1280x720 at 2x', () => {
  assert.equal(computeViewport(1920, 1080, VIEW_W, VIEW_H).scale, 3);
  assert.deepEqual([computeViewport(1920, 1080, VIEW_W, VIEW_H).cssW, computeViewport(1920, 1080, VIEW_W, VIEW_H).cssH], [1920, 1080]);
  assert.equal(computeViewport(1280, 720, VIEW_W, VIEW_H).scale, 2);
});

test('a resize changes the scale; tiny windows clamp to 1', () => {
  assert.equal(computeViewport(2560, 1440, VIEW_W, VIEW_H).scale, 4);
  assert.equal(computeViewport(300, 200, VIEW_W, VIEW_H).scale, 1);
});

test('HiDPI: scale counts device pixels, CSS size is backing / dpr', () => {
  const v = computeViewport(1440, 810, VIEW_W, VIEW_H, 2); // 2880x1620 device px
  assert.equal(v.scale, 4);
  assert.equal(v.backingW, VIEW_W * 4);
  assert.equal(v.cssW, (VIEW_W * 4) / 2);
});

test('the room is centered and fills most of the view; HUD zones never overlap it', () => {
  assert.equal(ROOM_RECT.x * 2 + ROOM_RECT.w, VIEW_W);
  assert.equal(ROOM_RECT.y * 2 + ROOM_RECT.h, VIEW_H);
  assert.ok((ROOM_RECT.w * ROOM_RECT.h) / (VIEW_W * VIEW_H) > 0.6, 'room should dominate the screen');
  for (const [name, z] of Object.entries(ZONES)) {
    assert.ok(isOutsideRoom(z.x, z.y, z.w, z.h), `${name} zone overlaps the room`);
  }
});
