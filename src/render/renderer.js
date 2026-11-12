/** Draws one room: tiles, decals, entities (via sprite specs), particles, and the HUD. Canvas-only, no game logic. */
import { computeSpriteDrawOps, executeDrawOps, resolveEnemySpec, SPRITES } from './sprites.js';
import { isFlashing, updateHitFlash } from './vfx.js';

/** Per-chapter palette (CLAUDE.md §3: "each with its own palette"). [assumed] colors — chapter 1 is the original default tint. */
const CHAPTER_PALETTES = {
  1: { floor: '#2b2b33', wall: '#15151a', rock: '#5a5248', pit: '#0a0a0c', door: '#443322' },
  2: { floor: '#243128', wall: '#111c16', rock: '#4d5a4f', pit: '#070c09', door: '#3a4322' },
};

function paletteForChapter(chapter) {
  return CHAPTER_PALETTES[chapter] ?? CHAPTER_PALETTES[1];
}

export function renderRoom(ctx, { room, camera, playerHealth, particles, decals, dt, chapter = 1 }) {
  // Logical-space draw (main.js applies the integer scale transform); never read ctx.canvas size here.
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);

  const tileColors = paletteForChapter(chapter);
  const tileSize = room.world.tileGrid.tileSize;
  for (let ty = 0; ty < room.heightTiles; ty++) {
    for (let tx = 0; tx < room.widthTiles; tx++) {
      const type = room.getTileType(tx, ty);
      const screen = camera.worldToScreen(tx * tileSize, ty * tileSize);
      ctx.fillStyle = tileColors[type] ?? '#222';
      ctx.fillRect(screen.x, screen.y, tileSize * camera.zoom, tileSize * camera.zoom);
    }
  }

  for (const decal of decals.decals) {
    const screen = camera.worldToScreen(decal.x, decal.y);
    ctx.beginPath();
    ctx.fillStyle = decal.color ?? '#5a1a1a';
    ctx.globalAlpha = decal.alpha ?? 0.6;
    ctx.arc(screen.x, screen.y, decal.size ?? 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const drawEntity = (entity, spriteKey, facing = {}) => {
    const spec = typeof spriteKey === 'string' ? SPRITES[spriteKey] : spriteKey;
    if (!spec) return;
    updateHitFlash(entity, dt);
    const screen = camera.worldToScreen(entity.x, entity.y - (entity.height ?? 0));
    executeDrawOps(ctx, computeSpriteDrawOps(spec, facing), {
      x: screen.x,
      y: screen.y,
      scale: camera.zoom,
      flashWhite: isFlashing(entity),
    });
  };

  for (const enemy of room.world.entities.byType('enemy')) {
    if (enemy.alive) drawEntity(enemy, resolveEnemySpec(enemy));
  }
  for (const projectile of room.world.entities.byType('projectile')) {
    if (projectile.alive) drawEntity(projectile, 'tear');
  }
  const player = room.world.entities.byType('player')[0];
  if (player) {
    drawEntity(player, 'player', {
      headAngle: Math.atan2(player.facingDir?.y ?? -1, player.facingDir?.x ?? 0),
      bodyAngle: Math.atan2(player.moveDir?.y ?? 1, player.moveDir?.x ?? 0),
    });
  }

  const PICKUP_COLORS = {
    coin: '#d4af37',
    key: '#c0c0c0',
    bomb: '#444',
    heart_half: '#c0283c',
    heart_full: '#c0283c',
    heart_soul: '#8fd0ff',
    heart_black: '#4a3a5a',
    battery: '#e8a030',
    chest: '#8a5a2a',
    chest_locked: '#5a3a1a',
  };
  for (const pickup of room.world.entities.byType('pickup')) {
    if (!pickup.alive) continue;
    const screen = camera.worldToScreen(pickup.x, pickup.y);
    ctx.fillStyle = PICKUP_COLORS[pickup.pickupType] ?? '#999';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 8 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pickup of room.world.entities.byType('trinketPickup')) {
    if (!pickup.alive) continue;
    const screen = camera.worldToScreen(pickup.x, pickup.y);
    const r = 8 * camera.zoom;
    ctx.fillStyle = '#c08a3a';
    ctx.fillRect(screen.x - r, screen.y - r, r * 2, r * 2);
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x - r, screen.y - r, r * 2, r * 2);
  }

  for (const pickup of room.world.entities.byType('consumablePickup')) {
    if (!pickup.alive) continue;
    const screen = camera.worldToScreen(pickup.x, pickup.y);
    if (pickup.kind === 'card') {
      ctx.fillStyle = '#e8e4d0';
      ctx.fillRect(screen.x - 7 * camera.zoom, screen.y - 10 * camera.zoom, 14 * camera.zoom, 20 * camera.zoom);
      ctx.strokeStyle = '#3a6a8a';
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x - 7 * camera.zoom, screen.y - 10 * camera.zoom, 14 * camera.zoom, 20 * camera.zoom);
    } else {
      ctx.fillStyle = pickup.pillColor ?? '#ddd';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 8 * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  for (const pedestal of room.world.entities.byType('itemPedestal')) {
    if (!pedestal.alive) continue;
    const screen = camera.worldToScreen(pedestal.x, pedestal.y);
    ctx.fillStyle = '#6a4aa0';
    ctx.fillRect(screen.x - 10 * camera.zoom, screen.y - 10 * camera.zoom, 20 * camera.zoom, 20 * camera.zoom);
    ctx.strokeStyle = '#e0d0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x - 10 * camera.zoom, screen.y - 10 * camera.zoom, 20 * camera.zoom, 20 * camera.zoom);
  }

  for (const slot of room.world.entities.byType('shopItem')) {
    if (!slot.alive || slot.sold) continue;
    const screen = camera.worldToScreen(slot.x, slot.y);
    ctx.fillStyle = slot.kind === 'item' ? '#6a4aa0' : '#d4af37';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 12 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = slot.onSale ? '#ff5050' : '#e0d0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${slot.displayPrice}c`, screen.x, screen.y - 18 * camera.zoom);
    if (slot.onSale) {
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('SALE', screen.x, screen.y - 30 * camera.zoom);
    }
  }

  for (const trapdoor of room.world.entities.byType('trapdoor')) {
    if (!trapdoor.alive) continue;
    const screen = camera.worldToScreen(trapdoor.x, trapdoor.y);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, trapdoor.radius * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  for (const bomb of room.world.entities.byType('bomb')) {
    if (!bomb.alive) continue;
    const screen = camera.worldToScreen(bomb.x, bomb.y);
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 10 * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = bomb.fuse < 0.5 ? '#ff4040' : '#aaa';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const p of particles.particles) {
    if (!p.alive) continue;
    const screen = camera.worldToScreen(p.x, p.y);
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

}
