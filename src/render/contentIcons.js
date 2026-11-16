/**
 * Procedural icons for items/trinkets/cards/pills, drawn on the ground, on a
 * treasure pedestal, or in a shop slot. Each icon is derived deterministically
 * from the def's own id (a stable hue via the same hashString as enemy
 * sprites) plus whatever semantic fields it actually has — item/trinket
 * `quality` becomes small pips, an item's passive/active `type` becomes its
 * base shape — so every one of the 80+ defs reads as visually distinct
 * without any hand-authored art. Pills are the one exception: their *true*
 * identity is hidden until used (CLAUDE.md §3's "???"), so a pill icon is
 * keyed only to its per-run cosmetic color, never its effect id.
 */
import { hashString } from './sprites.js';

// Two independently-salted hashes per id (hue + saturation) instead of one, so two ids
// colliding on hue alone (hashString(id) % 360 has a real chance of colliding across
// 80+ defs — found in practice between example-mod:bauble and core:item-03) still land
// on a different saturation almost always, keeping the rendered fingerprint unique.
function hueFor(id) {
  return hashString(`hue:${id}`) % 360;
}
function satFor(id) {
  return 42 + (hashString(`sat:${id}`) % 28); // 42-69%
}

/** Circle for passive items, square for active ones — shape reflects a real data field, not just the hash. */
export function resolveItemIcon(def) {
  const id = def?.id ?? 'item';
  return { shape: def?.type === 'active' ? 'square' : 'circle', hue: hueFor(id), sat: satFor(id), quality: def?.quality ?? 0 };
}

export function resolveTrinketIcon(def) {
  const id = def?.id ?? 'trinket';
  return { shape: 'diamond', hue: hueFor(id), sat: satFor(id), quality: def?.quality ?? 0 };
}

export function resolveCardIcon(def) {
  const id = def?.id ?? 'card';
  return { shape: 'triangle', hue: hueFor(id), sat: satFor(id), quality: 0 };
}

/** Pills show only their per-run shuffled color (never the hidden effect) — a two-tone "capsule" look. */
export function resolvePillIcon(pillColor) {
  return { shape: 'capsule', colorName: pillColor ?? '#ddd' };
}

/** Draws just the outer shape's fill+stroke (everything else — core dot, pips — is shape-independent). */
function drawOuterShape(ctx, shape, x, y, size, fill, outline) {
  if (shape === 'circle' || shape === 'capsule') {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = outline;
    ctx.stroke();
  } else if (shape === 'square') {
    ctx.fillStyle = fill;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = outline;
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);
  } else if (shape === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = outline;
    ctx.stroke();
  } else if (shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.95, y + size * 0.8);
    ctx.lineTo(x - size * 0.95, y + size * 0.8);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
}

/** Draws one icon centered at screen-space (x, y); `size` is the icon's half-extent in screen px. */
export function drawIcon(ctx, icon, x, y, size = 8) {
  if (icon.shape === 'capsule') {
    drawOuterShape(ctx, 'capsule', x, y, size, icon.colorName, '#1a1a1a');
    ctx.beginPath();
    ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
    return;
  }

  const { hue, quality = 0 } = icon;
  const sat = icon.sat ?? 55;
  drawOuterShape(ctx, icon.shape, x, y, size, `hsl(${hue}, ${sat}%, 50%)`, `hsl(${hue}, ${sat}%, 18%)`);

  ctx.beginPath();
  ctx.arc(x, y, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hue}, ${Math.min(90, sat + 5)}%, 74%)`;
  ctx.fill();

  for (let i = 0; i < quality; i++) {
    ctx.beginPath();
    ctx.arc(x - (quality - 1) * 3 + i * 6, y - size - 6, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d060';
    ctx.fill();
  }
}

/** A stone plinth behind/below a floating item icon, plus a soft glow halo in the item's own hue. */
export function drawPedestal(ctx, icon, x, y, size = 10) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(x, y, size + 10, 0, Math.PI * 2);
  ctx.fill();
  if (icon.hue !== undefined) {
    ctx.fillStyle = `hsla(${icon.hue}, 70%, 60%, 0.22)`;
    ctx.beginPath();
    ctx.arc(x, y, size + 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#5a5650';
  ctx.fillRect(x - size * 1.4, y + size * 0.7, size * 2.8, size * 0.9);
  ctx.strokeStyle = '#2a2825';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - size * 1.4, y + size * 0.7, size * 2.8, size * 0.9);
}
