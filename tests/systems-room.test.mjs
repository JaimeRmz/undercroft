import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, TILE } from '../src/systems/room.js';
import { spawnEnemy } from '../src/systems/enemies.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chase' };

test('room is 13x7 tiles with solid border walls', () => {
  const room = new Room();
  assert.equal(room.widthTiles, 13);
  assert.equal(room.heightTiles, 7);
  assert.ok(room.world.tileGrid.isSolid(0, 0));
  assert.ok(room.world.tileGrid.isSolid(12, 6));
  assert.ok(!room.world.tileGrid.isSolid(6, 3)); // interior floor
});

test('mounds and tinted rocks block movement and projectiles like rocks (P2.Q Q3a)', () => {
  const room = new Room();
  room.placeMound(4, 3);
  room.placeTintedRock(5, 3);
  for (const [tx, ty] of [[4, 3], [5, 3]]) {
    assert.ok(room.world.tileGrid.isSolid(tx, ty), 'destructible blocks movement');
    assert.ok(room.world.tileGrid.isBlockingProjectile(tx, ty), 'destructible blocks projectiles');
  }
});

test('a mound breaks after MOUND_HP hits, turning to floor (P2.Q Q3a)', () => {
  const room = new Room();
  room.placeMound(4, 3);
  assert.equal(room.damageMound(4, 3), 'damaged');
  assert.equal(room.damageMound(4, 3), 'damaged');
  assert.equal(room.damageMound(4, 3), 'broken'); // MOUND_HP = 3
  assert.equal(room.getTileType(4, 3), TILE.FLOOR);
  assert.ok(!room.world.tileGrid.isSolid(4, 3), 'broken mound no longer blocks');
  assert.equal(room.damageMound(4, 3), null, 'damaging empty floor does nothing');
});

test('destroyDestructible clears rocks, mounds and tinted rocks and reports which (P2.Q Q3a)', () => {
  const room = new Room();
  room.placeRock(3, 3);
  room.placeMound(4, 3);
  room.placeTintedRock(5, 3);
  assert.equal(room.destroyDestructible(3, 3), TILE.ROCK);
  assert.equal(room.destroyDestructible(4, 3), TILE.MOUND);
  assert.equal(room.destroyDestructible(5, 3), TILE.TINTED_ROCK);
  assert.equal(room.destroyDestructible(6, 3), null, 'plain floor is not destructible');
  for (const tx of [3, 4, 5]) assert.equal(room.getTileType(tx, 3), TILE.FLOOR);
});

test('spikes are a walkable hazard; fireplaces are a solid hazard (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  room.placeFireplace(5, 3);
  const g = room.world.tileGrid;
  // Spike: hazard but not solid and not projectile-blocking (a tear flies over it).
  assert.ok(g.isHazard(4, 3), 'spike is a hazard');
  assert.ok(!g.isSolid(4, 3), 'spike is walkable');
  assert.ok(!g.isBlockingProjectile(4, 3), 'a tear flies over a spike');
  // Fireplace: hazard AND solid AND projectile-blocking.
  assert.ok(g.isHazard(5, 3), 'fireplace is a hazard');
  assert.ok(g.isSolid(5, 3), 'fireplace blocks movement');
  assert.ok(g.isBlockingProjectile(5, 3), 'fireplace blocks (and is hit by) shots');
});

test('a fireplace extinguishes after FIREPLACE_HP hits, clearing its hazard/solid flags (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeFireplace(4, 3);
  assert.equal(room.damageFireplace(4, 3), 'damaged');
  assert.equal(room.damageFireplace(4, 3), 'damaged');
  assert.equal(room.damageFireplace(4, 3), 'extinguished'); // FIREPLACE_HP = 3
  assert.equal(room.getTileType(4, 3), TILE.FLOOR);
  assert.ok(!room.world.tileGrid.isHazard(4, 3), 'an extinguished fireplace no longer hurts');
  assert.ok(!room.world.tileGrid.isSolid(4, 3), 'an extinguished fireplace no longer blocks');
  assert.equal(room.damageFireplace(4, 3), null, 'dousing empty floor does nothing');
});

