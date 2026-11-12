/**
 * Boss HP bar. computeBossBarFraction is pure (boss -> clamped 0..1 fraction),
 * so it's unit-testable without a canvas; drawBossBar just paints it.
 */

export function computeBossBarFraction(boss) {
  if (!boss || boss.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, boss.hp / boss.maxHp));
}

export function drawBossBar(ctx, boss, { x, y, width = 300, height = 20, name = '' } = {}) {
  const fraction = computeBossBarFraction(boss);
  ctx.save();
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#a02030';
  ctx.fillRect(x, y, width * fraction, height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(x, y, width, height);
  if (name) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, x + width / 2, y - 6);
  }
  ctx.restore();
}
