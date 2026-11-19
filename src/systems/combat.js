/**
 * Connects projectiles, enemies, and the player's Health: contact damage,
 * tears hitting enemies, enemy tears hitting the player. Player tears defer
 * to their attached tear modifiers (tearModifiers.js) to decide whether a
 * hit destroys them (piercing/splitting/exploding keep going or replace
 * themselves). Each tear tracks which enemies it's already hit so a
 * piercing/orbiting tear can't melt one enemy by re-hitting it every tick
 * while overlapping. A charmed enemy (statusEffects.js) is the one exception
 * to "enemies hurt the player on contact" — it deals no player contact
 * damage and instead attacks other enemies on a cooldown.
 */
import { circlesOverlap } from '../engine/collision.js';
import { applyDamage } from './health.js';
import { triggerHitFlash, triggerSquash, triggerHurtTint } from '../render/vfx.js';
import { normalize } from '../core/math.js';
import { runModifiersOnHitEnemy } from './tearModifiers.js';
import { isEnemyDamageBlocked, applyEnemyDamage } from './enemies.js';
import { spawnPickup, PICKUP_TYPE } from './pickups.js';
import { CONFIG } from '../core/config.js';

/** Front-armored knights take only a fraction of damage when hit from the side they're facing (CONFIG.FRONT_ARMOR_DAMAGE_MULT). */
function damageMultiplierFor(enemy, projectile) {
  if (!enemy.frontArmored || !enemy.facing) return 1;
  const travelSpeed = Math.hypot(projectile.vx, projectile.vy);
  if (travelSpeed === 0) return 1;
  const incomingFrom = { x: -projectile.vx / travelSpeed, y: -projectile.vy / travelSpeed };
  const dot = incomingFrom.x * enemy.facing.x + incomingFrom.y * enemy.facing.y;
  return dot > 0.3 ? CONFIG.FRONT_ARMOR_DAMAGE_MULT : 1;
}

/** Player feedback on taking a hit (P2.Q Q2a): white flash + squash + red tint + an instant knockback away from `dir`. */
function hurtPlayer(world, player, dir) {
  triggerHitFlash(player);
  triggerSquash(player);
  triggerHurtTint(player);
  if (dir && (dir.x || dir.y)) {
    player.x += dir.x * CONFIG.PLAYER_KNOCKBACK_DISTANCE_PX;
    player.y += dir.y * CONFIG.PLAYER_KNOCKBACK_DISTANCE_PX;
    if (!player.flying) world.resolveTileCollision(player);
  }
}

export function resolveCombat(world, { player, playerHealth, events, rng } = {}) {
  const enemies = world.entities.byType('enemy');

  const enemiesInert = world.enemyGraceTimer > 0; // entry grace: no enemy damage of any kind

  if (player && playerHealth?.alive && !enemiesInert) {
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.status?.charm) continue; // charmed enemies no longer hurt the player (CLAUDE.md §3)
      if (circlesOverlap(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        const result = applyDamage(playerHealth, enemy.contactDamageHalfHearts, { events, source: enemy.defId });
        if (result.applied > 0) {
          hurtPlayer(world, player, normalize(player.x - enemy.x, player.y - enemy.y));
          if (enemy.dropsCoinsOnHit) {
            spawnPickup(world, PICKUP_TYPE.COIN, { x: enemy.x, y: enemy.y, value: CONFIG.CHAMPION_COINS_ON_HIT_VALUE });
          }
        }
      }
    }
  }

  // A charmed enemy fights for the player: it deals its own contact damage to
  // any other enemy it touches, on a cooldown (otherwise it would deal full
  // damage every single tick of overlap). resolveCombat runs once per fixed
  // 60Hz tick everywhere it's called, so the cooldown is counted in ticks
  // rather than needing a dt parameter threaded through every call site.
  for (const charmed of enemies) {
    if (!charmed.alive || !charmed.status?.charm) continue;
    charmed.charmAttackCooldownTicks = Math.max(0, (charmed.charmAttackCooldownTicks ?? 0) - 1);
    if (charmed.charmAttackCooldownTicks > 0) continue;
    for (const other of enemies) {
      if (other === charmed || !other.alive || isEnemyDamageBlocked(world, other)) continue;
      if (circlesOverlap(charmed.x, charmed.y, charmed.radius, other.x, other.y, other.radius)) {
        applyEnemyDamage(world, other, charmed.damage, { events, rng });
        charmed.charmAttackCooldownTicks = CONFIG.CHARM_ATTACK_COOLDOWN_TICKS;
        break;
      }
    }
  }

  for (const projectile of world.entities.byType('projectile')) {
    if (!projectile.alive) continue;

    if (projectile.team === 'player') {
      for (const enemy of world.entities.byType('enemy')) {
        if (!enemy.alive) continue;
        if (!circlesOverlap(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius)) continue;
        if (isEnemyDamageBlocked(world, enemy)) continue;

        projectile.hitEnemyIds = projectile.hitEnemyIds ?? new Set();
        if (projectile.hitEnemyIds.has(enemy.id)) continue;
        projectile.hitEnemyIds.add(enemy.id);

        applyEnemyDamage(world, enemy, projectile.damage * damageMultiplierFor(enemy, projectile), {
          player, playerHealth, events, rng,
          knockbackDir: normalize(projectile.vx, projectile.vy),
        });

        const keepAlive = runModifiersOnHitEnemy(projectile, enemy, { world, events });
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
        if (!keepAlive) {
          projectile.destroy();
          break;
        }
      }
    } else if (projectile.team === 'enemy' && player && playerHealth?.alive && !enemiesInert) {
      if (circlesOverlap(projectile.x, projectile.y, projectile.radius, player.x, player.y, player.radius)) {
        const result = applyDamage(playerHealth, Math.round(projectile.damage), { events, source: projectile.ownerDefId ?? 'enemy-projectile' });
        if (result.applied > 0) {
          hurtPlayer(world, player, normalize(projectile.vx, projectile.vy));
        }
        projectile.destroy();
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
      }
    }
  }
}
