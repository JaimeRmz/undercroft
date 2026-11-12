import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triggerHitFlash, updateHitFlash, isFlashing } from '../src/render/vfx.js';
import { CONFIG } from '../src/core/config.js';

test('triggerHitFlash sets the timer and isFlashing reports true', () => {
  const entity = {};
  triggerHitFlash(entity);
  assert.equal(entity.hitFlashTimer, CONFIG.HIT_FLASH_SECONDS);
  assert.ok(isFlashing(entity));
});

test('an entity with no hitFlashTimer is not flashing', () => {
  assert.ok(!isFlashing({}));
});

test('updateHitFlash counts down and stops at 0, never negative', () => {
  const entity = {};
  triggerHitFlash(entity, 0.1);
  updateHitFlash(entity, 0.04);
  assert.ok(Math.abs(entity.hitFlashTimer - 0.06) < 1e-9);
  updateHitFlash(entity, 10);
  assert.equal(entity.hitFlashTimer, 0);
  assert.ok(!isFlashing(entity));
});
