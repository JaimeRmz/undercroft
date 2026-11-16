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
    room.templateId = template?.id ?? null;
    this._lockKeyDoors(room, cell, doorSides);
    this._tagDoorDestinations(room, cell, doorSides);
    return room;
  }

  /** Tags each door with the room type on its far side (rendering only: lets a door read as "treasure"/"shop"/"boss" before it's even opened). */
  _tagDoorDestinations(room, cell, doorSides) {
    for (const { side, dx, dy } of SIDE_OF_DELTA) {
      if (!doorSides.includes(side)) continue;
      const neighbor = this.floor.cells.get(cellKey(cell.x + dx, cell.y + dy));
      const door = room.doors.get(side);
      if (door && neighbor) door.leadsToType = neighbor.type;
    }
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

  /** Looks at the cell in `direction` from the current one, without moving there (null if there's nothing that way). */
  peekNeighborCell(direction) {
    const cell = this.getCurrentCell();
    const delta = SIDE_OF_DELTA.find((d) => d.side === direction);
    return this.floor.cells.get(cellKey(cell.x + delta.dx, cell.y + delta.dy)) ?? null;
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

  /**
   * Attaches a brand-new cell of `type` (devil/angel) to a free side of the
   * current room, with a real door carved both ways immediately — unlike
   * secret rooms, a deal room is meant to be seen and walked into right away
   * once the boss is dead. Returns the new cell's key, or null if the current
   * room has no free wall left (every side already has a door or neighbor).
   */
  attachBonusRoom(type) {
    const cell = this.getCurrentCell();
    const room = this.getCurrentRoom();
    for (const { side, dx, dy } of SIDE_OF_DELTA) {
      if (room.doors.has(side)) continue;
      const key = cellKey(cell.x + dx, cell.y + dy);
      if (this.floor.cells.has(key)) continue;

      const newCell = { x: cell.x + dx, y: cell.y + dy, type, depth: null };
      this.floor.cells.set(key, newCell);
      room.addDoorToSide(side);
      this.getRoom(key).addDoorToSide(oppositeSide(side));
      return key;
    }
    return null;
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
