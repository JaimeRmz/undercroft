/** Draws one room: tiles, decals, entities (via sprite specs), particles, and the HUD. Canvas-only, no game logic. */
import { computeSpriteDrawOps, executeDrawOps, resolveEnemySpec, SPRITES } from './sprites.js';
import {
  isFlashing,
  updateHitFlash,
  playerBlinkAlpha,
  updateSquash,
  squashScale,
  updateWalkBob,
  walkBobOffset,
  updateChampionPulse,
  championPulseScale,
} from './vfx.js';
import { resolveItemIcon, resolveTrinketIcon, resolveCardIcon, resolvePillIcon, drawIcon, drawPedestal } from './contentIcons.js';
import { drawFloorTile, drawWallTile, drawRockTile, drawPitTile, drawDoorTile } from './tiles.js';
import { TILE } from '../systems/room.js';

const PICKUP_LABELS = { heart_full: 'Heart', key: 'Key', bomb: 'Bomb', battery: 'Battery' };
const CHAMPION_RING_COLORS = { cyan: '#4ad8ff', red: '#ff4a4a', green: '#4aff6a', white: '#ffffff', gold: '#f0d060' };

/** Per-chapter palette (CLAUDE.md §3: "each with its own palette"). [assumed] colors — chapter 1 is the original default tint. */
const CHAPTER_PALETTES = {
  1: { floor: '#2b2b33', wall: '#232330', rock: '#5a5248', pit: '#0a0a0c', door: '#443322' },
  2: { floor: '#243128', wall: '#1c2e22', rock: '#4d5a4f', pit: '#070c09', door: '#3a4322' },
};

function paletteForChapter(chapter) {
  return CHAPTER_PALETTES[chapter] ?? CHAPTER_PALETTES[1];
}

