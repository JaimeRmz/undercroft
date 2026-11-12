/**
 * HUD heart layout. computeHeartIcons is pure (health -> icon list), so it's
 * unit-testable without a canvas; drawHud just paints that list.
 */

/** Red containers first (full/half/empty), then extra (soul/black) hearts grouped into pairs. */
export function computeHeartIcons(health) {
  const icons = [];
  const redSlots = Math.ceil(health.redMax / 2);
  let redRemaining = health.red;
  for (let i = 0; i < redSlots; i++) {
    if (redRemaining >= 2) {
      icons.push({ type: 'full', color: 'red' });
      redRemaining -= 2;
    } else if (redRemaining === 1) {
      icons.push({ type: 'half', color: 'red' });
      redRemaining -= 1;
    } else {
      icons.push({ type: 'empty', color: 'red' });
    }
  }

  let i = 0;
  while (i < health.extra.length) {
    const a = health.extra[i];
    const b = health.extra[i + 1];
    if (b && b.type === a.type) {
      icons.push({ type: 'full', color: a.type });
      i += 2;
    } else {
      icons.push({ type: 'half', color: a.type });
      i += 1;
    }
  }
  return icons;
}

const COLORS = {
  red: '#c0283c',
  soul: '#8fd0ff',
  black: '#4a3a5a',
};

export function drawHud(ctx, health, { x = 16, y = 16, size = 18, gap = 4 } = {}) {
  const icons = computeHeartIcons(health);
  icons.forEach((icon, i) => {
    const cx = x + i * (size + gap) + size / 2;
    const cy = y + size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = icon.type === 'empty' ? '#2a2a2a' : COLORS[icon.color] ?? '#999';
    ctx.fill();
    if (icon.type === 'half') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size / 2);
      ctx.arc(cx, cy, size / 2, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = '#2a2a2a';
      ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}
