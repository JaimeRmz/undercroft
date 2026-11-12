/**
 * Tear projectiles: straight-line travel with a parabolic visual arc (height)
 * over the shot's range, splashing (destroyed) at max range or on wall impact.
 * Enemy-impact splash is wired in by the combat system once it exists (P1).
 */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';

export function spawnTear(world, { x, y, dir, stats, ownerVelocity = { x: 0, y: 0 }, team = 'player' }) {
  const speed = stats.shotSpeed * CONFIG.TEAR_BASE_SPEED_PX_PER_SEC;
  const inherit = CONFIG.SHOT_INHERITS_PLAYER_VELOCITY;
  const vx = dir.x * speed + ownerVelocity.x * inherit;
  const vy = dir.y * speed + ownerVelocity.y * inherit;
  return world.spawn('projectile', {
    x,
    y,
    vx,
    vy,
    radius: CONFIG.TEAR_RADIUS,
    damage: stats.damage,
    rangePx: stats.range * CONFIG.TILE_SIZE,
    traveled: 0,
    height: 0,
    team,
    tags: ['tear'],
  });
}

/** Advances every live projectile; emits 'projectile:splash' and destroys it at range end or on a solid tile. */
export function updateProjectiles(world, dt, events) {
  for (const p of world.entities.byType('projectile')) {
    if (!p.alive) continue;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx * dt, p.vy * dt);

    const t = clamp(p.traveled / p.rangePx, 0, 1);
    p.height = Math.sin(Math.PI * t) * CONFIG.TEAR_ARC_HEIGHT;

    const { tx, ty } = world.tileGrid.worldToTile(p.x, p.y);
    const hitWall = world.tileGrid.isSolid(tx, ty);

    if (t >= 1 || hitWall) {
      events?.emit('projectile:splash', { entity: p, reason: hitWall ? 'wall' : 'range' });
      p.destroy();
    }
  }
}
