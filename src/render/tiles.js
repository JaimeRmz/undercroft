/**
 * Per-tile-type canvas rendering (P1.G4): textured floor, beveled walls,
 * rocks/blocks shaded as two distinct irregular variants, pits with a visible
 * rim, and doors that visually read their state (locked while enemies are
 * alive, key-locked, or tinted by whatever room type sits behind them) instead
 * of every tile of a type being one flat, identical rectangle.
 */
import { hashString } from './sprites.js';

/** Stable 0/1 per tile position (not Math.random — must render the same every frame). */
function tileVariant(tx, ty) {
  return hashString(`${tx},${ty}`) % 2;
}

export function drawFloorTile(ctx, x, y, size, floorColor, tx, ty) {
  ctx.fillStyle = floorColor;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = tileVariant(tx, ty) === 0 ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.03)';
  ctx.fillRect(x, y, size, size);
}

export function drawWallTile(ctx, x, y, size, wallColor) {
  ctx.fillStyle = wallColor;
  ctx.fillRect(x, y, size, size);
  const bevel = Math.max(2, size * 0.1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, y, size, bevel);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x, y + size - bevel, size, bevel);
}

/** Two shaded variants per CLAUDE.md's "rocks" vs "destructible blocks": a crate-grid look and a boulder-blotch look. */
export function drawRockTile(ctx, x, y, size, rockColor, tx, ty) {
  ctx.fillStyle = rockColor;
  ctx.fillRect(x, y, size, size);
  const inset = size * 0.12;

  if (tileVariant(tx, ty) === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + inset);
    ctx.lineTo(x + size / 2, y + size - inset);
    ctx.moveTo(x + inset, y + size / 2);
    ctx.lineTo(x + size - inset, y + size / 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(x + size * 0.32, y + size * 0.38, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size * 0.66, y + size * 0.6, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
}

/**
 * Mound (P2.Q Q3a): a soft dome of rubble, distinct from a hard rock — rounded,
 * lighter, with a crack that deepens as it's chipped (hpFrac 1 → 0). Reads as
 * "I can shoot this down" rather than "bomb me".
 */
export function drawMoundTile(ctx, x, y, size, rockColor, hpFrac = 1) {
  const cx = x + size / 2;
  const cy = y + size * 0.6;
  const r = size * 0.4;
  ctx.fillStyle = rockColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0); // top dome (upper half-circle)
  ctx.fill();
  ctx.fillRect(cx - r, cy, r * 2, size * 0.28); // base
  // Highlight cap.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, Math.PI, 0);
  ctx.fill();
  // Damage crack grows as it's chipped.
  const crack = (1 - hpFrac) * size * 0.3;
  if (crack > 0) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1 + crack * 0.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.2);
    ctx.lineTo(cx - crack * 0.4, cy + size * 0.1);
    ctx.stroke();
  }
}

/**
 * Tinted rock (P2.Q Q3a): a rock with an unmistakable warm-gold vein so the
 * player learns "bomb this for a reward". Same hard-edged silhouette as a rock.
 */
export function drawTintedRockTile(ctx, x, y, size, rockColor) {
  ctx.fillStyle = rockColor;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  // Gold vein marking it as a reward rock.
  ctx.strokeStyle = '#e8c050';
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.25, y + size * 0.3);
  ctx.lineTo(x + size * 0.5, y + size * 0.5);
  ctx.lineTo(x + size * 0.4, y + size * 0.72);
  ctx.stroke();
  ctx.fillStyle = '#f0d878';
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPitTile(ctx, x, y, size, pitColor) {
  ctx.fillStyle = pitColor;
  ctx.fillRect(x, y, size, size);
  const edge = Math.max(2, size * 0.06);
  ctx.strokeStyle = 'rgba(150, 150, 170, 0.35)';
  ctx.lineWidth = edge;
  ctx.strokeRect(x + edge / 2, y + edge / 2, size - edge, size - edge);
}

const DOOR_DESTINATION_TINT = {
  treasure: '#5a3a7a',
  shop: '#2f5a3a',
  boss: '#6a1f1f',
  challenge: '#7a3a1f',
  curse: '#3a0a0a',
  sacrifice: '#5a1f3a',
  arcade: '#1f4a5a',
  devil: '#2a0a0a',
  angel: '#d4c078',
};

/** `door` is the room's own `{ locked, keyLocked, leadsToType }` for this tile, or null for a borderless room edge.
 * `pulse` (0..1 or null, P1.G7) is the door's open/close animation progress — 0 right as its lock state flips,
 * fading to 1; a bright ring sweeps outward from the door to sell the moment it unlocks/locks. */
export function drawDoorTile(ctx, x, y, size, defaultColor, door, pulse = null) {
  let fill = defaultColor;
  if (door?.locked) fill = '#15151a';
  else if (door?.keyLocked) fill = '#4a3a10';
  else if (door?.leadsToType && DOOR_DESTINATION_TINT[door.leadsToType]) fill = DOOR_DESTINATION_TINT[door.leadsToType];

  ctx.fillStyle = fill;
  ctx.fillRect(x, y, size, size);

  if (door?.locked) {
    ctx.strokeStyle = 'rgba(80, 80, 90, 0.9)';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.3, y);
    ctx.lineTo(x + size * 0.3, y + size);
    ctx.moveTo(x + size * 0.7, y);
    ctx.lineTo(x + size * 0.7, y + size);
    ctx.stroke();
  } else if (door?.keyLocked) {
    ctx.fillStyle = '#f0d060';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size * 0.4, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + size / 2 - size * 0.04, y + size * 0.42, size * 0.08, size * 0.22);
  }

  if (pulse !== null) {
    const alpha = 1 - pulse;
    const radius = size * (0.5 + pulse * 0.7);
    ctx.strokeStyle = door?.locked || door?.keyLocked ? `rgba(220, 70, 70, ${alpha})` : `rgba(255, 230, 150, ${alpha})`;
    ctx.lineWidth = Math.max(1, size * 0.08 * (1 - pulse));
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
