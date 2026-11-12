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
  resolveKeyLockedDoors,
  TRANSITION_DURATION,
} from '../src/systems/transitions.js';
import { Room } from '../src/systems/room.js';
import { createEventBus } from '../src/core/events.js';

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

test('resolveKeyLockedDoors spends one key to unlock a nearby key-locked door', () => {
  const room = new Room();
  room.setDoorKeyLocked('north', true);
  const door = room.doors.get('north');
  const center = room.world.tileGrid.tileCenter(door.tx, door.ty);
  const player = { x: center.x, y: center.y + room.world.tileGrid.tileSize };
  const currency = { keys: 2 };
  const events = createEventBus();
  let unlockedSide = null;
  events.on('door:unlocked', ({ side }) => (unlockedSide = side));

  const result = resolveKeyLockedDoors(room, player, { currency, events });

  assert.equal(result, 'north');
  assert.equal(unlockedSide, 'north');
  assert.equal(currency.keys, 1, 'should spend exactly one key');
  assert.ok(!door.keyLocked);
  assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
});

test('resolveKeyLockedDoors does nothing without a key, or when no door is near/locked', () => {
  const room = new Room();
  room.setDoorKeyLocked('north', true);
  const door = room.doors.get('north');
  const center = room.world.tileGrid.tileCenter(door.tx, door.ty);
  const nearPlayer = { x: center.x, y: center.y + room.world.tileGrid.tileSize };

  assert.equal(resolveKeyLockedDoors(room, nearPlayer, { currency: { keys: 0 } }), null, 'no keys to spend');
  assert.ok(door.keyLocked, 'should still be locked');

  const farPlayer = { x: center.x, y: center.y + room.world.tileGrid.tileSize * 10 };
  assert.equal(resolveKeyLockedDoors(room, farPlayer, { currency: { keys: 5 } }), null, 'too far from the door');
  assert.ok(door.keyLocked);
});
