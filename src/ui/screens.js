/** Full-screen overlays: main menu, pause, and the death/run-summary screen. Canvas-only, no game logic. */

function overlay(ctx, width, height, alpha = 0.75) {
  ctx.save();
  ctx.fillStyle = `rgba(5, 5, 8, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
}

function centeredText(ctx, text, x, y, { font = '20px sans-serif', color = '#fff' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

export function drawMenuScreen(ctx, { width, height }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'UNDERCROFT', width / 2, height / 2 - 30, { font: 'bold 48px sans-serif' });
  centeredText(ctx, 'Press Space to start', width / 2, height / 2 + 20);
  ctx.restore();
}

export function drawPauseScreen(ctx, { width, height }) {
  overlay(ctx, width, height, 0.6);
  centeredText(ctx, 'PAUSED', width / 2, height / 2 - 10, { font: 'bold 36px sans-serif' });
  centeredText(ctx, 'Press Esc to resume', width / 2, height / 2 + 30);
  ctx.restore();
}

/** `stats`: { floorsCleared, kills, coins, elapsedSeconds }. */
export function drawDeathScreen(ctx, { width, height, stats }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'YOU DIED', width / 2, height / 2 - 60, { font: 'bold 44px sans-serif', color: '#c0283c' });
  const lines = [
    `Floors cleared: ${stats.floorsCleared}`,
    `Enemies defeated: ${stats.kills}`,
    `Coins collected: ${stats.coins}`,
    `Time survived: ${stats.elapsedSeconds.toFixed(1)}s`,
  ];
  lines.forEach((line, i) => centeredText(ctx, line, width / 2, height / 2 - 10 + i * 26, { font: '18px sans-serif' }));
  centeredText(ctx, 'Press Space to restart', width / 2, height / 2 + 120, { font: '20px sans-serif', color: '#d4af37' });
  ctx.restore();
}
