/**
 * A single 13x7 room: border walls, up to 4 centered doors, and interior
 * obstacles (rocks = destructible blocks, pits = impassable for grounded
 * entities). Doors lock while any enemy is alive and open permanently once
 * the room is cleared (CLAUDE.md §3).
 */
import { CONFIG } from '../core/config.js';
import { World } from '../engine/world.js';

export const TILE = {
  FLOOR: 'floor',
  WALL: 'wall',
  ROCK: 'rock',
  PIT: 'pit',
  DOOR: 'door',
};

export const DOOR_SIDES = ['north', 'south', 'east', 'west'];

export class Room {
  constructor({
    widthTiles = CONFIG.ROOM_TILES_W,
    heightTiles = CONFIG.ROOM_TILES_H,
    tileSize = CONFIG.TILE_SIZE,
    doorSides = DOOR_SIDES,
  } = {}) {
    this.world = new World({ widthTiles, heightTiles, tileSize });
    this.widthTiles = widthTiles;
    this.heightTiles = heightTiles;
    this.tileTypes = new Map();
    this.doors = new Map(); // side -> { tx, ty, locked }
    this.cleared = false;
    this._locked = false;

    this._buildWalls();
    this._buildDoors(doorSides);
  }

  _key(tx, ty) {
    return `${tx},${ty}`;
  }

  _doorAt(tx, ty) {
    for (const door of this.doors.values()) {
      if (door.tx === tx && door.ty === ty) return door;
    }
    return null;
  }

  setTileType(tx, ty, type) {
    this.tileTypes.set(this._key(tx, ty), type);
    const door = type === TILE.DOOR ? this._doorAt(tx, ty) : null;
    const solid = type === TILE.WALL || type === TILE.ROCK || type === TILE.PIT || (door ? door.locked : false);
    this.world.tileGrid.setSolid(tx, ty, solid);
  }

  getTileType(tx, ty) {
    return this.tileTypes.get(this._key(tx, ty)) ?? TILE.FLOOR;
  }

  _buildWalls() {
    for (let ty = 0; ty < this.heightTiles; ty++) {
      for (let tx = 0; tx < this.widthTiles; tx++) {
        const isBorder = tx === 0 || ty === 0 || tx === this.widthTiles - 1 || ty === this.heightTiles - 1;
        this.setTileType(tx, ty, isBorder ? TILE.WALL : TILE.FLOOR);
      }
    }
  }

  _buildDoors(doorSides) {
    const midX = Math.floor(this.widthTiles / 2);
    const midY = Math.floor(this.heightTiles / 2);
    const positions = {
      north: { tx: midX, ty: 0 },
      south: { tx: midX, ty: this.heightTiles - 1 },
      west: { tx: 0, ty: midY },
      east: { tx: this.widthTiles - 1, ty: midY },
    };
    for (const side of doorSides) {
      const pos = positions[side];
      this.doors.set(side, { ...pos, locked: false });
      this.setTileType(pos.tx, pos.ty, TILE.DOOR);
    }
  }

  placeRock(tx, ty) {
    this.setTileType(tx, ty, TILE.ROCK);
  }

  placePit(tx, ty) {
    this.setTileType(tx, ty, TILE.PIT);
  }

  /** Destroys a rock in place (e.g. from a bomb blast, once bombs exist). Returns true if there was one. */
  destroyRock(tx, ty) {
    if (this.getTileType(tx, ty) !== TILE.ROCK) return false;
    this.setTileType(tx, ty, TILE.FLOOR);
    return true;
  }

  lockDoors() {
    for (const door of this.doors.values()) {
      door.locked = true;
      this.setTileType(door.tx, door.ty, TILE.DOOR);
    }
    this._locked = true;
  }

  openDoors() {
    for (const door of this.doors.values()) {
      door.locked = false;
      this.setTileType(door.tx, door.ty, TILE.DOOR);
    }
    this._locked = false;
  }

  /** Call once per tick. Locks doors while enemies live; opens them and marks cleared once they're all dead. Returns true the tick it clears. */
  update() {
    if (this.cleared) return false;
    const enemiesAlive = this.world.entities.byType('enemy').some((e) => e.alive);
    if (enemiesAlive) {
      if (!this._locked) this.lockDoors();
      return false;
    }
    this.cleared = true;
    this.openDoors();
    return true;
  }
}
