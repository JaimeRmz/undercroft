/**
 * Canvas drawing for the HUD panels. Everything is positioned inside the
 * margin zones from layout.js (never over the play area), except the
 * transient floor banner which sits in the top wall row. Logical pixels.
 */
import { drawHud } from './hud.js';
import { ZONES, ROOM_RECT, VIEW_W } from './layout.js';
import { wrapLabel } from './hudModel.js';

const FONT = '"Courier New", monospace';

function text(ctx, str, x, y, { size = 8, color = '#e8e4d8', align = 'left', bold = true } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(str, x + 0.75, y + 0.75); // 1px drop shadow for contrast on any background
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function iconCoin(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#e0b030';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#6a4a10';
  ctx.stroke();
  ctx.fillStyle = '#fff0a0';
  ctx.fillRect(x - 1, y - 3, 2, 6);
}

function iconBomb(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y + 1, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#3a3a44';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#b0b0c0';
  ctx.stroke();
  ctx.fillStyle = '#ff8030';
  ctx.fillRect(x + 1, y - 6, 3, 3);
}

function iconKey(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
  ctx.strokeStyle = '#d0d0e0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#d0d0e0';
  ctx.fillRect(x - 1, y - 1, 2, 7);
  ctx.fillRect(x, y + 3, 3, 2);
}

const COUNTER_ICONS = { coin: iconCoin, bomb: iconBomb, key: iconKey };

/** Left margin: coin/bomb/key counters. */
function drawCounters(ctx, counters) {
  counters.forEach((c, i) => {
    const y = ZONES.left.y + 8 + i * 16;
    COUNTER_ICONS[c.kind](ctx, 12, y);
    text(ctx, String(Math.min(99, c.value)).padStart(2, '0'), 22, y, { size: 10 });
  });
}

/** Left margin: stats column under the counters. */
function drawStats(ctx, rows) {
  const top = ZONES.left.y + 76;
  text(ctx, 'STATS', 6, top - 12, { size: 7, color: '#8a8aa0' });
  rows.forEach((row, i) => {
    const y = top + i * 14;
    text(ctx, row.label, 6, y, { size: 7, color: '#a8a8c0' });
    text(ctx, row.value, ZONES.left.w - 3, y, { size: 8, align: 'right' });
  });
}

function slotBox(ctx, cx, cy, { fill, border = '#1a1a22', size = 24 }) {
  ctx.fillStyle = fill;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = border;
  ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function drawLabelLines(ctx, name, cx, y) {
  wrapLabel(name, 11, 2).forEach((line, i) => text(ctx, line, cx, y + i * 8, { size: 7, align: 'center', bold: false }));
}

/** Right margin: active item with charge bar, trinket slot, consumable slot. */
function drawSlots(ctx, model) {
  const cx = ZONES.right.x + ZONES.right.w / 2;
  const top = ZONES.right.y + 14;

  text(ctx, 'ACTIVE', cx, top, { size: 7, color: '#8a8aa0', align: 'center' });
  if (model.active) {
    const a = model.active;
    slotBox(ctx, cx - 6, top + 18, { fill: `hsl(${hashHue(a.id)}, 45%, 38%)`, border: a.ready ? '#ffe070' : '#1a1a22' });
    text(ctx, a.name[0].toUpperCase(), cx - 6, top + 18, { size: 12, align: 'center' });
    // Vertical charge bar: one segment per charge, filled from the bottom.
    const barX = cx + 10;
    const segH = Math.max(2, Math.floor(24 / a.maxCharges) - 1);
    for (let i = 0; i < a.maxCharges; i++) {
      ctx.fillStyle = i < a.charge ? (a.ready ? '#ffe070' : '#70c0ff') : '#26262e';
      ctx.fillRect(barX, top + 30 - (i + 1) * (segH + 1), 4, segH);
    }
    drawLabelLines(ctx, a.ready ? `${a.name} READY` : a.name, cx, top + 38);
  } else {
    slotBox(ctx, cx, top + 18, { fill: 'rgba(255,255,255,0.05)' });
    text(ctx, '-', cx, top + 18, { size: 9, align: 'center', color: '#555' });
  }

  const trinketY = top + 74;
  text(ctx, 'TRINKET', cx, trinketY, { size: 7, color: '#8a8aa0', align: 'center' });
  slotBox(ctx, cx, trinketY + 16, { fill: model.trinket ? '#8a6a3a' : 'rgba(255,255,255,0.05)', size: 20 });
  if (model.trinket) {
    text(ctx, model.trinket[0].toUpperCase(), cx, trinketY + 16, { size: 10, align: 'center' });
    drawLabelLines(ctx, model.trinket, cx, trinketY + 34);
  } else {
    text(ctx, '-', cx, trinketY + 16, { size: 9, align: 'center', color: '#555' });
  }

  const consY = trinketY + 62;
  text(ctx, 'CARD/PILL', cx, consY, { size: 7, color: '#8a8aa0', align: 'center' });
  slotBox(ctx, cx, consY + 16, { fill: model.consumable ? '#3a6a8a' : 'rgba(255,255,255,0.05)', size: 20 });
  if (model.consumable) {
    text(ctx, model.consumable.startsWith('?') ? '?' : model.consumable[0].toUpperCase(), cx, consY + 16, { size: 10, align: 'center' });
    drawLabelLines(ctx, model.consumable, cx, consY + 34);
  } else {
    text(ctx, '-', cx, consY + 16, { size: 9, align: 'center', color: '#555' });
  }
}

/** Draws every HUD panel (hearts, counters, stats, slots) from a computeHudModel() result. */
export function drawHudPanels(ctx, model) {
  ctx.save();
  drawHud(ctx, model.health, { x: ROOM_RECT.x + 2, y: 8, size: 12, gap: 2 });
  drawCounters(ctx, model.counters);
  drawStats(ctx, model.stats);
  drawSlots(ctx, model);
  ctx.restore();
}

/** Floor-name banner: drawn inside the top wall row so it never covers walkable floor. `state.timer` counts down. */
export function drawFloorBanner(ctx, state) {
  if (!state.text || state.timer <= 0) return;
  const alpha = Math.min(1, state.timer / 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(ROOM_RECT.x + 40, ROOM_RECT.y + 6, ROOM_RECT.w - 80, 28);
  text(ctx, state.text, VIEW_W / 2, ROOM_RECT.y + 15, { size: 12, align: 'center', color: '#f0e6c8' });
  if (state.subtext) text(ctx, state.subtext, VIEW_W / 2, ROOM_RECT.y + 27, { size: 8, align: 'center', color: '#b0a890', bold: false });
  ctx.restore();
}
