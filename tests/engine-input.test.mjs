import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInputState,
  press,
  release,
  handleKeyDown,
  handleKeyUp,
  recomputeAxes,
  clearFrameEdges,
  applyGamepad,
  createKeyboardAdapter,
} from '../src/engine/input.js';

test('press sets held + justPressed; repeated press while held does not re-trigger justPressed', () => {
  const state = createInputState();
  press(state, 'bomb');
  assert.ok(state.held.has('bomb'));
  assert.ok(state.justPressed.has('bomb'));
  clearFrameEdges(state);
  press(state, 'bomb'); // still held from before
  assert.ok(!state.justPressed.has('bomb'));
});

test('release clears held + sets justReleased, no-op if not held', () => {
  const state = createInputState();
  press(state, 'bomb');
  clearFrameEdges(state);
  release(state, 'bomb');
  assert.ok(!state.held.has('bomb'));
  assert.ok(state.justReleased.has('bomb'));

  clearFrameEdges(state);
  release(state, 'bomb');
  assert.ok(!state.justReleased.has('bomb'));
});

test('WASD keys map to move actions per CLAUDE.md §4 controls', () => {
  const state = createInputState();
  handleKeyDown(state, 'KeyW');
  handleKeyDown(state, 'KeyA');
  assert.ok(state.held.has('moveUp'));
  assert.ok(state.held.has('moveLeft'));
});

test('arrow keys map to shoot actions, independent of WASD', () => {
  const state = createInputState();
  handleKeyDown(state, 'ArrowUp');
  handleKeyDown(state, 'ArrowRight');
  assert.ok(state.held.has('shootUp'));
  assert.ok(state.held.has('shootRight'));
});

test('E/Space/Q/Ctrl/Tab/Escape/backtick map to bomb/active/consumable/trinket/map/pause/console', () => {
  const state = createInputState();
  handleKeyDown(state, 'KeyE');
  handleKeyDown(state, 'Space');
  handleKeyDown(state, 'KeyQ');
  handleKeyDown(state, 'ControlLeft');
  handleKeyDown(state, 'Tab');
  handleKeyDown(state, 'Escape');
  handleKeyDown(state, 'Backquote');
  for (const action of ['bomb', 'useActive', 'useConsumable', 'dropTrinket', 'toggleMap', 'pause', 'toggleConsole']) {
    assert.ok(state.held.has(action), `expected ${action} to be held`);
  }
});

test('unmapped key codes are ignored without throwing', () => {
  const state = createInputState();
  assert.doesNotThrow(() => handleKeyDown(state, 'KeyZ'));
  assert.equal(state.held.size, 0);
});

test('handleKeyUp releases the mapped action', () => {
  const state = createInputState();
  handleKeyDown(state, 'KeyW');
  handleKeyUp(state, 'KeyW');
  assert.ok(!state.held.has('moveUp'));
});

test('recomputeAxes: opposite directions cancel out, single direction gives +-1', () => {
  const state = createInputState();
  handleKeyDown(state, 'KeyD'); // moveRight
  recomputeAxes(state);
  assert.equal(state.moveX, 1);
  handleKeyDown(state, 'KeyA'); // moveLeft too
  recomputeAxes(state);
  assert.equal(state.moveX, 0);
});

test('clearFrameEdges clears justPressed/justReleased but leaves held alone', () => {
  const state = createInputState();
  press(state, 'bomb');
  clearFrameEdges(state);
  assert.equal(state.justPressed.size, 0);
  assert.ok(state.held.has('bomb'));
});

test('applyGamepad ignores stick movement within the deadzone', () => {
  const state = createInputState();
  applyGamepad(state, { axes: [0.1, -0.1, 0, 0], buttons: [] });
  assert.equal(state.moveX, 0);
  assert.equal(state.moveY, 0);
});

test('applyGamepad sets analog axes once past the deadzone', () => {
  const state = createInputState();
  applyGamepad(state, { axes: [0.8, -0.5, 0, 0], buttons: [] });
  assert.equal(state.moveX, 0.8);
  assert.equal(state.moveY, -0.5);
});

test('applyGamepad maps buttons to actions and releases them when not pressed', () => {
  const state = createInputState();
  applyGamepad(state, { axes: [0, 0, 0, 0], buttons: [{ pressed: true }] }); // index 0 -> useActive
  assert.ok(state.held.has('useActive'));
  applyGamepad(state, { axes: [0, 0, 0, 0], buttons: [{ pressed: false }] });
  assert.ok(!state.held.has('useActive'));
});

test('createKeyboardAdapter no-ops headlessly (no window) instead of throwing', () => {
  const state = createInputState();
  const dispose = createKeyboardAdapter(state, undefined);
  assert.equal(typeof dispose, 'function');
  assert.doesNotThrow(() => dispose());
});

test('createKeyboardAdapter wires a fake EventTarget-like object correctly', () => {
  const state = createInputState();
  const listeners = {};
  const fakeTarget = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
  };
  const dispose = createKeyboardAdapter(state, fakeTarget);
  listeners.keydown({ code: 'KeyW' });
  assert.ok(state.held.has('moveUp'));
  assert.equal(state.moveY, -1);
  listeners.keyup({ code: 'KeyW' });
  assert.ok(!state.held.has('moveUp'));
  dispose();
  assert.equal(listeners.keydown, undefined);
});
