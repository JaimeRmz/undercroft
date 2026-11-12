/** Draws one room: tiles, decals, entities (via sprite specs), particles, and the HUD. Canvas-only, no game logic. */
import { computeSpriteDrawOps, executeDrawOps, SPRITES } from './sprites.js';
import { drawHud } from '../ui/hud.js';
import { isFlashing, updateHitFlash } from './vfx.js';

const TILE_COLORS = {
  floor: '#2b2b33',
  wall: '#15151a',
  rock: '#5a5248',
  pit: '#0a0a0c',
  door: '#443322',
};

export function renderRoom(ctx, { room, camera, playerHealth, particles, decals, dt }) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const tileSize = room.world.tileGrid.tileSize;
  for (let ty = 0; ty < room.heightTiles; ty++) {
    for (let tx = 0; tx < room.widthTiles; tx++) {
      const type = room.getTileType(tx, ty);
      const screen = camera.worldToScreen(tx * tileSize, ty * tileSize);
      ctx.fillStyle = TILE_COLORS[type] ?? '#222';
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

  const drawEntity = (entity, spriteKey) => {
    const spec = SPRITES[spriteKey];
    if (!spec) return;
    updateHitFlash(entity, dt);
    const screen = camera.worldToScreen(entity.x, entity.y - (entity.height ?? 0));
    executeDrawOps(ctx, computeSpriteDrawOps(spec), {
      x: screen.x,
      y: screen.y,
      scale: camera.zoom,
      flashWhite: isFlashing(entity),
    });
  };

  for (const enemy of room.world.entities.byType('enemy')) {
    if (enemy.alive) drawEntity(enemy, enemy.defId);
  }
  for (const projectile of room.world.entities.byType('projectile')) {
    if (projectile.alive) drawEntity(projectile, 'tear');
  }
  const player = room.world.entities.byType('player')[0];
  if (player) drawEntity(player, 'player');

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

  for (const pedestal of room.world.entities.byType('itemPedestal')) {
    if (!pedestal.alive) continue;
    const screen = camera.worldToScreen(pedestal.x, pedestal.y);
    ctx.fillStyle = '#6a4aa0';
    ctx.fillRect(screen.x - 10 * camera.zoom, screen.y - 10 * camera.zoom, 20 * camera.zoom, 20 * camera.zoom);
    ctx.strokeStyle = '#e0d0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x - 10 * camera.zoom, screen.y - 10 * camera.zoom, 20 * camera.zoom, 20 * camera.zoom);
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

  if (playerHealth) drawHud(ctx, playerHealth, { x: 16, y: 16 });
}
