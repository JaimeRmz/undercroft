import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFloorTransitionState,
  startFloorTransition,
  updateFloorTransition,
  floorTransitionAlpha,
  FLOOR_FADE_OUT_SECONDS,
  FLOOR_FADE_IN_SECONDS,
} from '../src/systems/floorTransition.js';

test('an inactive state never advances and has zero overlay alpha', () => {
  const state = createFloorTransitionState();
  assert.equal(updateFloorTransition(state, 1), null);
  assert.equal(floorTransitionAlpha(state), 0);
});

test('fade-out ramps alpha from 0 toward 1, then signals "swap" exactly once the screen is fully black', () => {
  const state = createFloorTransitionState();
  startFloorTransition(state);
  assert.equal(state.phase, 'out');
  assert.equal(floorTransitionAlpha(state), 0);

  assert.equal(updateFloorTransition(state, FLOOR_FADE_OUT_SECONDS / 2), null);
  const midAlpha = floorTransitionAlpha(state);
  assert.ok(midAlpha > 0 && midAlpha < 1);

  const result = updateFloorTransition(state, FLOOR_FADE_OUT_SECONDS / 2);
  assert.equal(result, 'swap');
  assert.equal(state.phase, 'in');
  assert.equal(floorTransitionAlpha(state), 1, 'screen should be fully black at the swap instant');
});

test('fade-in ramps alpha back down to 0 and signals "done", leaving the state inactive', () => {
  const state = createFloorTransitionState();
  startFloorTransition(state);
  updateFloorTransition(state, FLOOR_FADE_OUT_SECONDS); // reach 'swap', now fading in

  assert.equal(updateFloorTransition(state, FLOOR_FADE_IN_SECONDS / 2), null);
  const midAlpha = floorTransitionAlpha(state);
  assert.ok(midAlpha > 0 && midAlpha < 1);

  const result = updateFloorTransition(state, FLOOR_FADE_IN_SECONDS / 2);
  assert.equal(result, 'done');
  assert.equal(state.active, false);
  assert.equal(floorTransitionAlpha(state), 0);
});
