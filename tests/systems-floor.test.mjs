import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorRuntime } from '../src/systems/floor.js';
import { generateFloor, cellKey, ROOM_TYPE } from '../src/systems/floorgen.js';
import { Rng } from '../src/core/rng.js';

const TEMPLATES = [
  { id: 'n1', type: 'normal', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'start1', type: 'start', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'boss1', type: 'boss', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'treasure1', type: 'treasure', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'shop1', type: 'shop', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'secret1', type: 'secret', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
  { id: 'supersecret1', type: 'supersecret', rows: ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'] },
];

const DELTAS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

function isSecret(floor, key) {
  const cell = floor.cells.get(key);
  return cell && (cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET);
}

/** A direction from `cell` toward a real, non-secret neighbor (the kind move() allows without revealing anything first). */
function findDoorableDirection(floor, cell) {
  for (const [side, [dx, dy]] of Object.entries(DELTAS)) {
    const key = cellKey(cell.x + dx, cell.y + dy);
    if (floor.cells.has(key) && !isSecret(floor, key)) return side;
  }
  return null;
}

test('FloorRuntime starts on the start cell, room is built with doors matching the floor graph', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-1'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-1'));
  assert.equal(runtime.currentKey, cellKey(floor.startCell.x, floor.startCell.y));
  const room = runtime.getCurrentRoom();
  assert.ok(room.doors.size > 0);
});

test('move() to a real non-secret neighbor switches rooms and marks it visited, entering from the opposite side', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-2'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-2'));
  const startCell = runtime.getCurrentCell();
  const dir = findDoorableDirection(floor, startCell);
  assert.ok(dir, 'expected the start cell to have at least one non-secret neighbor');
  const result = runtime.move(dir);
  assert.ok(result);
  assert.equal(result.enteredFrom, OPPOSITE[dir]);
  assert.notEqual(runtime.currentKey, cellKey(startCell.x, startCell.y));
  assert.ok(runtime.visited.has(runtime.currentKey));
});

test('move() in a direction with no neighbor returns null and does not change the current room', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-3'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-3'));
  const startCell = runtime.getCurrentCell();
  const deadDir = Object.keys(DELTAS).find((d) => {
    const [dx, dy] = DELTAS[d];
    return !floor.cells.has(cellKey(startCell.x + dx, startCell.y + dy));
  });
  if (!deadDir) return; // start happened to have all 4 neighbors this seed; nothing to assert
  const before = runtime.currentKey;
  assert.equal(runtime.move(deadDir), null);
  assert.equal(runtime.currentKey, before);
});

test('move() toward an unrevealed secret room returns null (no door exists yet)', () => {
  // Search a handful of seeds for a floor whose start cell is adjacent to a secret/super-secret room.
  for (let i = 0; i < 200; i++) {
    const floor = generateFloor(1, new Rng(`secret-adjacency-${i}`));
    const startCell = floor.startCell;
    const secretDir = Object.entries(DELTAS).find(([, [dx, dy]]) => isSecret(floor, cellKey(startCell.x + dx, startCell.y + dy)));
    if (!secretDir) continue;
    const runtime = new FloorRuntime(floor, TEMPLATES, new Rng(`secret-templates-${i}`));
    assert.equal(runtime.move(secretDir[0]), null);
    return;
  }
});

test('getRoom caches rooms: re-entering a visited room returns the same instance (state persists)', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-4'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-4'));
  const startRoom = runtime.getCurrentRoom();
  const startKey = runtime.currentKey;
  const dir = findDoorableDirection(floor, runtime.getCurrentCell());
  runtime.move(dir);
  runtime.move(OPPOSITE[dir]);
  assert.equal(runtime.currentKey, startKey);
  assert.equal(runtime.getCurrentRoom(), startRoom);
});

test('every non-secret room built by FloorRuntime has doors exactly toward its real, non-secret neighbors', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-5'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-5'));
  for (const cell of floor.cells.values()) {
    if (cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET) continue;
    const key = cellKey(cell.x, cell.y);
    const room = runtime.getRoom(key);
    for (const [side, [dx, dy]] of Object.entries(DELTAS)) {
      const neighborKey = cellKey(cell.x + dx, cell.y + dy);
      const expectDoor = floor.cells.has(neighborKey) && !isSecret(floor, neighborKey);
      assert.equal(room.doors.has(side), expectDoor, `cell ${key} side ${side}`);
    }
  }
});

