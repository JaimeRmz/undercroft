/**
 * Ground-entity tile reachability within a single Room: a BFS over tiles a
 * walking (non-flying) entity could cross, starting from every door. Used to
 * (a) validate room templates never bisect their doors into sealed pockets,
 * and (b) keep enemy spawn placement off any pit/rock/unreachable tile.
 */
import { TILE, ROCK_LIKE } from './room.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function key(tx, ty) {
  return `${tx},${ty}`;
}

/** Single-source BFS: every tile on foot reachable from (startTx, startTy) (floor/door tiles only). */
function bfsFrom(room, startTx, startTy) {
  const visited = new Set();
  const queue = [{ tx: startTx, ty: startTy }];
  while (queue.length > 0) {
    const { tx, ty } = queue.shift();
    const k = key(tx, ty);
    if (visited.has(k)) continue;
    const type = room.getTileType(tx, ty);
    if (type === TILE.WALL || ROCK_LIKE.has(type) || type === TILE.PIT) continue;
    visited.add(k);
    for (const [dx, dy] of DIRS) {
      const ntx = tx + dx;
      const nty = ty + dy;
      if (ntx < 0 || nty < 0 || ntx >= room.widthTiles || nty >= room.heightTiles) continue;
      queue.push({ tx: ntx, ty: nty });
    }
  }
  return visited;
}

/**
 * Returns a Set of "tx,ty" keys reachable on foot from *some* door (the union of a
 * single-source BFS per door). Good enough for "is this a safe enemy-spawn tile" —
 * in any template that passes `areDoorsMutuallyReachable`, every door's reachable
 * set is the same connected region anyway.
 */
export function computeGroundReachableTiles(room) {
  const union = new Set();
  for (const door of room.doors.values()) {
    for (const k of bfsFrom(room, door.tx, door.ty)) union.add(k);
  }
  return union;
}

export function isGroundTileReachable(reachableSet, tx, ty) {
  return reachableSet.has(key(tx, ty));
}

/** True if every one of the room's own doors is on foot reachable from every other one. */
export function areDoorsMutuallyReachable(room) {
  const doors = Array.from(room.doors.values());
  if (doors.length <= 1) return true;
  const reachableFromFirst = bfsFrom(room, doors[0].tx, doors[0].ty);
  return doors.every((d) => reachableFromFirst.has(key(d.tx, d.ty)));
}
