/**
 * Tear rendering (P2.Q Q1a): a round glossy droplet whose size scales with its
 * damage, with a floor shadow drawn at the un-lifted (ground) position so the
 * gap up to the lifted droplet reads as the shot's parabolic arc height.
 *
 * computeTearDrawOps is pure (data in → draw ops out) so it's headlessly
 * testable; drawTear is the only canvas-touching part.
 */
import { CONFIG } from '../core/config.js';
import { executeDrawOps } from './sprites.js';

// Stats.damage base (CLAUDE.md §3: "Base 3.5"); tear visual area is normalized against it.
const BASE_DAMAGE = 3.5;

const TEAR_LOOK = {
  player: { fill: '#cfe8ff', outline: '#3a6a8a', outlineWidth: 1, highlight: 'rgba(255, 255, 255, 0.85)' },
  enemy: {
    fill: '#ff4a1a',
    outline: '#1a0000',
    outlineWidth: 2,
    highlight: 'rgba(255, 230, 160, 0.9)',
    glow: 'rgba(255, 60, 20, 0.35)',
    core: '#ffe08a',
  },
};

/** Normalize a team string to one of the two known looks. */
function teamKey(team) {
  return team === 'enemy' ? 'enemy' : 'player';
}

/**
 * Per-tear visual radius: grows with damage (area ∝ damage, so radius ∝ √damage)
 * and is clamped so a glass-cannon build doesn't produce absurd softballs and a
 * near-zero-damage tear stays visible.
 */
export function tearRadius(projectile) {
  const dmg = projectile?.damage ?? BASE_DAMAGE;
  const scale = Math.sqrt(Math.max(0, dmg) / BASE_DAMAGE);
  return CONFIG.TEAR_RADIUS * Math.min(1.9, Math.max(0.7, scale));
}

/**
 * Draw ops for a glossy tear droplet of radius `r`, centered on the local origin.
 * The highlight is a small offset bright circle toward the top-left that gives
 * the wet/glossy read. Pure.
 */
export function computeTearDrawOps(r, team) {
  const look = TEAR_LOOK[teamKey(team)];
  const ops = [];
  if (look.glow) ops.push({ op: 'circle', x: 0, y: 0, radius: r + 4, fill: look.glow });
  ops.push({ op: 'circle', x: 0, y: 0, radius: r, fill: look.fill, outline: look.outline, outlineWidth: look.outlineWidth });
  if (look.core) ops.push({ op: 'circle', x: 0, y: 0, radius: r * 0.45, fill: look.core });
  ops.push({ op: 'circle', x: -r * 0.3, y: -r * 0.35, radius: r * 0.32, fill: look.highlight });
  return ops;
}

/**
 * Draws one tear: a ground shadow at the projectile's un-lifted position (fading
 * and shrinking as the tear rises) and the droplet itself lifted by its arc
 * height. The vertical gap between the two conveys how high the tear is arcing.
 */
export function drawTear(ctx, projectile, camera) {
  const r = tearRadius(projectile);
  const height = projectile.height ?? 0;
  const heightFrac = Math.min(1, CONFIG.TEAR_ARC_HEIGHT > 0 ? height / CONFIG.TEAR_ARC_HEIGHT : 0);

  // Ground shadow: at the tear's XY with no height lift. Shrinks/fades with altitude.
  const ground = camera.worldToScreen(projectile.x, projectile.y);
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.globalAlpha = 0.5 - 0.22 * heightFrac;
  ctx.arc(ground.x, ground.y + r * 0.5 * camera.zoom, r * (0.85 - 0.3 * heightFrac) * camera.zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Droplet: lifted by the arc height so it visibly floats above its shadow.
  const body = camera.worldToScreen(projectile.x, projectile.y - height);
  executeDrawOps(ctx, computeTearDrawOps(r, projectile.team), { x: body.x, y: body.y, scale: camera.zoom });
}
