/** Collision detection + separation-vector resolution. Pure functions; no entity/world knowledge. */
import { clamp } from '../core/math.js';

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

/** Returns { x, y, overlap } unit push vector (for `a`, away from `b`) and penetration depth, or null. */
export function resolveCircleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  const dist = Math.hypot(dx, dy);
  if (dist >= r) return null;
  if (dist === 0) return { x: 1, y: 0, overlap: r }; // coincident centers: arbitrary push direction
  return { x: dx / dist, y: dy / dist, overlap: r - dist };
}

export function circleIntersectsAabb(cx, cy, cr, minX, minY, maxX, maxY) {
  const closestX = clamp(cx, minX, maxX);
  const closestY = clamp(cy, minY, maxY);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

/** Returns { x, y, overlap } unit push vector (for the circle, out of the box), or null. */
export function resolveCircleVsAabb(cx, cy, cr, minX, minY, maxX, maxY) {
  const closestX = clamp(cx, minX, maxX);
  const closestY = clamp(cy, minY, maxY);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) {
    // Center is inside the box: push out along the shallowest penetration axis.
    const penLeft = cx - minX;
    const penRight = maxX - cx;
    const penTop = cy - minY;
    const penBottom = maxY - cy;
    const minPen = Math.min(penLeft, penRight, penTop, penBottom);
    if (minPen === penLeft) return { x: -1, y: 0, overlap: cr + penLeft };
    if (minPen === penRight) return { x: 1, y: 0, overlap: cr + penRight };
    if (minPen === penTop) return { x: 0, y: -1, overlap: cr + penTop };
    return { x: 0, y: 1, overlap: cr + penBottom };
  }

  if (dist >= cr) return null;
  return { x: dx / dist, y: dy / dist, overlap: cr - dist };
}
