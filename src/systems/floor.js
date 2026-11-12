/**
 * Ties a generated floor graph (floorgen.js) to actual Room instances: lazily
 * builds a Room per cell (doors only toward real, non-secret neighbors,
 * template picked by room type/chapter), tracks the current cell, and moves
 * between cells. Secret/super-secret rooms start with no doors at all — a
 * bomb exploding near the shared wall (revealSecretWall) carves one in.
 */
import { Room } from './room.js';
import { applyTemplateToRoom, pickTemplate } from './roomTemplates.js';
import { cellKey, ROOM_TYPE } from './floorgen.js';
import { oppositeSide } from './transitions.js';

const SIDE_OF_DELTA = [
  { side: 'north', dx: 0, dy: -1 },
  { side: 'south', dx: 0, dy: 1 },
  { side: 'east', dx: 1, dy: 0 },
  { side: 'west', dx: -1, dy: 0 },
];

function isSecretType(type) {
  return type === ROOM_TYPE.SECRET || type === ROOM_TYPE.SUPER_SECRET;
}

function doorSidesForCell(floor, cell) {
  if (isSecretType(cell.type)) return []; // only gained via revealSecretWall
  const sides = [];
  for (const { side, dx, dy } of SIDE_OF_DELTA) {
    const neighbor = floor.cells.get(cellKey(cell.x + dx, cell.y + dy));
    if (neighbor && !isSecretType(neighbor.type)) sides.push(side);
  }
  return sides;
}

export class FloorRuntime {
  constructor(floor, templates, rng) {
    this.floor = floor;
    this.templates = templates;
    this.rng = rng;
    this.roomCache = new Map();
    this.visited = new Set();
    this.currentKey = cellKey(floor.startCell.x, floor.startCell.y);
    this.visited.add(this.currentKey);
  }

  _buildRoom(cell) {
    const doorSides = doorSidesForCell(this.floor, cell);
    const room = new Room({ doorSides });
    const template = pickTemplate(this.templates, { type: cell.type, chapter: this.floor.stage, rng: this.rng });
    if (template) applyTemplateToRoom(room, template);
    this._lockKeyDoors(room, cell, doorSides);
    return room;
  }

  /** Treasure/shop doors are key-locked from floor 2 on (CLAUDE.md §4), on the approaching room's side only. */
  _lockKeyDoors(room, cell, doorSides) {
    if (this.floor.stage < 2) return;
    if (cell.type === ROOM_TYPE.TREASURE || cell.type === ROOM_TYPE.SHOP) return;
    for (const { side, dx, dy } of SIDE_OF_DELTA) {
      if (!doorSides.includes(side)) continue;
      const neighbor = this.floor.cells.get(cellKey(cell.x + dx, cell.y + dy));
      if (neighbor && (neighbor.type === ROOM_TYPE.TREASURE || neighbor.type === ROOM_TYPE.SHOP)) {
        room.setDoorKeyLocked(side, true);
      }
    }
  }

  getRoom(key) {
    if (!this.roomCache.has(key)) {
      const cell = this.floor.cells.get(key);
      this.roomCache.set(key, this._buildRoom(cell));
    }
    return this.roomCache.get(key);
  }

  getCurrentRoom() {
    return this.getRoom(this.currentKey);
  }

  getCurrentCell() {
    return this.floor.cells.get(this.currentKey);
  }

  /** Moves to the neighbor in `direction`, only if a (possibly just-revealed) door already exists that way. */
  move(direction) {
    const cell = this.getCurrentCell();
    const delta = SIDE_OF_DELTA.find((d) => d.side === direction);
    const key = cellKey(cell.x + delta.dx, cell.y + delta.dy);
    if (!this.floor.cells.has(key)) return null;
    if (!this.getRoom(this.currentKey).doors.has(direction)) return null;

    this.currentKey = key;
    this.visited.add(key);
    return { room: this.getRoom(key), enteredFrom: oppositeSide(direction) };
  }

  /** If a bomb exploding at (x, y) in the current room lands near a wall shared with a secret room, carves a door both ways. */
  revealSecretWall(x, y) {
    const cell = this.getCurrentCell();
    const room = this.getCurrentRoom();
    const tileSize = room.world.tileGrid.tileSize;

    for (const { side, dx, dy } of SIDE_OF_DELTA) {
      if (room.doors.has(side)) continue;
      const neighborKey = cellKey(cell.x + dx, cell.y + dy);
      const neighbor = this.floor.cells.get(neighborKey);
      if (!neighbor || !isSecretType(neighbor.type)) continue;

      const pos = room.doorPositionForSide(side);
      const center = room.world.tileGrid.tileCenter(pos.tx, pos.ty);
      if (Math.hypot(center.x - x, center.y - y) > tileSize * 2) continue; // [assumed] blast must reach near that wall

      room.addDoorToSide(side);
      this.getRoom(neighborKey).addDoorToSide(oppositeSide(side));
      return { side, neighborKey };
    }
    return null;
  }
}
