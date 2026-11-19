/**
 * Recording 2D context for headless render tests. Tracks the translate/scale
 * transform and globalAlpha so every recorded draw call carries absolute
 * (canvas-space) coordinates and the alpha it was drawn with.
 */
export function createMockCtx(width = 640, height = 360) {
  const calls = [];
  const stack = [];
  let m = { a: 1, d: 1, e: 0, f: 0 }; // scale+translate only (all this game uses)
  const state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
  const abs = (x, y) => ({ x: m.a * x + m.e, y: m.d * y + m.f });
  const record = (kind, x, y, extra = {}) => {
    const p = abs(x, y);
    calls.push({ kind, x: p.x, y: p.y, alpha: state.globalAlpha, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, scale: m.a, ...extra });
  };
  const ctx = {
    canvas: { width, height },
    calls,
    save() { stack.push({ ...m, ...state }); },
    restore() {
      const s = stack.pop();
      if (!s) return;
      m = { a: s.a, d: s.d, e: s.e, f: s.f };
      for (const k of Object.keys(state)) state[k] = s[k];
    },
    translate(x, y) { m = { ...m, e: m.e + m.a * x, f: m.f + m.d * y }; },
    scale(sx, sy) { m = { ...m, a: m.a * sx, d: m.d * sy }; },
    setTransform(a, b, c, d, e, f) { m = { a, d, e, f }; },
    resetTransform() { m = { a: 1, d: 1, e: 0, f: 0 }; },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo(cpx, cpy, x, y) { record('quadraticCurveTo', x, y, { cpx: m.a * cpx + m.e, cpy: m.d * cpy + m.f }); },
    clip() {},
    clearRect() {},
    arc(x, y, r) { record('arc', x, y, { r: r * m.a }); },
    fill() { calls.push({ kind: 'fill', alpha: state.globalAlpha, fillStyle: state.fillStyle }); },
    stroke() { calls.push({ kind: 'stroke', alpha: state.globalAlpha, strokeStyle: state.strokeStyle }); },
    fillRect(x, y, w, h) { record('fillRect', x, y, { w: w * m.a, h: h * m.d }); },
    strokeRect(x, y, w, h) { record('strokeRect', x, y, { w: w * m.a, h: h * m.d }); },
    fillText(text, x, y) { record('fillText', x, y, { text: String(text) }); },
    measureText(text) { return { width: String(text).length * 5 }; },
  };
  return new Proxy(ctx, {
    get(t, k) { return k in state ? state[k] : t[k]; },
    set(t, k, v) { if (k in state) state[k] = v; else t[k] = v; return true; },
  });
}