test('every door is tagged with the room type on its far side (P1.G4: doors read as treasure/shop/boss before opening)', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-leadsto'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-leadsto'));
  for (const cell of floor.cells.values()) {
    if (cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET) continue;
    const room = runtime.getRoom(cellKey(cell.x, cell.y));
    for (const [side, door] of room.doors) {
      const [dx, dy] = DELTAS[side];
      const neighbor = floor.cells.get(cellKey(cell.x + dx, cell.y + dy));
      assert.equal(door.leadsToType, neighbor.type);
    }
  }
});

test('secret/super-secret rooms start with zero doors', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-6'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-6'));
  for (const cell of floor.cells.values()) {
    if (cell.type !== ROOM_TYPE.SECRET && cell.type !== ROOM_TYPE.SUPER_SECRET) continue;
    const room = runtime.getRoom(cellKey(cell.x, cell.y));
    assert.equal(room.doors.size, 0);
  }
});

test('revealSecretWall carves a door both ways when a bomb lands near the shared wall, and move() then works', () => {
  for (let i = 0; i < 200; i++) {
    const floor = generateFloor(1, new Rng(`reveal-${i}`));
    const runtime = new FloorRuntime(floor, TEMPLATES, new Rng(`reveal-templates-${i}`));
    const startCell = runtime.getCurrentCell();
    const secretEntry = Object.entries(DELTAS).find(([, [dx, dy]]) => isSecret(floor, cellKey(startCell.x + dx, startCell.y + dy)));
    if (!secretEntry) continue;

    const [side] = secretEntry;
    const room = runtime.getCurrentRoom();
    const pos = room.doorPositionForSide(side);
    const center = room.world.tileGrid.tileCenter(pos.tx, pos.ty);

    const result = runtime.revealSecretWall(center.x, center.y);
    assert.ok(result);
    assert.equal(result.side, side);
    assert.ok(room.doors.has(side));

    const moveResult = runtime.move(side);
    assert.ok(moveResult, 'move() should now succeed through the revealed door');
    assert.ok(moveResult.room.doors.has(OPPOSITE[side]), 'the secret room should have a door back toward the room we came from');
    return;
  }
});

test('revealSecretWall does nothing when the bomb lands far from any secret-adjacent wall', () => {
  const floor = generateFloor(1, new Rng('reveal-far'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('reveal-far-templates'));
  const result = runtime.revealSecretWall(-99999, -99999);
  assert.equal(result, null);
});

test('floor 1 never key-locks treasure/shop doors', () => {
  for (let i = 0; i < 50; i++) {
    const floor = generateFloor(1, new Rng(`stage1-keylock-${i}`));
    const runtime = new FloorRuntime(floor, TEMPLATES, new Rng(`stage1-keylock-templates-${i}`));
    for (const cell of floor.cells.values()) {
      if (cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET) continue;
      const room = runtime.getRoom(cellKey(cell.x, cell.y));
      for (const door of room.doors.values()) assert.ok(!door.keyLocked, 'floor 1 should have no key-locked doors');
    }
  }
});

test('from floor 2 on, the door approaching a treasure/shop room is key-locked, but the treasure/shop room\'s own door back is not', () => {
  for (let i = 0; i < 200; i++) {
    const floor = generateFloor(2, new Rng(`stage2-keylock-${i}`));
    const runtime = new FloorRuntime(floor, TEMPLATES, new Rng(`stage2-keylock-templates-${i}`));
    const target = [...floor.cells.values()].find((cell) => cell.type === ROOM_TYPE.TREASURE || cell.type === ROOM_TYPE.SHOP);
    if (!target) continue;

    const approachDir = Object.entries(DELTAS).find(([, [dx, dy]]) => {
      const neighborKey = cellKey(target.x + dx, target.y + dy);
      return floor.cells.has(neighborKey) && !isSecret(floor, neighborKey);
    });
    if (!approachDir) continue;

    // `side` is the direction from the target (treasure/shop) cell to its neighbor; the neighbor's
    // door facing back toward the target (the one you'd walk through to enter) is the opposite side.
    const [side, [dx, dy]] = approachDir;
    const approachingCell = floor.cells.get(cellKey(target.x + dx, target.y + dy));
    const approachingRoom = runtime.getRoom(cellKey(approachingCell.x, approachingCell.y));
    assert.ok(approachingRoom.doors.get(OPPOSITE[side]).keyLocked, 'the door into the treasure/shop room should be key-locked');

    const targetRoom = runtime.getRoom(cellKey(target.x, target.y));
    assert.ok(!targetRoom.doors.get(side).keyLocked, "the treasure/shop room's own door back should not be key-locked");
    return;
  }
});
