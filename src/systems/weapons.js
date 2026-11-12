/**
 * Weapon types override the player's base attack (CLAUDE.md §3): normal,
 * multishot spread, laser (a fast piercing tear — still a real tear, so
 * modifiers like homing can bend it), melee (instant adjacent hitbox), and
 * bombs-as-shots (a tear that explodes on contact, reusing the 'exploding'
 * tear modifier). Picking up a higher-priority weapon-type item overrides a
 * lower one; modifiers still apply on top either way.
 */
import { spawnTear } from './projectiles.js';
import { circlesOverlap } from '../engine/collision.js';
import { CONFIG } from '../core/config.js';
import { applyEnemyDamage } from './enemies.js';

function fireNormal(world, player, dir, ctx) {
  return [
    spawnTear(world, {
      x: player.x,
      y: player.y,
      dir,
      stats: player.stats,
      ownerVelocity: { x: player.vx, y: player.vy },
      modifiers: player.tearModifiers ?? [],
    }),
  ];
}

function fireMultishot(world, player, dir, ctx) {
  const count = player.multishotCount ?? 3;
  const spread = player.multishotSpreadRad ?? 0.3;
  const baseAngle = Math.atan2(dir.y, dir.x);
  const tears = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = baseAngle + t * spread * 2;
    const spreadDir = { x: Math.cos(angle), y: Math.sin(angle) };
    tears.push(
      spawnTear(world, {
        x: player.x,
        y: player.y,
        dir: spreadDir,
        stats: player.stats,
        ownerVelocity: { x: player.vx, y: player.vy },
        modifiers: player.tearModifiers ?? [],
      })
    );
  }
  return tears;
}

function fireLaser(world, player, dir, ctx) {
  const tear = spawnTear(world, {
    x: player.x,
    y: player.y,
    dir,
    stats: player.stats,
    ownerVelocity: { x: player.vx, y: player.vy },
    modifiers: [...(player.tearModifiers ?? []), 'piercing'],
  });
  tear.pierceRemaining = Infinity; // a laser pierces everything
  tear.isLaser = true;
  return [tear];
}

function fireMelee(world, player, dir, ctx) {
  const reach = 40; // [assumed] px
  const hitX = player.x + dir.x * reach;
  const hitY = player.y + dir.y * reach;
  const hitRadius = 24;
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    if (!circlesOverlap(hitX, hitY, hitRadius, enemy.x, enemy.y, enemy.radius)) continue;
    applyEnemyDamage(world, enemy, player.stats.damage, ctx);
  }
  return [];
}

/**
 * Charge shot: the player must hold the aim direction (tracked in player.js's
 * updatePlayer via chargeAction/chargeTime) before this fires. `ctx.chargeFraction`
 * (0..1, set by player.js from the held duration) scales the tear's damage and
 * size up to CONFIG.CHARGE_SHOT_MAX_DAMAGE_MULT/_RADIUS_MULT at full charge.
 */
function fireChargeShot(world, player, dir, ctx) {
  const chargeFraction = ctx.chargeFraction ?? 1;
  const tear = spawnTear(world, {
    x: player.x,
    y: player.y,
    dir,
    stats: player.stats,
    ownerVelocity: { x: player.vx, y: player.vy },
    modifiers: player.tearModifiers ?? [],
  });
  tear.damage *= 1 + chargeFraction * (CONFIG.CHARGE_SHOT_MAX_DAMAGE_MULT - 1);
  tear.radius *= 1 + chargeFraction * (CONFIG.CHARGE_SHOT_MAX_RADIUS_MULT - 1);
  return [tear];
}

function fireBombShot(world, player, dir, ctx) {
  const tear = spawnTear(world, {
    x: player.x,
    y: player.y,
    dir,
    stats: player.stats,
    ownerVelocity: { x: player.vx, y: player.vy },
    modifiers: [...(player.tearModifiers ?? []), { id: 'exploding', config: { radius: 70 } }],
  });
  return [tear];
}

/** Lower index = lower priority. A weapon type only takes over if its priority is >= the current one. */
export const WEAPON_TYPES = {
  normal: { priority: 0, fire: fireNormal },
  multishot: { priority: 1, fire: fireMultishot },
  bombShot: { priority: 2, fire: fireBombShot },
  melee: { priority: 2, fire: fireMelee },
  chargeShot: { priority: 2, fire: fireChargeShot, charges: true },
  laser: { priority: 3, fire: fireLaser },
};

export function setWeaponType(player, type) {
  const next = WEAPON_TYPES[type];
  if (!next) return false;
  const currentPriority = WEAPON_TYPES[player.weaponType ?? 'normal']?.priority ?? 0;
  if (next.priority < currentPriority) return false;
  player.weaponType = type;
  return true;
}

export function fireWeapon(world, player, dir, ctx = {}) {
  const weapon = WEAPON_TYPES[player.weaponType ?? 'normal'];
  return weapon.fire(world, player, dir, ctx);
}
