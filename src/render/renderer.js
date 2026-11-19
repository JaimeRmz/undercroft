/** Draws one room: tiles, decals, entities (via sprite specs), particles, and the HUD. Canvas-only, no game logic. */
import { computeSpriteDrawOps, executeDrawOps, resolveEnemySpec, resolveFamiliarSpec, SPRITES } from './sprites.js';
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
  updateHurtTint,
  hurtTintAlpha,
} from './vfx.js';
import { resolveItemIcon, resolveTrinketIcon, resolveCardIcon, resolvePillIcon, drawIcon, drawPedestal } from './contentIcons.js';
import { drawFloorTile, drawWallTile, drawRockTile, drawMoundTile, drawTintedRockTile, drawSpikeTile, drawFireplaceTile, drawPitTile, drawDoorTile } from './tiles.js';
import { drawEnemyTelegraph, drawBossTelegraph } from './telegraphs.js';
import { drawTear } from './tears.js';
import { drawPickup } from './pickups.js';
import { TILE, MOUND_HP, FIREPLACE_HP } from '../systems/room.js';

const PICKUP_LABELS = { heart_full: 'Heart', key: 'Key', bomb: 'Bomb', battery: 'Battery' };
const CHAMPION_RING_COLORS = { cyan: '#4ad8ff', red: '#ff4a4a', green: '#4aff6a', white: '#ffffff', gold: '#f0d060' };

/** Per-chapter palette (CLAUDE.md §3: "each with its own palette"). [assumed] colors — chapter 1 is the original default tint. */
const CHAPTER_PALETTES = {
  1: { floor: '#2b2b33', wall: '#232330', rock: '#5a5248', pit: '#0a0a0c', door: '#443322' },
  2: { floor: '#243128', wall: '#1c2e22', rock: '#4d5a4f', pit: '#070c09', door: '#3a4322' },
  3: { floor: '#332424', wall: '#2a1c1c', rock: '#5a4040', pit: '#0c0606', door: '#4a2a1e' },
  4: { floor: '#232633', wall: '#1b1e2a', rock: '#454d5e', pit: '#06070c', door: '#2e3a4a' },
  5: { floor: '#2c2030', wall: '#231a28', rock: '#52405a', pit: '#0a060c', door: '#4a2244' },
};

function paletteForChapter(chapter) {
  return CHAPTER_PALETTES[chapter] ?? CHAPTER_PALETTES[1];
}

// Cosmetic clock advanced each frame, used for the fireplace flame wobble (P2.Q Q3b).
let fireClock = 0;

