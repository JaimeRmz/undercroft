/**
 * Ties a generated floor graph (floorgen.js) to actual Room instances: lazily
 * builds a Room per cell (doors only toward real neighbors, template picked by
 * room type/chapter), tracks the current cell, and moves between cells.
 */
import { Room } from './room.js';
import { applyTemplateToRoom, pickTemplate } from './roomTemplates.js';
import { cellKey } from './floorgen.js';
import { oppositeSide } from './transitions.js';

const SIDE_OF_DELTA = [
  { side: 'north', dx: 0, dy: -1 },
  { side: 'south', dx: 0, dy: 1 },
  { side: 'east', dx: 1, dy: 0 },
  { side: 'west', dx: -1, dy: 0 },
];

function doorSidesForCell(floor, cell) {
  const sides = [];
  for (const { side, dx, dy } of SIDE_OF_DELTA) {
    if (floor.cells.has(cellKey(cell.x + dx, cell.y + dy))) sides.push(side);
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
    return room;
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

  /** Moves to the neighbor in `direction`, if the floor graph has one there. Returns { room, enteredFrom } or null. */
  move(direction) {
    const cell = this.getCurrentCell();
    const delta = SIDE_OF_DELTA.find((d) => d.side === direction);
    const key = cellKey(cell.x + delta.dx, cell.y + delta.dy);
    if (!this.floor.cells.has(key)) return null;

    this.currentKey = key;
    this.visited.add(key);
    return { room: this.getRoom(key), enteredFrom: oppositeSide(direction) };
  }
}
