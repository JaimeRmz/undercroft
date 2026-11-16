import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFloor,
  getCell,
  cellKey,
  areAdjacent,
  neighborsOf,
  inFloorBounds,
  ROOM_TYPE,
  FLOOR_GRID_WIDTH,
  FLOOR_GRID_HEIGHT,
  START_CELL,
} from '../src/systems/floorgen.js';
import { Rng } from '../src/core/rng.js';

/** Explicit BFS over the generated cell map, independent of the generator's own bookkeeping. */
function isConnected(floor) {
  const seen = new Set([cellKey(floor.startCell.x, floor.startCell.y)]);
  const queue = [floor.startCell];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const nb of neighborsOf(current.x, current.y)) {
      const k = cellKey(nb.x, nb.y);
      if (seen.has(k)) continue;
      const cell = floor.cells.get(k);
      // Only traverse through the "main" tree rooms; secret/super-secret are
      // reached by bombing, not a door, so they don't need a tree-edge path.
      if (!cell || cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET) continue;
      seen.add(k);
      queue.push(cell);
    }
  }
  const mainRooms = [...floor.cells.values()].filter(
    (c) => c.type !== ROOM_TYPE.SECRET && c.type !== ROOM_TYPE.SUPER_SECRET
  );
  return mainRooms.every((c) => seen.has(cellKey(c.x, c.y)));
}

test('generateFloor places the start room at the fixed central cell', () => {
  const rng = new Rng('fixed-start-check');
  const floor = generateFloor(1, rng);
  assert.equal(floor.startCell.x, START_CELL.x);
  assert.equal(floor.startCell.y, START_CELL.y);
  assert.equal(getCell(floor, START_CELL.x, START_CELL.y).type, ROOM_TYPE.START);
});

test('column 0 is never used by any generated room', () => {
  const rng = new Rng('column-zero-check');
  const floor = generateFloor(1, rng);
  for (const cell of floor.cells.values()) {
    assert.ok(cell.x >= 1, `cell at x=${cell.x} should not be in column 0`);
    assert.ok(inFloorBounds(cell.x, cell.y));
  }
});

test('exactly one start, one boss, one treasure, one shop room exist', () => {
  const rng = new Rng('one-of-each');
  const floor = generateFloor(1, rng);
  const counts = {};
  for (const cell of floor.cells.values()) counts[cell.type] = (counts[cell.type] ?? 0) + 1;
  assert.equal(counts[ROOM_TYPE.START], 1);
  assert.equal(counts[ROOM_TYPE.BOSS], 1);
  assert.equal(counts[ROOM_TYPE.TREASURE], 1);
  assert.equal(counts[ROOM_TYPE.SHOP], 1);
});

test('1000 seeds: floor is connected, room count matches target, boss not adjacent to start, special rooms reachable', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const rng = new Rng(`floor-seed-${seed}`);
    const floor = generateFloor(1, rng);

    assert.ok(isConnected(floor), `seed ${seed}: floor is not fully connected`);
    assert.equal(floor.roomCount, floor.target, `seed ${seed}: room count does not match target`);
    assert.ok(!areAdjacent(floor.boss, floor.startCell), `seed ${seed}: boss room is adjacent to start`);

    // Every special room (secret/super-secret) must touch at least one real room (how you'd bomb/find it).
    for (const special of [floor.secret, floor.superSecret]) {
      if (!special) continue;
      const touchesARealRoom = neighborsOf(special.x, special.y).some((nb) => {
        const cell = floor.cells.get(cellKey(nb.x, nb.y));
        return cell && cell !== special;
      });
      assert.ok(touchesARealRoom, `seed ${seed}: special room ${special.type} is not reachable`);
    }

    // Grid bounds sanity for every placed cell.
    for (const cell of floor.cells.values()) {
      assert.ok(cell.x >= 1 && cell.x < FLOOR_GRID_WIDTH);
      assert.ok(cell.y >= 0 && cell.y < FLOOR_GRID_HEIGHT);
    }
  }
});

test('target room count formula: min(20, randInt(0,1) + 5 + floor(stage*10/3))', () => {
  // Stage 1: floor(10/3)=3, so target in {8,9}. Stage 4: floor(40/3)=13, target in {18,19}. Stage 7: capped at 20.
  for (let seed = 0; seed < 50; seed++) {
    const rngA = new Rng(`target-stage1-${seed}`);
    const floorA = generateFloor(1, rngA);
    assert.ok(floorA.target === 8 || floorA.target === 9, `stage 1 target was ${floorA.target}`);

    const rngB = new Rng(`target-stage7-${seed}`);
    const floorB = generateFloor(7, rngB);
    assert.equal(floorB.target, 20);
  }
});

test('boss room is the farthest dead end (max BFS depth among dead ends)', () => {
  const rng = new Rng('farthest-boss-check');
  const floor = generateFloor(1, rng);
  const deadEndDepths = [...floor.cells.values()]
    .filter((c) => c.type !== ROOM_TYPE.START && c.type !== ROOM_TYPE.SECRET && c.type !== ROOM_TYPE.SUPER_SECRET)
    .map((c) => c.depth);
  assert.equal(floor.boss.depth, Math.max(...deadEndDepths));
});

test('P2.6: special room types (sacrifice/challenge/curse/arcade), when assigned, are distinct dead ends never colliding with start/boss/treasure/shop', () => {
  for (let seed = 0; seed < 200; seed++) {
    const rng = new Rng(`special-rooms-${seed}`);
    const floor = generateFloor(2, rng); // stage 2+ so challenge rooms are eligible
    const specials = [floor.sacrifice, floor.challenge, floor.curse, floor.arcade].filter(Boolean);
    const seen = new Set();
    for (const cell of specials) {
      const key = cellKey(cell.x, cell.y);
      assert.ok(!seen.has(key), `seed ${seed}: two special rooms landed on the same cell`);
      seen.add(key);
      assert.notEqual(cell, floor.startCell);
      assert.notEqual(cell, floor.boss);
      assert.notEqual(cell, floor.treasure);
      assert.notEqual(cell, floor.shop);
    }
  }
});

test('P2.6: challenge rooms never appear on floor 1', () => {
  let sawOne = false;
  for (let seed = 0; seed < 300; seed++) {
    const floor = generateFloor(1, new Rng(`floor1-challenge-${seed}`));
    if (floor.challenge) sawOne = true;
  }
  assert.equal(sawOne, false, 'a challenge room appeared on floor 1');
});

test('P2.6: a full-health floor rolls sacrifice rooms more often than a not-full-health floor, over many seeds', () => {
  let fullHealthCount = 0;
  let notFullHealthCount = 0;
  const trials = 500;
  for (let seed = 0; seed < trials; seed++) {
    if (generateFloor(1, new Rng(`sac-full-${seed}`), { isPlayerFullHealth: true }).sacrifice) fullHealthCount++;
    if (generateFloor(1, new Rng(`sac-notfull-${seed}`), { isPlayerFullHealth: false }).sacrifice) notFullHealthCount++;
  }
  assert.ok(fullHealthCount > notFullHealthCount, `expected more sacrifice rooms at full health (${fullHealthCount} vs ${notFullHealthCount})`);
});

test('generateFloor is deterministic for a given seed', () => {
  const floorA = generateFloor(1, new Rng('determinism-check'));
  const floorB = generateFloor(1, new Rng('determinism-check'));
  assert.deepEqual(
    [...floorA.cells.values()].map((c) => [c.x, c.y, c.type]).sort(),
    [...floorB.cells.values()].map((c) => [c.x, c.y, c.type]).sort()
  );
});
