/** Timed "item name + flavor line" banner shown on pickup. State logic is pure; drawBanner is canvas-only. */
export function createBannerState() {
  return { text: null, subtext: null, timer: 0 };
}

export function showBanner(state, text, subtext = '', duration = 3) {
  state.text = text;
  state.subtext = subtext;
  state.timer = duration;
}

export function updateBanner(state, dt) {
  if (state.timer <= 0) return;
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer === 0) {
    state.text = null;
    state.subtext = null;
  }
}

export function drawBanner(ctx, state, { x, y, width } = {}) {
  if (!state.text) return;
  const alpha = Math.min(1, state.timer / 0.5); // fade out over the last 0.5s
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e6c8';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(state.text, x + width / 2, y);
  if (state.subtext) {
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#c0b8a0';
    ctx.fillText(state.subtext, x + width / 2, y + 12);
  }
  ctx.restore();
}