export function renderRoom(
  ctx,
  { room, camera, playerHealth, particles, decals, dt, chapter = 1, getItemDef = () => null, getTrinketDef = () => null, getCardDef = () => null }
) {
  // Logical-space draw (main.js applies the integer scale transform); never read ctx.canvas size here.
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);

  fireClock += dt ?? 0;
  const flameFlicker = 0.5 + 0.5 * Math.sin(fireClock * 11);
  const tileColors = paletteForChapter(chapter);
  const tileSize = room.world.tileGrid.tileSize;
  const doorsByTile = new Map();
  const doorSideByTile = new Map();
  for (const [side, door] of room.doors) {
    doorsByTile.set(`${door.tx},${door.ty}`, door);
    doorSideByTile.set(`${door.tx},${door.ty}`, side);
  }

  for (let ty = 0; ty < room.heightTiles; ty++) {
    for (let tx = 0; tx < room.widthTiles; tx++) {
      const type = room.getTileType(tx, ty);
      const screen = camera.worldToScreen(tx * tileSize, ty * tileSize);
      const size = tileSize * camera.zoom;
      if (type === TILE.WALL) drawWallTile(ctx, screen.x, screen.y, size, tileColors.wall);
      else if (type === TILE.ROCK) drawRockTile(ctx, screen.x, screen.y, size, tileColors.rock, tx, ty);
      else if (type === TILE.MOUND) {
        drawFloorTile(ctx, screen.x, screen.y, size, tileColors.floor, tx, ty);
        drawMoundTile(ctx, screen.x, screen.y, size, tileColors.rock, (room.tileHp.get(`${tx},${ty}`) ?? MOUND_HP) / MOUND_HP);
      } else if (type === TILE.TINTED_ROCK) drawTintedRockTile(ctx, screen.x, screen.y, size, tileColors.rock);
      else if (type === TILE.SPIKE) drawSpikeTile(ctx, screen.x, screen.y, size, tileColors.floor, tx, ty);
      else if (type === TILE.FIREPLACE) {
        drawFireplaceTile(ctx, screen.x, screen.y, size, tileColors.floor, flameFlicker, (room.tileHp.get(`${tx},${ty}`) ?? FIREPLACE_HP) / FIREPLACE_HP, tx, ty);
      } else if (type === TILE.PIT) drawPitTile(ctx, screen.x, screen.y, size, tileColors.pit);
      else if (type === TILE.DOOR) {
        const door = doorsByTile.get(`${tx},${ty}`);
        const pulse = door ? room.doorAnimProgress(doorSideByTile.get(`${tx},${ty}`)) : null;
        drawDoorTile(ctx, screen.x, screen.y, size, tileColors.door, door, pulse);
      } else drawFloorTile(ctx, screen.x, screen.y, size, tileColors.floor, tx, ty);
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

  const player = room.world.entities.byType('player')[0];

  // Entry grace: enemies are drawn translucent while they are inert, so the player can tell they can't act yet.
  const enemyAlpha = room.world.enemyGraceTimer > 0 ? 0.55 : 1;
  for (const enemy of room.world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    ctx.globalAlpha = enemyAlpha;
    drawEntity(enemy, resolveEnemySpec(enemy));
    const screen = camera.worldToScreen(enemy.x, enemy.y - (enemy.height ?? 0));
    if (enemy.isChampion) {
      // Champions (P1.G5): a slow-breathing tinted ring around the body, colored by the champion's secondary effect.
      updateChampionPulse(enemy, dt);
      ctx.strokeStyle = CHAMPION_RING_COLORS[enemy.championColor] ?? '#f0d060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, (enemy.radius ?? 14) * 1.5 * championPulseScale(enemy) * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Attack wind-ups (P1.G6): a growing warning ring, plus a line/area preview for shaped attacks.
    if (enemy.isBoss) drawBossTelegraph(ctx, enemy, player, screen, camera.zoom);
    else drawEnemyTelegraph(ctx, enemy, screen, camera.zoom);
    ctx.globalAlpha = 1;
  }
  for (const projectile of room.world.entities.byType('projectile')) {
    if (projectile.alive) drawTear(ctx, projectile, camera);
  }
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

    // Hurt tint (P2.Q Q2a): a brief red wash over the player's body when it takes damage.
    updateHurtTint(player, dt);
    const tint = hurtTintAlpha(player);
    if (tint > 0) {
      const hurtScreen = camera.worldToScreen(player.x, player.y - (player.height ?? 0) + walkBobOffset(player));
      ctx.globalAlpha = tint;
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath();
      ctx.arc(hurtScreen.x, hurtScreen.y, (player.radius ?? 14) * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Item-get pose (P2.Q Q2b): the player raises the just-picked-up item overhead for ~1s.
    if (player.itemHold?.timer > 0) {
      player.itemHold.timer = Math.max(0, player.itemHold.timer - dt);
      const hold = player.itemHold;
      const riseFrac = Math.min(1, (hold.duration - hold.timer) / 0.2); // quick rise over the first 0.2s, then held
      const screen = camera.worldToScreen(player.x, player.y - (player.height ?? 0));
      const iconR = 11 * camera.zoom;
      const iconY = screen.y - ((player.radius ?? 14) + 14 + riseFrac * 12) * camera.zoom;
      const def = getItemDef(hold.id);
      if (def) {
        // Soft glow backing so the held item reads clearly over any familiars/clutter above the player.
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath();
        ctx.arc(screen.x, iconY, iconR * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        drawIcon(ctx, resolveItemIcon(def), screen.x, iconY, iconR);
      }
    }

    // Transformation costumes (P2.5): one stacked ring per active transformation, same
    // "tinted ring around the body" language as a champion enemy's tint, just on the player.
    const playerScreen = camera.worldToScreen(player.x, player.y - (player.height ?? 0));
    (player.transformCostumes ?? []).forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(playerScreen.x, playerScreen.y, ((player.radius ?? 14) + 4 + i * 4) * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  for (const familiar of room.world.entities.byType('familiar')) {
    if (familiar.alive) drawEntity(familiar, resolveFamiliarSpec(familiar));
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
    // Pop-in bounce + coin spin/glint + heart pulse (P2.Q Q2c).
    drawPickup(ctx, pickup, camera, dt, PICKUP_COLORS[pickup.pickupType] ?? '#999');
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

  for (const slot of room.world.entities.byType('devilItem')) {
    if (!slot.alive || slot.bought) continue;
    const screen = camera.worldToScreen(slot.x, slot.y);
    const icon = resolveItemIcon(getItemDef(slot.itemId));
    ctx.strokeStyle = '#a02020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 15 * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
    drawIcon(ctx, icon, screen.x, screen.y, 11 * camera.zoom);
    const itemDef = getItemDef(slot.itemId);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(itemDef?.name ?? slot.itemId, screen.x, screen.y - 11 * camera.zoom - 22);
    ctx.fillStyle = '#ff6060';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('♥ heart', screen.x, screen.y - 11 * camera.zoom - 10);
  }

  for (const spike of room.world.entities.byType('sacrificeSpike')) {
    if (!spike.alive) continue;
    const screen = camera.worldToScreen(spike.x, spike.y);
    const r = spike.radius * camera.zoom;
    ctx.fillStyle = '#3a0a14';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c04040';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(screen.x + Math.cos(angle) * r * 0.4, screen.y + Math.sin(angle) * r * 0.4);
      ctx.lineTo(screen.x + Math.cos(angle) * r * 1.3, screen.y + Math.sin(angle) * r * 1.3);
      ctx.stroke();
    }
  }

  const MACHINE_STYLE = { slotMachine: { color: '#1f6a7a', label: 'S' }, fortuneMachine: { color: '#6a4a1f', label: 'F' } };
  for (const [type, style] of Object.entries(MACHINE_STYLE)) {
    for (const machine of room.world.entities.byType(type)) {
      if (!machine.alive) continue;
      const screen = camera.worldToScreen(machine.x, machine.y);
      const size = machine.radius * 1.6 * camera.zoom;
      ctx.fillStyle = style.color;
      ctx.fillRect(screen.x - size / 2, screen.y - size / 2, size, size);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x - size / 2, screen.y - size / 2, size, size);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.label, screen.x, screen.y);
      ctx.textBaseline = 'alphabetic';
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
    const lifeFrac = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = lifeFrac;
    if (p.ring) {
      // Splash ring (P2.Q Q1b): grows outward and fades as it expires.
      const radius = (p.size + (p.growTo - p.size) * (1 - lifeFrac)) * camera.zoom;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * camera.zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

}
