/** HUD consumable slot (CLAUDE.md §3's HUD list): one icon + name/description, blank when empty. */
import { pillDisplayName } from '../systems/pills.js';

/** Pure: label for the held card/pill (or null if the slot is empty). */
export function computeConsumableSlotLabel(inventory, { getCardDef, getPillDef, pillIdentity }) {
  const held = inventory?.current;
  if (!held) return null;
  if (held.kind === 'card') return getCardDef(held.cardId)?.name ?? null;
  return pillDisplayName(held.pillColor, pillIdentity, getPillDef);
}

export function drawConsumableSlot(ctx, inventory, { getCardDef, getPillDef, pillIdentity }, { x, y, radius = 6 } = {}) {
  const label = computeConsumableSlotLabel(inventory, { getCardDef, getPillDef, pillIdentity });
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = label ? '#3a6a8a' : 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#111';
  ctx.stroke();
  if (label) {
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#d9e8f0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + radius + 6, y);
  }
  ctx.restore();
}
