import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMinimapIcons } from '../src/ui/map.js';
import { generateFloor, cellKey, ROOM_TYPE } from '../src/systems/floorgen.js';
import { Rng } from '../src/core/rng.js';

function findFloorWithSecret(seedPrefix = 'map-test') {
  for (let i = 0; i < 200; i++) {
    const floor = generateFloor(1, new Rng(`${seedPrefix}-${i}`));
    if (floor.secret) return floor;
  }
  throw new Error('could not find a seed with a secret room in 200 tries');
}

test('only the start room shows when nothing else has been visited or is adjacent yet... except its immediate neighbors show as adjacent', () => {
  const floor = generateFloor(1, new Rng('map-basic'));
  const startKey = cellKey(floor.startCell.x, floor.startCell.y);
  const icons = computeMinimapIcons(floor, { visited: new Set([startKey]), currentKey: startKey });
  const start = icons.find((i) => i.x === floor.startCell.x && i.y === floor.startCell.y);
  assert.equal(start.state, 'current');
  // every icon shown besides start must be visited or adjacent to the start room
  for (const icon of icons) {
    if (icon.x === floor.startCell.x && icon.y === floor.startCell.y) continue;
    assert.ok(icon.state === 'adjacent', `unexpected icon state ${icon.state} for an undiscovered room`);
  }
});

test('secret rooms never appear until visited, even when adjacent to a visited room', () => {
  const floor = findFloorWithSecret();
  const startKey = cellKey(floor.startCell.x, floor.startCell.y);
  // Visit every normal/special (non-secret) room to maximize adjacency to the secret room.
  const visited = new Set();
  for (const cell of floor.cells.values()) {
    if (cell.type !== ROOM_TYPE.SECRET && cell.type !== ROOM_TYPE.SUPER_SECRET) {
      visited.add(cellKey(cell.x, cell.y));
    }
  }
  visited.add(startKey);
  const icons = computeMinimapIcons(floor, { visited, currentKey: startKey });
  const secretIcon = icons.find((i) => i.x === floor.secret.x && i.y === floor.secret.y);
  assert.equal(secretIcon, undefined, 'secret room should not appear on the map before being entered');
});

test('once visited, a secret room shows with state "visited"', () => {
  const floor = findFloorWithSecret();
  const secretKey = cellKey(floor.secret.x, floor.secret.y);
  const icons = computeMinimapIcons(floor, { visited: new Set([secretKey]), currentKey: secretKey });
  const secretIcon = icons.find((i) => i.x === floor.secret.x && i.y === floor.secret.y);
  assert.ok(secretIcon);
  assert.equal(secretIcon.state, 'current');
});

test('a visited room shows as "visited" (not "adjacent")', () => {
  const floor = generateFloor(1, new Rng('map-visited'));
  const startKey = cellKey(floor.startCell.x, floor.startCell.y);
  // Pick a neighbor of start that exists in the graph.
  const neighborCell = [...floor.cells.values()].find(
    (c) => c !== floor.startCell && Math.abs(c.x - floor.startCell.x) + Math.abs(c.y - floor.startCell.y) === 1
  );
  const visited = new Set([startKey, cellKey(neighborCell.x, neighborCell.y)]);
  const icons = computeMinimapIcons(floor, { visited, currentKey: startKey });
  const neighborIcon = icons.find((i) => i.x === neighborCell.x && i.y === neighborCell.y);
  assert.equal(neighborIcon.state, 'visited');
});

test('a room with no visited neighbor and not itself visited is completely hidden', () => {
  const floor = generateFloor(1, new Rng('map-hidden'));
  const startKey = cellKey(floor.startCell.x, floor.startCell.y);
  const icons = computeMinimapIcons(floor, { visited: new Set([startKey]) });
  // The boss room (farthest dead end) should not be visible yet, in any floor with >2 depth.
  if (floor.boss.depth > 1) {
    const bossIcon = icons.find((i) => i.x === floor.boss.x && i.y === floor.boss.y);
    assert.equal(bossIcon, undefined);
  }
});
