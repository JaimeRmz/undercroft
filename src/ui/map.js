/**
 * Minimap icon computation: which cells to show and in what state
 * (visited/adjacent/current), given the floor graph and the set of visited
 * cell keys. Secret/super-secret rooms stay hidden until entered; other
 * undiscovered rooms (not visited, not adjacent to a visited room) stay
 * hidden too, matching the reference game's fog of war. Pure — no drawing.
 */
import { cellKey, areAdjacent, ROOM_TYPE } from '../systems/floorgen.js';

function isAdjacentToAnyVisited(cell, visited) {
  for (const vk of visited) {
    const [vx, vy] = vk.split(',').map(Number);
    if (areAdjacent(cell, { x: vx, y: vy })) return true;
  }
  return false;
}

export function computeMinimapIcons(floor, { visited = new Set(), currentKey = null } = {}) {
  const icons = [];
  for (const cell of floor.cells.values()) {
    const key = cellKey(cell.x, cell.y);
    const isSecret = cell.type === ROOM_TYPE.SECRET || cell.type === ROOM_TYPE.SUPER_SECRET;
    const isVisited = visited.has(key);

    if (!isVisited && isSecret) continue;
    if (!isVisited && !isAdjacentToAnyVisited(cell, visited)) continue;

    const state = key === currentKey ? 'current' : isVisited ? 'visited' : 'adjacent';
    icons.push({ x: cell.x, y: cell.y, type: cell.type, state });
  }
  return icons;
}
