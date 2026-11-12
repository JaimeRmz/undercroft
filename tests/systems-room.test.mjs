import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, TILE } from '../src/systems/room.js';
import { spawnEnemy } from '../src/systems/enemies.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chaser' };

test('room is 13x7 tiles with solid border walls', () => {
  const room = new Room();
  assert.equal(room.widthTiles, 13);
  assert.equal(room.heightTiles, 7);
  assert.ok(room.world.tileGrid.isSolid(0, 0));
  assert.ok(room.world.tileGrid.isSolid(12, 6));
  assert.ok(!room.world.tileGrid.isSolid(6, 3)); // interior floor
});

test('doors are centered on each wall and open (passable) by default', () => {
  const room = new Room();
  assert.deepEqual(room.doors.get('north'), { tx: 6, ty: 0, locked: false, keyLocked: false });
  assert.deepEqual(room.doors.get('south'), { tx: 6, ty: 6, locked: false, keyLocked: false });
  assert.deepEqual(room.doors.get('west'), { tx: 0, ty: 3, locked: false, keyLocked: false });
  assert.deepEqual(room.doors.get('east'), { tx: 12, ty: 3, locked: false, keyLocked: false });
  assert.ok(!room.world.tileGrid.isSolid(6, 0), 'open door should be passable');
});

test('lockDoors makes every door tile solid; openDoors reverses it', () => {
  const room = new Room();
  room.lockDoors();
  for (const door of room.doors.values()) {
    assert.ok(room.world.tileGrid.isSolid(door.tx, door.ty));
  }
  room.openDoors();
  for (const door of room.doors.values()) {
    assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
  }
});

test('placeRock/placePit make a tile solid; destroyRock clears a rock back to floor', () => {
  const room = new Room();
  room.placeRock(5, 3);
  assert.equal(room.getTileType(5, 3), TILE.ROCK);
  assert.ok(room.world.tileGrid.isSolid(5, 3));

  const destroyed = room.destroyRock(5, 3);
  assert.ok(destroyed);
  assert.equal(room.getTileType(5, 3), TILE.FLOOR);
  assert.ok(!room.world.tileGrid.isSolid(5, 3));

  room.placePit(4, 3);
  assert.equal(room.getTileType(4, 3), TILE.PIT);
  assert.ok(room.world.tileGrid.isSolid(4, 3)); // impassable for grounded entities
});

test('destroyRock on a non-rock tile is a no-op and returns false', () => {
  const room = new Room();
  assert.equal(room.destroyRock(6, 3), false); // plain floor
});

test('addDoorToSide carves a passable door on a side that started without one', () => {
  const room = new Room({ doorSides: ['north'] }); // only one door to start
  assert.ok(!room.doors.has('south'));
  const door = room.addDoorToSide('south');
  assert.deepEqual(door, { tx: 6, ty: 6, locked: false, keyLocked: false });
  assert.ok(!room.world.tileGrid.isSolid(6, 6));
  assert.equal(room.getTileType(6, 6), TILE.DOOR);
});

test('addDoorToSide is a no-op if that side already has a door', () => {
  const room = new Room({ doorSides: ['north'] });
  const first = room.addDoorToSide('north');
  const second = room.addDoorToSide('north');
  assert.deepEqual(first, second);
  assert.equal(room.doors.size, 1);
});

test('setDoorKeyLocked makes the door tile solid independently of the enemy lock, and reversible', () => {
  const room = new Room();
  const door = room.doors.get('north');
  room.setDoorKeyLocked('north', true);
  assert.ok(room.world.tileGrid.isSolid(door.tx, door.ty), 'key-locked door should block movement');
  assert.ok(!room._locked, 'key-locking one door should not trip the enemy-lock state');

  room.setDoorKeyLocked('north', false);
  assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
});

test('update() locks doors while an enemy is alive, and opens them once the last one dies', () => {
  const room = new Room();
  const center = room.world.tileGrid.tileCenter(6, 3);
  const enemy = spawnEnemy(room.world, CHASER_DEF, { x: center.x, y: center.y });

  const clearedNow1 = room.update();
  assert.equal(clearedNow1, false);
  assert.ok(room.world.tileGrid.isSolid(room.doors.get('north').tx, room.doors.get('north').ty));
  assert.ok(!room.cleared);

  enemy.destroy();
  const clearedNow2 = room.update();
  assert.equal(clearedNow2, true);
  assert.ok(room.cleared);
  for (const door of room.doors.values()) {
    assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
  }
});

test('a room with no enemies clears immediately on the first update()', () => {
  const room = new Room();
  const clearedNow = room.update();
  assert.equal(clearedNow, true);
  assert.ok(room.cleared);
});

test('once cleared, update() stays idempotent (doors remain open, no re-locking)', () => {
  const room = new Room();
  room.update(); // clears immediately, no enemies
  assert.equal(room.update(), false);
  assert.ok(!room.world.tileGrid.isSolid(room.doors.get('south').tx, room.doors.get('south').ty));
});
