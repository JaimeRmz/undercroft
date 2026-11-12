import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTransitionState,
  startTransition,
  updateTransition,
  detectDoorExit,
  entryPositionForSide,
  oppositeSide,
  transitionCameraOffsets,
  TRANSITION_DURATION,
} from '../src/systems/transitions.js';
import { Room } from '../src/systems/room.js';

test('oppositeSide maps each cardinal direction correctly', () => {
  assert.equal(oppositeSide('north'), 'south');
  assert.equal(oppositeSide('south'), 'north');
  assert.equal(oppositeSide('east'), 'west');
  assert.equal(oppositeSide('west'), 'east');
});

test('detectDoorExit returns the side when the player stands on an unlocked door tile', () => {
  const room = new Room();
  const northDoor = room.doors.get('north');
  const center = room.world.tileGrid.tileCenter(northDoor.tx, northDoor.ty);
  const player = { x: center.x, y: center.y };
  assert.equal(detectDoorExit(room, player), 'north');
});

test('detectDoorExit returns null when the door is locked', () => {
  const room = new Room();
  room.lockDoors();
  const northDoor = room.doors.get('north');
  const center = room.world.tileGrid.tileCenter(northDoor.tx, northDoor.ty);
  assert.equal(detectDoorExit(room, { x: center.x, y: center.y }), null);
});

test('detectDoorExit returns null when the player is not on any door tile', () => {
  const room = new Room();
  const center = room.world.tileGrid.tileCenter(6, 3); // room center, not a door
  assert.equal(detectDoorExit(room, { x: center.x, y: center.y }), null);
});

test('entryPositionForSide places the entrant one tile inward from the door', () => {
  const room = new Room();
  const pos = entryPositionForSide(room, 'north');
  const doorCenter = room.world.tileGrid.tileCenter(room.doors.get('north').tx, room.doors.get('north').ty);
  assert.equal(pos.x, doorCenter.x);
  assert.ok(pos.y > doorCenter.y); // inward = south of the north door
});

test('transition state machine: progress advances over TRANSITION_DURATION and then completes exactly once', () => {
  const state = createTransitionState();
  startTransition(state, 'east');
  assert.ok(state.active);
  let completions = 0;
  const step = 1 / 60;
  for (let t = 0; t < TRANSITION_DURATION + 0.1; t += step) {
    if (updateTransition(state, step)) completions++;
  }
  assert.equal(completions, 1);
  assert.ok(!state.active);
  assert.equal(state.progress, 1);
});

test('updateTransition on an inactive state is a no-op', () => {
  const state = createTransitionState();
  assert.equal(updateTransition(state, 1), false);
});

test('transitionCameraOffsets slides the old room out and the new room in, along the travel direction', () => {
  const { oldRoomOffset, newRoomOffset } = transitionCameraOffsets('east', 0.5, 1000, 700);
  assert.equal(oldRoomOffset.x, -500);
  assert.equal(newRoomOffset.x, 500);
  assert.equal(oldRoomOffset.y, 0);
});

test('at progress=1, the new room has fully arrived at offset 0', () => {
  const { newRoomOffset } = transitionCameraOffsets('south', 1, 1000, 700);
  assert.equal(newRoomOffset.x, 0);
  assert.equal(newRoomOffset.y, 0);
});
