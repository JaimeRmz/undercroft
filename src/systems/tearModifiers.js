/**
 * Composable tear modifier components (CLAUDE.md §3): each attaches to a tear
 * independently via onSpawn/onUpdate/onHitEnemy/onHitWall/onExpire hooks, so
 * any combination can stack on one projectile (homing+splitting, piercing+
 * bouncing, etc). Status-effect modifiers (poison/burn/.../confuse) hand off
 * to statusEffects.js on hit, which owns duration/DOT/movement-override
 * simulation and boss immunity.
 */
import { normalize } from '../core/math.js';
import { circlesOverlap } from '../engine/collision.js';
import { applyEnemyDamage } from './enemies.js';
import { applyStatus } from './statusEffects.js';

export const tearModifierRegistry = new Map();

export function registerTearModifier(id, hooks) {
  tearModifierRegistry.set(id, hooks);
}

/** Attaches modifier `id` to a tear, running its onSpawn hook with `config`. */
export function attachModifier(tear, id, config = {}) {
  if (!tear.modifierIds) tear.modifierIds = [];
  if (!tear.modifierIds.includes(id)) tear.modifierIds.push(id);
  tearModifierRegistry.get(id)?.onSpawn?.(tear, config);
}

export function runModifiersOnUpdate(tear, dt, ctx) {
  for (const id of tear.modifierIds ?? []) {
    tearModifierRegistry.get(id)?.onUpdate?.(tear, dt, ctx);
  }
}

/** Runs onHitEnemy for every attached modifier. Destroyed unless some modifier explicitly keeps it alive (piercing, splitting-replaces-itself, etc). */
export function runModifiersOnHitEnemy(tear, enemy, ctx) {
  let keepAlive = false;
  for (const id of tear.modifierIds ?? []) {
    const result = tearModifierRegistry.get(id)?.onHitEnemy?.(tear, enemy, ctx);
    if (result?.keepAlive) keepAlive = true;
  }
  return keepAlive;
}

/** Same shape as runModifiersOnHitEnemy, for wall impacts (bouncing, spectral). */
export function runModifiersOnHitWall(tear, ctx) {
  let keepAlive = false;
  for (const id of tear.modifierIds ?? []) {
    const result = tearModifierRegistry.get(id)?.onHitWall?.(tear, ctx);
    if (result?.keepAlive) keepAlive = true;
  }
  return keepAlive;
}

export function runModifiersOnExpire(tear, ctx) {
  for (const id of tear.modifierIds ?? []) {
    tearModifierRegistry.get(id)?.onExpire?.(tear, ctx);
  }
}

