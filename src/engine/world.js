/**
 * Shared simulation substrate: a tile grid (solid/open per cell) plus the entity
 * set and spatial hash for a single room. Runs headless — no DOM/canvas here.
 * Systems (player, enemies, projectiles, ...) read/write a World; they never
 * reach into each other directly (CLAUDE.md §2).
 */
import { CONFIG } from '../core/config.js';
import { Entity, EntityManager } from './entity.js';
import { SpatialHash } from './spatialhash.js';
import { resolveCircleVsAabb } from './collision.js';

export class TileGrid {
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.solid = new Uint8Array(width * height);
  }

  index(tx, ty) {
    return ty * this.width + tx;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Out-of-bounds tiles are solid, so entities can't walk off the edge of a room. */
  isSolid(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.solid[this.index(tx, ty)] === 1;
  }

  setSolid(tx, ty, value) {
    if (!this.inBounds(tx, ty)) return;
    this.solid[this.index(tx, ty)] = value ? 1 : 0;
  }

  worldToTile(x, y) {
    return { tx: Math.floor(x / this.tileSize), ty: Math.floor(y / this.tileSize) };
  }

  tileCenter(tx, ty) {
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }
}

/** Resolves a moving circle against every solid tile touching its bounding box. Returns the corrected position. */
export function resolveCircleVsTileGrid(grid, cx, cy, cr) {
  const minTx = Math.floor((cx - cr) / grid.tileSize);
  const maxTx = Math.floor((cx + cr) / grid.tileSize);
  const minTy = Math.floor((cy - cr) / grid.tileSize);
  const maxTy = Math.floor((cy + cr) / grid.tileSize);

  let x = cx;
  let y = cy;
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!grid.isSolid(tx, ty)) continue;
      const minX = tx * grid.tileSize;
      const minY = ty * grid.tileSize;
      const maxX = minX + grid.tileSize;
      const maxY = minY + grid.tileSize;
      const hit = resolveCircleVsAabb(x, y, cr, minX, minY, maxX, maxY);
      if (hit) {
        x += hit.x * hit.overlap;
        y += hit.y * hit.overlap;
      }
    }
  }
  return { x, y };
}

export class World {
  constructor({
    widthTiles = CONFIG.ROOM_TILES_W,
    heightTiles = CONFIG.ROOM_TILES_H,
    tileSize = CONFIG.TILE_SIZE,
  } = {}) {
    this.tileGrid = new TileGrid(widthTiles, heightTiles, tileSize);
    this.entities = new EntityManager();
    this.spatialHash = new SpatialHash(tileSize * 2);
  }

  spawn(type, props) {
    const entity = new Entity(type, props);
    this.entities.add(entity);
    return entity;
  }

  rebuildSpatialHash() {
    this.spatialHash.rebuild(this.entities.all().filter((e) => e.alive));
  }

  queryNearby(x, y, radius) {
    return this.spatialHash.query(x, y, radius);
  }

  /** Mutates entity.x/y to push it out of any overlapping solid tile. */
  resolveTileCollision(entity) {
    const resolved = resolveCircleVsTileGrid(this.tileGrid, entity.x, entity.y, entity.radius);
    entity.x = resolved.x;
    entity.y = resolved.y;
  }

  reap() {
    this.entities.reap();
  }
}
