import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triggerHitstop, consumeHitstopFrame, isHitstopped, resetHitstop } from '../src/render/hitstop.js';

test('triggerHitstop arms a freeze that consumeHitstopFrame ticks down to zero', () => {
  resetHitstop();
  assert.ok(!isHitstopped());
  triggerHitstop(2);
  assert.ok(isHitstopped());
  assert.ok(consumeHitstopFrame());
  assert.ok(isHitstopped());
  assert.ok(consumeHitstopFrame());
  assert.ok(!isHitstopped());
  assert.ok(!consumeHitstopFrame(), 'no frames left to consume');
});

test('triggerHitstop never shortens an already-longer freeze in progress', () => {
  resetHitstop();
  triggerHitstop(2);
  triggerHitstop(1);
  assert.ok(consumeHitstopFrame());
  assert.ok(isHitstopped(), 'the original 2-frame freeze should still have one frame left');
  assert.ok(consumeHitstopFrame());
  assert.ok(!isHitstopped());
});