function findNearestEnemy(world, x, y) {
  let nearest = null;
  let bestDistSq = Infinity;
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

function cloneTearForChild(tear, overrides) {
  const skip = new Set(['id', 'x', 'y', 'vx', 'vy', 'traveled', 'height', 'alive', 'components', 'tags']);
  const base = {};
  for (const [key, value] of Object.entries(tear)) {
    if (skip.has(key)) continue;
    base[key] = value;
  }
  return { ...base, traveled: 0, height: 0, tags: ['tear'], ...overrides };
}

function explodeAt(tear, ctx, radius, damage) {
  for (const enemy of ctx.world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    if (!circlesOverlap(tear.x, tear.y, radius, enemy.x, enemy.y, enemy.radius)) continue;
    applyEnemyDamage(ctx.world, enemy, damage, ctx);
  }
}

// --- Movement / behavior modifiers ---------------------------------------

registerTearModifier('homing', {
  onUpdate(tear, dt, ctx) {
    const target = findNearestEnemy(ctx.world, tear.x, tear.y);
    if (!target) return;
    const desired = normalize(target.x - tear.x, target.y - tear.y);
    const speed = Math.hypot(tear.vx, tear.vy);
    const turnRate = 6; // [assumed] steer strength
    const blend = Math.min(1, turnRate * dt);
    tear.vx += (desired.x * speed - tear.vx) * blend;
    tear.vy += (desired.y * speed - tear.vy) * blend;
  },
});

registerTearModifier('piercing', {
  onSpawn(tear, config) {
    tear.pierceRemaining = config.pierceCount ?? 2;
  },
  onHitEnemy(tear) {
    if (tear.pierceRemaining > 0) {
      tear.pierceRemaining -= 1;
      return { keepAlive: true };
    }
    return { keepAlive: false };
  },
});

registerTearModifier('spectral', {
  // Ignores walls/obstacles entirely; still expires normally at max range.
  onHitWall() {
    return { keepAlive: true };
  },
});

registerTearModifier('bouncing', {
  onSpawn(tear, config) {
    tear.bounceRemaining = config.bounceCount ?? 2;
  },
  onHitWall(tear) {
    if (tear.bounceRemaining > 0) {
      tear.bounceRemaining -= 1;
      tear.vx *= -1; // [assumed] simplistic reflection (full axis-aware reflection is a later polish pass)
      tear.vy *= -1;
      return { keepAlive: true };
    }
    return { keepAlive: false };
  },
});

registerTearModifier('splitting', {
  onHitEnemy(tear, enemy, ctx) {
    spawnSplit(tear, ctx);
    return { keepAlive: false };
  },
  onExpire(tear, ctx) {
    spawnSplit(tear, ctx);
  },
});

function spawnSplit(tear, ctx) {
  const angleOffsets = [-0.4, 0.4]; // [assumed] ~23 degree spread
  const baseAngle = Math.atan2(tear.vy, tear.vx);
  const speed = Math.hypot(tear.vx, tear.vy);
  for (const offset of angleOffsets) {
    const angle = baseAngle + offset;
    const child = cloneTearForChild(tear, {
      x: tear.x,
      y: tear.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rangePx: tear.rangePx * 0.6,
    });
    ctx.world.spawn('projectile', child);
  }
}

registerTearModifier('exploding', {
  onSpawn(tear, config) {
    tear.explodeRadius = config.radius ?? 50;
  },
  onHitEnemy(tear, enemy, ctx) {
    explodeAt(tear, ctx, tear.explodeRadius, tear.damage);
    return { keepAlive: false };
  },
  onExpire(tear, ctx) {
    explodeAt(tear, ctx, tear.explodeRadius, tear.damage);
  },
});

registerTearModifier('boomerang', {
  onSpawn(tear) {
    tear.boomerangReturning = false;
  },
  onUpdate(tear, dt, ctx) {
    const t = tear.rangePx > 0 ? tear.traveled / tear.rangePx : 1;
    if (t >= 1 && !tear.boomerangReturning && ctx.owner) {
      tear.boomerangReturning = true;
      tear.traveled = 0;
      const dir = normalize(ctx.owner.x - tear.x, ctx.owner.y - tear.y);
      const speed = Math.hypot(tear.vx, tear.vy);
      tear.vx = dir.x * speed;
      tear.vy = dir.y * speed;
    }
  },
});

registerTearModifier('wiggle', {
  onSpawn(tear) {
    tear.wigglePhase = 0;
  },
  onUpdate(tear, dt) {
    tear.wigglePhase += dt * 10; // [assumed] wiggle frequency
    const speed = Math.hypot(tear.vx, tear.vy);
    const baseAngle = Math.atan2(tear.vy, tear.vx);
    const wiggled = baseAngle + Math.sin(tear.wigglePhase) * 0.3;
    tear.vx = Math.cos(wiggled) * speed;
    tear.vy = Math.sin(wiggled) * speed;
  },
});

registerTearModifier('orbit', {
  onSpawn(tear, config) {
    tear.orbitAngle = Math.atan2(tear.vy, tear.vx);
    tear.orbitRadius = config.orbitRadius ?? 50;
    tear.orbitSpeed = config.orbitSpeed ?? 3;
  },
  onUpdate(tear, dt, ctx) {
    tear.orbitAngle += dt * tear.orbitSpeed;
    if (ctx.owner) {
      tear.x = ctx.owner.x + Math.cos(tear.orbitAngle) * tear.orbitRadius;
      tear.y = ctx.owner.y + Math.sin(tear.orbitAngle) * tear.orbitRadius;
    }
  },
});

registerTearModifier('chainLightning', {
  onSpawn(tear, config) {
    tear.chainRange = config.chainRange ?? 120;
  },
  onHitEnemy(tear, enemy, ctx) {
    const nearby = ctx.world.entities
      .byType('enemy')
      .find((e) => e.alive && e !== enemy && Math.hypot(e.x - enemy.x, e.y - enemy.y) <= tear.chainRange);
    if (nearby) {
      const chainDamage = tear.damage * 0.5; // [assumed] chained hit does half damage
      applyEnemyDamage(ctx.world, nearby, chainDamage, ctx);
    }
  },
});

// --- Status-tag modifiers (duration/DOT simulation lives in statusEffects.js) ---

function statusModifier(name) {
  return {
    onHitEnemy(tear, enemy) {
      applyStatus(enemy, name);
    },
  };
}

for (const name of ['poison', 'burn', 'slow', 'freeze', 'charm', 'fear', 'confuse']) {
  registerTearModifier(name, statusModifier(name));
}
