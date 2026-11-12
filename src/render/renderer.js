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
