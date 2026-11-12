/** Uniform grid broad-phase for circle-vs-circle queries, so collision checks don't go O(n^2). */
export class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _cellCoord(v) {
    return Math.floor(v / this.cellSize);
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(entity) {
    const minCx = this._cellCoord(entity.x - entity.radius);
    const maxCx = this._cellCoord(entity.x + entity.radius);
    const minCy = this._cellCoord(entity.y - entity.radius);
    const maxCy = this._cellCoord(entity.y + entity.radius);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = this._key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  rebuild(entities) {
    this.clear();
    for (const entity of entities) this.insert(entity);
  }

  /** Returns every entity whose insertion cells overlap a query circle (deduplicated, may include false positives). */
  query(x, y, radius) {
    const minCx = this._cellCoord(x - radius);
    const maxCx = this._cellCoord(x + radius);
    const minCy = this._cellCoord(y - radius);
    const maxCy = this._cellCoord(y + radius);
    const seen = new Set();
    const results = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (const entity of bucket) {
          if (seen.has(entity)) continue;
          seen.add(entity);
          results.push(entity);
        }
      }
    }
    return results;
  }
}
