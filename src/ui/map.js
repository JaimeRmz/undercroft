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

const MINIMAP_TYPE_COLORS = {
  start: '#4a90d9',
  normal: '#8a8a8a',
  boss: '#a03030',
  treasure: '#d4af37',
  shop: '#50a050',
  secret: '#884488',
  supersecret: '#442244',
};

/** Canvas-only: draws the icon list computeMinimapIcons produced, as small squares anchored at (x, y). */
export function drawMinimap(ctx, icons, { x = 0, y = 0, cellSize = 10, gap = 2 } = {}) {
  if (icons.length === 0) return;
  const minX = Math.min(...icons.map((i) => i.x));
  const minY = Math.min(...icons.map((i) => i.y));
  for (const icon of icons) {
    const px = x + (icon.x - minX) * (cellSize + gap);
    const py = y + (icon.y - minY) * (cellSize + gap);
    ctx.globalAlpha = icon.state === 'adjacent' ? 0.5 : 1;
    ctx.fillStyle = icon.state === 'adjacent' ? '#333' : MINIMAP_TYPE_COLORS[icon.type] ?? '#666';
    ctx.fillRect(px, py, cellSize, cellSize);
    ctx.globalAlpha = 1;
    if (icon.state === 'current') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, cellSize, cellSize);
    }
  }
}