test('clearing a spike/fireplace back to floor clears the hazard flag (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  room.setTileType(4, 3, TILE.FLOOR);
  assert.ok(!room.world.tileGrid.isHazard(4, 3));
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

test('a pit blocks ground movement but not projectiles; a rock blocks both', () => {
  const room = new Room();
  room.placePit(4, 3);
  assert.ok(room.world.tileGrid.isSolid(4, 3));
  assert.ok(!room.world.tileGrid.isBlockingProjectile(4, 3), 'a tear should fly over a pit');

  room.placeRock(6, 2);
  assert.ok(room.world.tileGrid.isSolid(6, 2));
  assert.ok(room.world.tileGrid.isBlockingProjectile(6, 2), 'a rock should stop a tear like a wall');

  room.destroyRock(6, 2);
  assert.ok(!room.world.tileGrid.isBlockingProjectile(6, 2));
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

test('softlock failsafe: a room locked 20s+ with an enemy still alive forces its doors open', () => {
  const room = new Room();
  room.templateId = 'core:test-template';
  const center = room.world.tileGrid.tileCenter(6, 3);
  spawnEnemy(room.world, CHASER_DEF, { x: center.x, y: center.y });

  // Under the timeout: still locked, not cleared.
  room.update(10);
  for (const door of room.doors.values()) assert.ok(room.world.tileGrid.isSolid(door.tx, door.ty));
  assert.ok(!room.cleared);

  // Crossing CONFIG.ROOM_SOFTLOCK_TIMEOUT_SECONDS (20) total: doors forced open, even though the enemy is still alive.
  room.update(11);
  for (const door of room.doors.values()) assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
  assert.ok(!room.cleared, 'the room never falsely claims to be cleared just because the failsafe fired');

  // Doors must stay open on later ticks too, instead of immediately re-locking since the enemy is still alive.
  room.update(1);
  for (const door of room.doors.values()) assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
});

test('P1.G7: lockDoors/openDoors only start a door-flash animation on doors whose lock state actually changed', () => {
  const room = new Room();
  // Keep an enemy alive so nothing auto-clears/re-opens the doors via room.update() mid-test.
  const center = room.world.tileGrid.tileCenter(6, 3);
  spawnEnemy(room.world, CHASER_DEF, { x: center.x, y: center.y });

  assert.equal(room.doorAnimProgress('north'), null, 'no animation before any lock-state change');

  room.lockDoors(); // every door goes false -> true: all 4 animate
  for (const side of room.doors.keys()) assert.equal(room.doorAnimProgress(side), 0);

  room.update(0.1); // decays the pulse; doors stay locked (enemy still alive), so lockDoors() isn't re-triggered by update()
  const afterFirstTick = room.doorAnimProgress('north');
  assert.ok(afterFirstTick > 0 && afterFirstTick < 1);

  room.lockDoors(); // already locked: calling again must not restart the animation
  assert.equal(room.doorAnimProgress('north'), afterFirstTick, 're-locking an already-locked door should not reset its pulse');
});

test('P1.G7: a door animation progresses from 0 toward 1 over DOOR_ANIM_SECONDS, then clears', () => {
  const room = new Room();
  // Keep an enemy alive so update()'s own lock/clear logic doesn't flip doors again mid-test.
  const center = room.world.tileGrid.tileCenter(6, 3);
  spawnEnemy(room.world, CHASER_DEF, { x: center.x, y: center.y });
  room.lockDoors();
  assert.equal(room.doorAnimProgress('north'), 0);
  room.update(0.1);
  assert.ok(room.doorAnimProgress('north') > 0 && room.doorAnimProgress('north') < 1);
  room.update(10); // comfortably past DOOR_ANIM_SECONDS (0.3)
  assert.equal(room.doorAnimProgress('north'), null, 'animation should have expired and been cleared');
});

test('P1.G7: setDoorKeyLocked only animates on an actual change, independent of the enemy-lock animation', () => {
  const room = new Room();
  room.setDoorKeyLocked('east', true);
  assert.equal(room.doorAnimProgress('east'), 0);
  room.update(10);
  assert.equal(room.doorAnimProgress('east'), null);

  room.setDoorKeyLocked('east', true); // unchanged: no restart
  assert.equal(room.doorAnimProgress('east'), null);
});

test('softlock failsafe never fires while the room keeps getting cleared/re-locked normally', () => {
  const room = new Room();
  const center = room.world.tileGrid.tileCenter(6, 3);
  const enemy = spawnEnemy(room.world, CHASER_DEF, { x: center.x, y: center.y });
  room.update(5); // locked for 5s, well under the 20s timeout
  enemy.destroy();
  const clearedNow = room.update(0.016);
  assert.ok(clearedNow);
  for (const door of room.doors.values()) assert.ok(!room.world.tileGrid.isSolid(door.tx, door.ty));
});
