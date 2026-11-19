/**
 * Picks a safe tile to spawn an enemy on: never a wall/door tile, never a rock
 * (it blocks both movement and shots — an enemy there could never be hit),
 * never a pit for a ground enemy (it can't walk there and would sit wedged in
 * place), and for ground enemies, never a tile the BFS in roomReachability.js
 * can't reach on foot from a door (an isolated pocket a template accidentally
 * created). Flying enemies may spawn over a pit; they just can't spawn on a
 * rock, since rocks block projectiles too.
 */
import { TILE, ROCK_LIKE } from './room.js';
import { computeGroundReachableTiles, isGroundTileReachable } from './roomReachability.js';

const MAX_RANDOM_ATTEMPTS = 30;

function isAcceptable(room, tx, ty, flies, reachable) {
  const type = room.getTileType(tx, ty);
  if (type === TILE.WALL || type === TILE.DOOR || ROCK_LIKE.has(type)) return false;
  if (type === TILE.PIT && !flies) return false;
  if (!flies && !isGroundTileReachable(reachable, tx, ty)) return false;
  return true;
}

/** BFS outward from the room's center for the nearest tile `isAcceptable` allows. */
function nearestAcceptableTile(room, flies, reachable) {
  const start = { tx: Math.floor(room.widthTiles / 2), ty: Math.floor(room.heightTiles / 2) };
  const visited = new Set([`${start.tx},${start.ty}`]);
  const queue = [start];
  while (queue.length > 0) {
    const { tx, ty } = queue.shift();
    if (isAcceptable(room, tx, ty, flies, reachable)) return { tx, ty };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ntx = tx + dx;
      const nty = ty + dy;
      if (ntx < 1 || nty < 1 || ntx >= room.widthTiles - 1 || nty >= room.heightTiles - 1) continue;
      const k = `${ntx},${nty}`;
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push({ tx: ntx, ty: nty });
    }
  }
  return start; // last resort: every interior tile was rejected (shouldn't happen in a valid template)
}

/** Returns a world-space { x, y } center for a tile safe to spawn `flies ? a flier : a ground enemy` on. */
export function findGroundSpawnTile(room, rng, { flies = false } = {}) {
  const reachable = flies ? null : computeGroundReachableTiles(room);
  for (let i = 0; i < MAX_RANDOM_ATTEMPTS; i++) {
    const tx = rng.int(2, room.widthTiles - 3);
    const ty = rng.int(2, room.heightTiles - 3);
    if (isAcceptable(room, tx, ty, flies, reachable)) {
      return room.world.tileGrid.tileCenter(tx, ty);
    }
  }
  const fallback = nearestAcceptableTile(room, flies, reachable);
  return room.world.tileGrid.tileCenter(fallback.tx, fallback.ty);
}
