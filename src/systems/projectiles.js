/**
 * Tear projectiles: straight-line travel with a parabolic visual arc (height)
 * over the shot's range, splashing (destroyed) at max range or on wall impact
 * — unless an attached tear modifier says otherwise (bouncing, spectral).
 */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';
import { attachModifier, runModifiersOnUpdate, runModifiersOnHitWall, runModifiersOnExpire } from './tearModifiers.js';

/** `modifiers` is an array of modifier ids (strings) or { id, config } objects. */
export function spawnTear(world, { x, y, dir, stats, ownerVelocity = { x: 0, y: 0 }, team = 'player', modifiers = [], ownerDefId = null }) {
  const speed = stats.shotSpeed * CONFIG.TEAR_BASE_SPEED_PX_PER_SEC;
  const inherit = CONFIG.SHOT_INHERITS_PLAYER_VELOCITY;
  const vx = dir.x * speed + ownerVelocity.x * inherit;
  const vy = dir.y * speed + ownerVelocity.y * inherit;
  const tear = world.spawn('projectile', {
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
    ownerDefId, // enemy/boss def id that fired this (for "Killed by ..."); null for player tears
    tags: ['tear'],
  });
  for (const entry of modifiers) {
    const id = typeof entry === 'string' ? entry : entry.id;
    const config = typeof entry === 'string' ? {} : entry.config ?? {};
    attachModifier(tear, id, config);
  }
  return tear;
}

/**
 * Advances every live projectile. `ctx.owner` (the firing entity) is passed
 * through to modifiers that need it (boomerang, orbit). Emits
 * 'projectile:splash' and destroys the tear at range end or on a solid tile,
 * unless an attached modifier's onHitWall keeps it alive.
 */
export function updateProjectiles(world, dt, events, ctx = {}) {
  const modifierCtx = { world, events, owner: ctx.owner };

  for (const p of world.entities.byType('projectile')) {
    if (!p.alive) continue;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx * dt, p.vy * dt);

    runModifiersOnUpdate(p, dt, modifierCtx);

    const t = clamp(p.rangePx > 0 ? p.traveled / p.rangePx : 1, 0, 1);
    p.height = Math.sin(Math.PI * t) * CONFIG.TEAR_ARC_HEIGHT;

    const { tx, ty } = world.tileGrid.worldToTile(p.x, p.y);
    const hitWall = world.tileGrid.isSolid(tx, ty);

    if (hitWall && !runModifiersOnHitWall(p, modifierCtx)) {
      events?.emit('projectile:splash', { entity: p, reason: 'wall' });
      runModifiersOnExpire(p, modifierCtx);
      p.destroy();
      continue;
    }

    if (t >= 1) {
      events?.emit('projectile:splash', { entity: p, reason: 'range' });
      runModifiersOnExpire(p, modifierCtx);
      p.destroy();
    }
  }
}
