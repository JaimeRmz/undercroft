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

test('FloorRuntime starts on the start cell, room is built with doors matching the floor graph', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-1'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-1'));
  assert.equal(runtime.currentKey, cellKey(floor.startCell.x, floor.startCell.y));
  const room = runtime.getCurrentRoom();
  assert.ok(room.doors.size > 0);
});

test('move() to a real neighbor switches rooms and marks it visited, entering from the opposite side', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-2'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-2'));
  const startCell = runtime.getCurrentCell();
  // Find a real direction to move in.
  const dirs = [
    ['north', 0, -1],
    ['south', 0, 1],
    ['east', 1, 0],
    ['west', -1, 0],
  ];
  const [dir] = dirs.find(([, dx, dy]) => floor.cells.has(cellKey(startCell.x + dx, startCell.y + dy)));
  const result = runtime.move(dir);
  assert.ok(result);
  const oppositeMap = { north: 'south', south: 'north', east: 'west', west: 'east' };
  assert.equal(result.enteredFrom, oppositeMap[dir]);
  assert.notEqual(runtime.currentKey, cellKey(startCell.x, startCell.y));
  assert.ok(runtime.visited.has(runtime.currentKey));
});

test('move() in a direction with no neighbor returns null and does not change the current room', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-3'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-3'));
  const dirs = ['north', 'south', 'east', 'west'];
  const startCell = runtime.getCurrentCell();
  const deltas = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const deadDir = dirs.find((d) => {
    const [dx, dy] = deltas[d];
    return !floor.cells.has(cellKey(startCell.x + dx, startCell.y + dy));
  });
  if (!deadDir) return; // start happened to have all 4 neighbors this seed; nothing to assert
  const before = runtime.currentKey;
  assert.equal(runtime.move(deadDir), null);
  assert.equal(runtime.currentKey, before);
});

test('getRoom caches rooms: re-entering a visited room returns the same instance (state persists)', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-4'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-4'));
  const startRoom = runtime.getCurrentRoom();
  const startKey = runtime.currentKey;
  const dirs = [
    ['north', 0, -1],
    ['south', 0, 1],
    ['east', 1, 0],
    ['west', -1, 0],
  ];
  const startCell = runtime.getCurrentCell();
  const [dir] = dirs.find(([, dx, dy]) => floor.cells.has(cellKey(startCell.x + dx, startCell.y + dy)));
  runtime.move(dir);
  const backMap = { north: 'south', south: 'north', east: 'west', west: 'east' };
  runtime.move(backMap[dir]);
  assert.equal(runtime.currentKey, startKey);
  assert.equal(runtime.getCurrentRoom(), startRoom);
});

test('every room built by FloorRuntime only has doors toward real neighbors in the floor graph', () => {
  const floor = generateFloor(1, new Rng('floor-runtime-5'));
  const runtime = new FloorRuntime(floor, TEMPLATES, new Rng('templates-5'));
  for (const cell of floor.cells.values()) {
    if (cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET) continue;
    const key = cellKey(cell.x, cell.y);
    const room = runtime.getRoom(key);
    const deltas = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
    for (const [side, [dx, dy]] of Object.entries(deltas)) {
      const hasNeighbor = floor.cells.has(cellKey(cell.x + dx, cell.y + dy));
      assert.equal(room.doors.has(side), hasNeighbor, `cell ${key} side ${side}`);
    }
  }
});
