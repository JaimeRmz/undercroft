/**
 * Integer-scaled, letterboxed viewport math (pure). The game always draws at a
 * fixed logical size; this picks the largest whole-number scale that fits the
 * window so pixels stay crisp, and reports the CSS size for the canvas so the
 * remaining window area is letterboxed (the page centers the canvas).
 * `dpr` (devicePixelRatio) lets the scale be a whole number of DEVICE pixels.
 */
export function computeViewport(windowW, windowH, logicalW, logicalH, dpr = 1) {
  const deviceW = Math.max(1, Math.floor(windowW * dpr));
  const deviceH = Math.max(1, Math.floor(windowH * dpr));
  const scale = Math.max(1, Math.floor(Math.min(deviceW / logicalW, deviceH / logicalH)));
  const backingW = logicalW * scale;
  const backingH = logicalH * scale;
  return { scale, backingW, backingH, cssW: backingW / dpr, cssH: backingH / dpr };
}
