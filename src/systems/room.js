/**
 * A single 13x7 room: border walls, up to 4 centered doors, and interior
 * obstacles (rocks = destructible blocks, pits = impassable for grounded
 * entities). Doors lock while any enemy is alive and open permanently once
 * the room is cleared (CLAUDE.md §3).
 */
import { CONFIG } from '../core/config.js';
import { World } from '../engine/world.js';
import { log } from '../core/log.js';

export const TILE = {
  FLOOR: 'floor',
  WALL: 'wall',
  ROCK: 'rock',
  PIT: 'pit',
  DOOR: 'door',
  MOUND: 'mound', // destructible pile: breaks after a few shots, may drop a pickup (P2.Q Q3a)
  TINTED_ROCK: 'tinted_rock', // looks like a rock but drops a guaranteed reward when bombed (P2.Q Q3a)
};

/** Tile types that block both movement and projectiles like a rock does (destructibles included). */
export const ROCK_LIKE = new Set([TILE.ROCK, TILE.MOUND, TILE.TINTED_ROCK]);

export const MOUND_HP = 3; // shots to break a mound (CLAUDE.md: "break in 3-4 hits")

export const DOOR_SIDES = ['north', 'south', 'east', 'west'];

/** P1.G7: how long a door's open/close flash pulse lasts after its lock state actually changes. */
export const DOOR_ANIM_SECONDS = 0.3;

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
    this.tileHp = new Map(); // "tx,ty" -> remaining hits for mounds (P2.Q Q3a)
    this.doors = new Map(); // side -> { tx, ty, locked }
    this.doorAnimTimers = new Map(); // side -> seconds remaining in its open/close flash pulse (P1.G7)
    this.cleared = false;
    this._locked = false;
    this._lockedSeconds = 0;
    this._softlockEscaped = false;
    this.templateId = null; // set by FloorRuntime after applying a template, for softlock-failsafe logging

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
    const doorLocked = door ? door.locked || door.keyLocked : false;
    // Pits block ground-entity movement only. Rocks/mounds/tinted rocks/walls/locked
    // doors block both movement and projectiles. A flier can sit over a pit and still be shot.
    const solid = type === TILE.WALL || ROCK_LIKE.has(type) || type === TILE.PIT || doorLocked;
    const blocksProjectile = type === TILE.WALL || ROCK_LIKE.has(type) || doorLocked;
    this.world.tileGrid.setSolid(tx, ty, solid);
    this.world.tileGrid.setBlocksProjectile(tx, ty, blocksProjectile);
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

  _doorPosition(side) {
    const midX = Math.floor(this.widthTiles / 2);
    const midY = Math.floor(this.heightTiles / 2);
    return {
      north: { tx: midX, ty: 0 },
      south: { tx: midX, ty: this.heightTiles - 1 },
      west: { tx: 0, ty: midY },
      east: { tx: this.widthTiles - 1, ty: midY },
    }[side];
  }

  /** Public accessor for where a door on `side` sits (or would sit, even if not yet carved). */
  doorPositionForSide(side) {
    return this._doorPosition(side);
  }

  _buildDoors(doorSides) {
    for (const side of doorSides) {
      const pos = this._doorPosition(side);
      this.doors.set(side, { ...pos, locked: false, keyLocked: false });
      this.setTileType(pos.tx, pos.ty, TILE.DOOR);
    }
  }

  /** Carves a new door into a side that didn't start with one (e.g. a secret wall revealed by a bomb). Unlocked immediately. */
  addDoorToSide(side) {
    if (this.doors.has(side)) return this.doors.get(side);
    const pos = this._doorPosition(side);
    this.doors.set(side, { ...pos, locked: false, keyLocked: false });
    this.setTileType(pos.tx, pos.ty, TILE.DOOR);
    return this.doors.get(side);
  }

  /** Marks a door as requiring a key to pass (treasure/shop doors from floor 2 on). Re-applies tile solidity. */
  setDoorKeyLocked(side, keyLocked) {
    const door = this.doors.get(side);
    if (!door) return;
    if (door.keyLocked !== keyLocked) this.doorAnimTimers.set(side, DOOR_ANIM_SECONDS);
    door.keyLocked = keyLocked;
    this.setTileType(door.tx, door.ty, TILE.DOOR);
  }

  placeRock(tx, ty) {
    this.setTileType(tx, ty, TILE.ROCK);
  }

  placePit(tx, ty) {
    this.setTileType(tx, ty, TILE.PIT);
  }

  /** Places a destructible mound (breaks after MOUND_HP shots). */
  placeMound(tx, ty, hp = MOUND_HP) {
    this.setTileType(tx, ty, TILE.MOUND);
    this.tileHp.set(this._key(tx, ty), hp);
  }

  /** Places a tinted rock (a rock that drops a guaranteed reward when bombed). */
  placeTintedRock(tx, ty) {
    this.setTileType(tx, ty, TILE.TINTED_ROCK);
  }

  /** Deals `amount` hits to a mound. Returns 'broken' when it's destroyed, 'damaged' when it survives, or null if the tile isn't a mound. */
  damageMound(tx, ty, amount = 1) {
    if (this.getTileType(tx, ty) !== TILE.MOUND) return null;
    const key = this._key(tx, ty);
    const hp = (this.tileHp.get(key) ?? MOUND_HP) - amount;
    if (hp > 0) {
      this.tileHp.set(key, hp);
      return 'damaged';
    }
    this.tileHp.delete(key);
    this.setTileType(tx, ty, TILE.FLOOR);
    return 'broken';
  }

  /** Destroys a rock in place (e.g. from a bomb blast, once bombs exist). Returns true if there was one. */
  destroyRock(tx, ty) {
    if (this.getTileType(tx, ty) !== TILE.ROCK) return false;
    this.setTileType(tx, ty, TILE.FLOOR);
    return true;
  }

  /**
   * Destroys any destructible tile at (tx, ty) from a blast: plain rock, mound, or
   * tinted rock. Returns the destroyed tile type (for the caller to roll drops), or null.
   */
  destroyDestructible(tx, ty) {
    const type = this.getTileType(tx, ty);
    if (!ROCK_LIKE.has(type)) return null;
    this.tileHp.delete(this._key(tx, ty));
    this.setTileType(tx, ty, TILE.FLOOR);
    return type;
  }

  lockDoors() {
    for (const [side, door] of this.doors) {
      if (!door.locked) this.doorAnimTimers.set(side, DOOR_ANIM_SECONDS);
      door.locked = true;
      this.setTileType(door.tx, door.ty, TILE.DOOR);
    }
    this._locked = true;
    this._lockedSeconds = 0;
  }

  openDoors() {
    for (const [side, door] of this.doors) {
      if (door.locked) this.doorAnimTimers.set(side, DOOR_ANIM_SECONDS);
      door.locked = false;
      this.setTileType(door.tx, door.ty, TILE.DOOR);
    }
    this._locked = false;
  }

  /** 0 (just changed) to 1 (settled) fade-out progress for a door's open/close pulse, or null if it's not animating. */
  doorAnimProgress(side) {
    const remaining = this.doorAnimTimers.get(side);
    if (remaining === undefined) return null;
    return 1 - remaining / DOOR_ANIM_SECONDS;
  }

  /**
   * Call once per tick with the frame's dt. Locks doors while enemies live; opens
   * them and marks cleared once they're all dead. Returns true the tick it clears.
   *
   * Failsafe: if a room stays locked for CONFIG.ROOM_SOFTLOCK_TIMEOUT_SECONDS
   * straight (a template/AI bug left every enemy unreachable or unhittable), log
   * the template id and force the doors open so the player is never truly stuck.
   * The room never falsely reports "cleared" in this case — surviving enemies stay
   * alive — it just stops re-locking the exits.
   */
  update(dt = 0) {
    for (const [side, remaining] of this.doorAnimTimers) {
      const next = remaining - dt;
      if (next <= 0) this.doorAnimTimers.delete(side);
      else this.doorAnimTimers.set(side, next);
    }
    if (this.cleared) return false;
    if (this._softlockEscaped) return false;
    const enemiesAlive = this.world.entities.byType('enemy').some((e) => e.alive);
    if (enemiesAlive) {
      if (!this._locked) this.lockDoors();
      this._lockedSeconds += dt;
      if (this._lockedSeconds >= CONFIG.ROOM_SOFTLOCK_TIMEOUT_SECONDS) {
        this._softlockEscaped = true;
        log.warn(
          `room locked ${CONFIG.ROOM_SOFTLOCK_TIMEOUT_SECONDS}s+ with enemies still alive — forcing doors open (template=${this.templateId ?? 'unknown'})`
        );
        this.openDoors();
      }
      return false;
    }
    this.cleared = true;
    this.openDoors();
    return true;
  }
}
