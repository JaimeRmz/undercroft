/** HUD trinket slot (CLAUDE.md §3's HUD list): one icon + name, blank when nothing is held. */

/** Pure: what to draw for the current held trinket (or null if the slot is empty). */
export function computeTrinketSlotLabel(trinketInventory) {
  const held = trinketInventory?.current;
  return held ? held.name : null;
}

export function drawTrinketSlot(ctx, trinketInventory, { x, y, radius = 6 } = {}) {
  const label = computeTrinketSlotLabel(trinketInventory);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = label ? '#8a6a3a' : 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#111';
  ctx.stroke();
  if (label) {
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#e8d9b0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + radius + 6, y);
  }
  ctx.restore();
}
