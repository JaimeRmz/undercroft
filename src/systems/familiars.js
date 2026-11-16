/**
 * Familiars (CLAUDE.md §3: orbitals, followers that shoot, blue-fly style
 * helpers) — persistent helper entities granted by passive items
 * (`item.grantsFamiliar`). Unlike a tear modifier (which attaches to the
 * player entity itself), a familiar is its own 'familiar' world entity so it
 * renders, can be independently positioned, and deals its own damage. Three
 * behaviors cover the whole CLAUDE.md list:
 *   - 'orbit':  sweeps a fixed-radius circle around the player, damaging any
 *               enemy it touches (an orbital).
 *   - 'hover':  eases toward a fixed offset from the player, same contact
 *               damage as 'orbit' but no circular motion (a "blue fly").
 *   - 'follow': eases toward a fixed offset from the player and fires tears
 *               at the nearest enemy in range on a cooldown (a shooter).
 * Picking up the same item twice grants a second, independent familiar
 * (matching the reference game's usual "duplicates stack" familiar behavior).
 */
import { CONFIG } from '../core/config.js';
import { normalize } from '../core/math.js';
import { circlesOverlap } from '../engine/collision.js';
import { spawnTear } from './projectiles.js';
import { applyEnemyDamage, isEnemyDamageBlocked } from './enemies.js';

/** Golden-angle-ish stagger (not Math.random — CLAUDE.md §2 requires seeded/deterministic game logic) so multiple familiars spread out instead of stacking exactly on top of each other. */
function staggerAngle(world) {
  return world.entities.byType('familiar').length * 2.4;
}

export function spawnFamiliar(world, def, { player }) {
  return world.spawn('familiar', {
    x: player.x,
    y: player.y,
    radius: def.radius ?? 8,
    defId: def.id,
    behavior: def.behavior, // 'orbit' | 'hover' | 'follow'
    orbitAngle: staggerAngle(world),
    orbitRadius: def.orbitRadius ?? CONFIG.FAMILIAR_DEFAULT_ORBIT_RADIUS_PX,
    orbitSpeed: def.orbitSpeed ?? CONFIG.FAMILIAR_DEFAULT_ORBIT_SPEED_RAD_PER_SEC,
    followOffset: { x: def.followOffsetX ?? CONFIG.FAMILIAR_DEFAULT_FOLLOW_OFFSET_PX, y: def.followOffsetY ?? CONFIG.FAMILIAR_DEFAULT_FOLLOW_OFFSET_PX },
    damage: def.damage ?? 1,
    fireCooldown: 0,
    fireCooldownSeconds: def.fireCooldownSeconds ?? 1.5,
    range: def.range ?? 5,
    contactCooldownTicks: 0,
    tags: ['familiar'],
  });
}

function nearestAliveEnemy(world, familiar, maxRangePx) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    const dist = Math.hypot(enemy.x - familiar.x, enemy.y - familiar.y);
    if (dist <= maxRangePx && dist < bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

/** One contact-damage attempt against any enemy the familiar currently overlaps, gated by its own cooldown. */
function resolveContactDamage(world, familiar, ctx) {
  if (familiar.contactCooldownTicks > 0) return;
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive || isEnemyDamageBlocked(world, enemy)) continue;
    if (!circlesOverlap(familiar.x, familiar.y, familiar.radius, enemy.x, enemy.y, enemy.radius)) continue;
    applyEnemyDamage(world, enemy, familiar.damage, ctx);
    familiar.contactCooldownTicks = CONFIG.FAMILIAR_CONTACT_COOLDOWN_TICKS;
    break;
  }
}

export function updateFamiliars(world, player, dt, ctx = {}) {
  for (const familiar of world.entities.byType('familiar')) {
    if (!familiar.alive) continue;
    familiar.contactCooldownTicks = Math.max(0, familiar.contactCooldownTicks - 1);

    if (familiar.behavior === 'orbit') {
      familiar.orbitAngle += familiar.orbitSpeed * dt;
      familiar.x = player.x + Math.cos(familiar.orbitAngle) * familiar.orbitRadius;
      familiar.y = player.y + Math.sin(familiar.orbitAngle) * familiar.orbitRadius;
      resolveContactDamage(world, familiar, ctx);
      continue;
    }

    const targetX = player.x + familiar.followOffset.x;
    const targetY = player.y + familiar.followOffset.y;
    const ease = Math.min(1, dt * CONFIG.FAMILIAR_FOLLOW_EASE);
    familiar.x += (targetX - familiar.x) * ease;
    familiar.y += (targetY - familiar.y) * ease;

    if (familiar.behavior === 'hover') {
      resolveContactDamage(world, familiar, ctx);
    } else if (familiar.behavior === 'follow') {
      familiar.fireCooldown = Math.max(0, familiar.fireCooldown - dt);
      if (familiar.fireCooldown <= 0) {
        const target = nearestAliveEnemy(world, familiar, familiar.range * CONFIG.TILE_SIZE);
        if (target) {
          const dir = normalize(target.x - familiar.x, target.y - familiar.y);
          spawnTear(world, {
            x: familiar.x,
            y: familiar.y,
            dir,
            stats: { shotSpeed: 1, damage: familiar.damage, range: familiar.range },
            team: 'player',
            events: ctx.events,
          });
          familiar.fireCooldown = familiar.fireCooldownSeconds;
        }
      }
    }
  }
}
