import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  triggerHitFlash,
  updateHitFlash,
  isFlashing,
  triggerSquash,
  updateSquash,
  squashScale,
  updateWalkBob,
  walkBobOffset,
  updateChampionPulse,
  championPulseScale,
} from '../src/render/vfx.js';
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

test('squashScale is {1,1} at rest, distorted right after triggerSquash, and eases back to {1,1}', () => {
  const entity = {};
  assert.deepEqual(squashScale(entity), { x: 1, y: 1 });
  triggerSquash(entity, 0.2);
  const atImpact = squashScale(entity);
  assert.ok(atImpact.x > 1 && atImpact.y < 1, 'expected wide-and-flat right at impact');
  updateSquash(entity, 10); // force the timer to 0
  assert.deepEqual(squashScale(entity), { x: 1, y: 1 });
});

test('updateWalkBob freezes the phase at 0 movement and advances it while moving; walkBobOffset oscillates', () => {
  const stillEntity = {};
  updateWalkBob(stillEntity, 1, 0);
  assert.equal(stillEntity.bobPhase, 0);
  assert.equal(walkBobOffset(stillEntity), 0);

  const movingEntity = {};
  updateWalkBob(movingEntity, 0.1, 1);
  assert.ok(movingEntity.bobPhase > 0);
  const offsets = [];
  for (let i = 0; i < 20; i++) {
    updateWalkBob(movingEntity, 0.1, 1);
    offsets.push(walkBobOffset(movingEntity));
  }
  assert.ok(offsets.some((v) => v > 0) && offsets.some((v) => v < 0), 'expected the bob offset to oscillate above and below 0');
});

test('championPulseScale oscillates around 1 as updateChampionPulse advances the timer', () => {
  const entity = {};
  assert.equal(championPulseScale(entity), 1); // sin(0) = 0
  const values = [];
  for (let i = 0; i < 30; i++) {
    updateChampionPulse(entity, 0.05);
    values.push(championPulseScale(entity));
  }
  assert.ok(values.some((v) => v > 1) && values.some((v) => v < 1), 'expected the pulse scale to swing on both sides of 1');
});
