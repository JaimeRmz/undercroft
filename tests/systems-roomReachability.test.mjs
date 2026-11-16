import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, TILE } from '../src/systems/room.js';
import { applyTemplateToRoom } from '../src/systems/roomTemplates.js';
import { computeGroundReachableTiles, isGroundTileReachable, areDoorsMutuallyReachable } from '../src/systems/roomReachability.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOMS_DIR = path.join(__dirname, '..', 'mods', 'core', 'rooms');

test('computeGroundReachableTiles reaches every open floor tile from the doors in a plain room', () => {
  const room = new Room();
  const reachable = computeGroundReachableTiles(room);
  assert.ok(isGroundTileReachable(reachable, 6, 3)); // interior center
  for (const door of room.doors.values()) assert.ok(isGroundTileReachable(reachable, door.tx, door.ty));
});

test('areDoorsMutuallyReachable is false when a wall of rocks bisects the room, true once there is a gap', () => {
  const room = new Room({ doorSides: ['west', 'east'] }); // doors sit on row ty=3 only
  for (let ty = 1; ty <= 5; ty++) room.placeRock(6, ty); // seals off the whole column 6, including the door row
  assert.equal(areDoorsMutuallyReachable(room), false);

  room.destroyRock(6, 3); // reopen just the door row
  assert.equal(areDoorsMutuallyReachable(room), true);
});

test('a pit-only bisection also breaks reachability (pits block ground movement just like rocks)', () => {
  const room = new Room({ doorSides: ['west', 'east'] });
  for (let ty = 1; ty <= 5; ty++) room.placePit(6, ty);
  assert.equal(areDoorsMutuallyReachable(room), false);
});

test('every mods/core/rooms/*.json template keeps all 4 doors mutually reachable on foot', () => {
  const files = fs.readdirSync(ROOMS_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'expected room template JSON files to exist');
  const failures = [];
  for (const file of files) {
    const template = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, file), 'utf-8'));
    const room = new Room(); // all 4 doors present, to validate the template in the worst case
    applyTemplateToRoom(room, template);
    if (!areDoorsMutuallyReachable(room)) failures.push(template.id ?? file);
  }
  assert.deepEqual(failures, [], `templates with unreachable doors: ${failures.join(', ')}`);
});