export function renderRoom(
  ctx,
  { room, camera, playerHealth, particles, decals, dt, chapter = 1, getItemDef = () => null, getTrinketDef = () => null, getCardDef = () => null }
) {
  // Logical-space draw (main.js applies the integer scale transform); never read ctx.canvas size here.
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);

  const tileColors = paletteForChapter(chapter);
  const tileSize = room.world.tileGrid.tileSize;
  const doorsByTile = new Map();
  for (const door of room.doors.values()) doorsByTile.set(`${door.tx},${door.ty}`, door);

  for (let ty = 0; ty < room.heightTiles; ty++) {
    for (let tx = 0; tx < room.widthTiles; tx++) {
      const type = room.getTileType(tx, ty);
      const screen = camera.worldToScreen(tx * tileSize, ty * tileSize);
      const size = tileSize * camera.zoom;
      if (type === TILE.WALL) drawWallTile(ctx, screen.x, screen.y, size, tileColors.wall);
      else if (type === TILE.ROCK) drawRockTile(ctx, screen.x, screen.y, size, tileColors.rock, tx, ty);
      else if (type === TILE.PIT) drawPitTile(ctx, screen.x, screen.y, size, tileColors.pit);
      else if (type === TILE.DOOR) drawDoorTile(ctx, screen.x, screen.y, size, tileColors.door, doorsByTile.get(`${tx},${ty}`));
      else drawFloorTile(ctx, screen.x, screen.y, size, tileColors.floor, tx, ty);
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
    updateSquash(entity, dt);
    const bobY = walkBobOffset(entity);
    const squash = squashScale(entity);
    const screen = camera.worldToScreen(entity.x, entity.y - (entity.height ?? 0) + bobY);
    executeDrawOps(ctx, computeSpriteDrawOps(spec, facing), {
      x: screen.x,
      y: screen.y,
      scaleX: camera.zoom * squash.x,
      scaleY: camera.zoom * squash.y,
      flashWhite: isFlashing(entity),
    });
  };

  // Entry grace: enemies are drawn translucent while they are inert, so the player can tell they can't act yet.
  const enemyAlpha = room.world.enemyGraceTimer > 0 ? 0.55 : 1;
  for (const enemy of room.world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    ctx.globalAlpha = enemyAlpha;
    drawEntity(enemy, resolveEnemySpec(enemy));
    if (enemy.isChampion) {
      // Champions (P1.G5): a slow-breathing tinted ring around the body, colored by the champion's secondary effect.
      updateChampionPulse(enemy, dt);
      const screen = camera.worldToScreen(enemy.x, enemy.y - (enemy.height ?? 0));
      ctx.strokeStyle = CHAMPION_RING_COLORS[enemy.championColor] ?? '#f0d060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, (enemy.radius ?? 14) * 1.5 * championPulseScale(enemy) * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (const projectile of room.world.entities.byType('projectile')) {
    if (projectile.alive) drawEntity(projectile, projectile.team === 'enemy' ? 'enemyTear' : 'tear');
  }
  const player = room.world.entities.byType('player')[0];
  if (player) {
    // Walk bob (P1.G5): ramps toward full amplitude as the player picks up speed, frozen while still.
    const speed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
    updateWalkBob(player, dt, Math.min(1, speed / 150));
    // I-frame blink: faint/solid toggle (never fully transparent); alpha is always restored.
    ctx.globalAlpha = playerBlinkAlpha(playerHealth?.invulnTimer ?? 0);
    drawEntity(player, 'player', {
      headAngle: Math.atan2(player.facingDir?.y ?? -1, player.facingDir?.x ?? 0),
      bodyAngle: Math.atan2(player.moveDir?.y ?? 1, player.moveDir?.x ?? 0),
    });
    ctx.globalAlpha = 1;
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
    drawIcon(ctx, resolveTrinketIcon(getTrinketDef(pickup.trinketId)), screen.x, screen.y, 8 * camera.zoom);
  }

  for (const pickup of room.world.entities.byType('consumablePickup')) {
    if (!pickup.alive) continue;
    const screen = camera.worldToScreen(pickup.x, pickup.y);
    if (pickup.kind === 'card') {
      drawIcon(ctx, resolveCardIcon(getCardDef(pickup.cardId)), screen.x, screen.y, 9 * camera.zoom);
    } else {
      drawIcon(ctx, resolvePillIcon(pickup.pillColor), screen.x, screen.y, 8 * camera.zoom);
    }
  }

  for (const pedestal of room.world.entities.byType('itemPedestal')) {
    if (!pedestal.alive) continue;
    const screen = camera.worldToScreen(pedestal.x, pedestal.y);
    const icon = resolveItemIcon(getItemDef(pedestal.itemId));
    drawPedestal(ctx, icon, screen.x, screen.y, 9 * camera.zoom);
    drawIcon(ctx, icon, screen.x, screen.y - 2 * camera.zoom, 9 * camera.zoom);
  }

  for (const slot of room.world.entities.byType('shopItem')) {
    if (!slot.alive || slot.sold) continue;
    const screen = camera.worldToScreen(slot.x, slot.y);
    const icon = slot.kind === 'item' ? resolveItemIcon(getItemDef(slot.itemId)) : resolveItemIcon({ id: slot.pickupType, type: 'passive' });
    if (slot.onSale) {
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 15 * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawIcon(ctx, icon, screen.x, screen.y, 11 * camera.zoom);

    // Clear of drawIcon's quality pips (drawn at y - iconSize - 6): stack name above price above pips.
    const iconSize = 11 * camera.zoom;
    const itemDef = slot.kind === 'item' ? getItemDef(slot.itemId) : null;
    const label = slot.kind === 'item' ? itemDef?.name ?? slot.itemId : PICKUP_LABELS[slot.pickupType] ?? slot.pickupType;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, screen.x, screen.y - iconSize - 22);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(`${slot.displayPrice}c`, screen.x, screen.y - iconSize - 10);
    if (slot.onSale) {
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('SALE', screen.x, screen.y + iconSize + 14);
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
