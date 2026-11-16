/** Full-screen overlays: main menu, pause, and the death/run-summary screen. Canvas-only, no game logic. */

function overlay(ctx, width, height, alpha = 0.75) {
  ctx.save();
  ctx.fillStyle = `rgba(5, 5, 8, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
}

function centeredText(ctx, text, x, y, { font = '10px sans-serif', color = '#fff' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

export function drawMenuScreen(ctx, { width, height, canContinue = false }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'UNDERCROFT', width / 2, height / 2 - 12, { font: 'bold 28px sans-serif' });
  centeredText(ctx, 'Press Space to start', width / 2, height / 2 + 10);
  if (canContinue) {
    centeredText(ctx, 'Press Q to continue your last run', width / 2, height / 2 + 28, { font: '10px sans-serif', color: '#d4af37' });
  }
  ctx.restore();
}

/** `character`: the currently-highlighted character def (or null if no characters loaded). */
export function drawCharacterSelectScreen(ctx, { width, height, character, index, count }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'CHOOSE YOUR CHARACTER', width / 2, height / 2 - 70, { font: 'bold 18px sans-serif' });
  if (character) {
    centeredText(ctx, `< ${character.name} >`, width / 2, height / 2 - 34, { font: 'bold 16px sans-serif', color: '#d4af37' });
    centeredText(ctx, character.description ?? '', width / 2, height / 2 - 14, { font: '10px sans-serif' });
    centeredText(ctx, `${index + 1} / ${count}`, width / 2, height / 2 + 6, { font: '9px sans-serif', color: '#999' });
  } else {
    centeredText(ctx, 'No characters loaded', width / 2, height / 2 - 14, { font: '12px sans-serif' });
  }
  centeredText(ctx, '<-/-> choose   Space confirm', width / 2, height / 2 + 30, { font: '10px sans-serif', color: '#aaa' });
  ctx.restore();
}

export function drawPauseScreen(ctx, { width, height }) {
  overlay(ctx, width, height, 0.6);
  centeredText(ctx, 'PAUSED', width / 2, height / 2 - 10, { font: 'bold 22px sans-serif' });
  centeredText(ctx, 'Press Esc to resume', width / 2, height / 2 + 16);
  ctx.restore();
}

/** `stats`: { floorsCleared, kills, coins, elapsedSeconds, killedBy }. */
export function drawDeathScreen(ctx, { width, height, stats }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'YOU DIED', width / 2, height / 2 - 50, { font: 'bold 26px sans-serif', color: '#c0283c' });
  centeredText(ctx, `Killed by ${stats.killedBy ?? 'Unknown causes'}`, width / 2, height / 2 - 34, { font: 'bold 12px sans-serif', color: '#ffb060' });
  const lines = [
    `Floors cleared: ${stats.floorsCleared}`,
    `Enemies defeated: ${stats.kills}`,
    `Coins collected: ${stats.coins}`,
    `Time survived: ${stats.elapsedSeconds.toFixed(1)}s`,
  ];
  lines.forEach((line, i) => centeredText(ctx, line, width / 2, height / 2 - 20 + i * 15, { font: '10px sans-serif' }));
  centeredText(ctx, 'Press Space to restart', width / 2, height / 2 + 62, { font: 'bold 11px sans-serif', color: '#d4af37' });
  ctx.restore();
}

/** `stats`: { floorsCleared, kills, coins, elapsedSeconds }. Shown once the final boss's trapdoor is taken. */
export function drawVictoryScreen(ctx, { width, height, stats }) {
  overlay(ctx, width, height, 0.9);
  centeredText(ctx, 'THE DEPTHS ARE QUIET', width / 2, height / 2 - 50, { font: 'bold 22px sans-serif', color: '#d4af37' });
  const lines = [
    `Floors cleared: ${stats.floorsCleared}`,
    `Enemies defeated: ${stats.kills}`,
    `Coins collected: ${stats.coins}`,
    `Time survived: ${stats.elapsedSeconds.toFixed(1)}s`,
  ];
  lines.forEach((line, i) => centeredText(ctx, line, width / 2, height / 2 - 20 + i * 15, { font: '10px sans-serif' }));
  centeredText(ctx, 'Press Space to play again', width / 2, height / 2 + 62, { font: 'bold 11px sans-serif', color: '#d4af37' });
  ctx.restore();
}
