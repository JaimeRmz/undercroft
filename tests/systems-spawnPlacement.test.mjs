import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, TILE } from '../src/systems/room.js';
import { findGroundSpawnTile } from '../src/systems/spawnPlacement.js';
import { Rng } from '../src/core/rng.js';

function tileOf(room, pos) {
  const { tx, ty } = room.world.tileGrid.worldToTile(pos.x, pos.y);
  return { tx, ty, type: room.getTileType(tx, ty) };
}

test('findGroundSpawnTile never lands a ground enemy on a pit or rock, across many rolls', () => {
  const room = new Room();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) room.placePit(6 + dx, 3 + dy); // centerPitBlock
  room.placeRock(3, 3);
  const rng = new Rng('spawn-ground');
  for (let i = 0; i < 100; i++) {
    const pos = findGroundSpawnTile(room, rng, { flies: false });
    const { type } = tileOf(room, pos);
    assert.notEqual(type, TILE.PIT);
    assert.notEqual(type, TILE.ROCK);
    assert.notEqual(type, TILE.WALL);
  }
});

test('findGroundSpawnTile allows a flier to spawn over a pit, but never on a rock', () => {
  const room = new Room();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) room.placePit(6 + dx, 3 + dy);
  room.placeRock(3, 3);
  const rng = new Rng('spawn-flier');
  let sawPit = false;
  for (let i = 0; i < 200; i++) {
    const pos = findGroundSpawnTile(room, rng, { flies: true });
    const { type } = tileOf(room, pos);
    assert.notEqual(type, TILE.ROCK);
    assert.notEqual(type, TILE.WALL);
    if (type === TILE.PIT) sawPit = true;
  }
  assert.ok(sawPit, 'a flier should sometimes land on the pit block at room center');
});

test('findGroundSpawnTile never picks a floor tile isolated from every door, even for ground enemies', () => {
  const room = new Room();
  // (10,2) stays TILE.FLOOR but is walled in on all 4 sides by rocks, so it's structurally
  // unreachable on foot from any door even though it isn't itself a hazard tile.
  room.placeRock(9, 2);
  room.placeRock(11, 2);
  room.placeRock(10, 1);
  room.placeRock(10, 3);
  assert.equal(room.getTileType(10, 2), TILE.FLOOR);

  const rng = new Rng('spawn-isolated');
  for (let i = 0; i < 100; i++) {
    const pos = findGroundSpawnTile(room, rng, { flies: false });
    const { tx, ty } = tileOf(room, pos);
    assert.ok(!(tx === 10 && ty === 2), 'spawned inside the sealed-off pocket');
  }
});

test('findGroundSpawnTile falls back to a nearby acceptable tile when every random attempt fails', () => {
  const room = new Room();
  // Fill almost the whole interior with rocks except one floor tile, so random sampling will usually miss it.
  for (let tx = 2; tx <= 10; tx++) {
    for (let ty = 2; ty <= 4; ty++) {
      if (tx === 9 && ty === 3) continue; // the one gap
      room.placeRock(tx, ty);
    }
  }
  const rng = new Rng('spawn-fallback');
  const pos = findGroundSpawnTile(room, rng, { flies: false });
  const { type } = tileOf(room, pos);
  assert.equal(type, TILE.FLOOR);
});
