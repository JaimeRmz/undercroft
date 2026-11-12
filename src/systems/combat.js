/**
 * Connects projectiles, enemies, and the player's Health: contact damage,
 * tears hitting enemies, enemy tears hitting the player. Player tears defer
 * to their attached tear modifiers (tearModifiers.js) to decide whether a
 * hit destroys them (piercing/splitting/exploding keep going or replace
 * themselves). Each tear tracks which enemies it's already hit so a
 * piercing/orbiting tear can't melt one enemy by re-hitting it every tick
 * while overlapping.
 */
import { circlesOverlap } from '../engine/collision.js';
import { applyDamage } from './health.js';
import { triggerHitFlash } from '../render/vfx.js';
import { runModifiersOnHitEnemy } from './tearModifiers.js';
import { isEnemyDamageBlocked, killEnemy } from './enemies.js';
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

export function resolveCombat(world, { player, playerHealth, events, rng } = {}) {
  if (player && playerHealth?.alive) {
    for (const enemy of world.entities.byType('enemy')) {
      if (!enemy.alive) continue;
      if (circlesOverlap(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        const result = applyDamage(playerHealth, enemy.contactDamageHalfHearts, { events, source: enemy.defId });
        if (result.applied > 0) {
          triggerHitFlash(player);
          if (enemy.dropsCoinsOnHit) {
            spawnPickup(world, PICKUP_TYPE.COIN, { x: enemy.x, y: enemy.y, value: CONFIG.CHAMPION_COINS_ON_HIT_VALUE });
          }
        }
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

        enemy.hp -= projectile.damage * damageMultiplierFor(enemy, projectile);
        triggerHitFlash(enemy);
        events?.emit('enemy:hit', { enemy, damage: projectile.damage });
        if (enemy.hp <= 0) {
          killEnemy(world, enemy, { player, playerHealth, events, rng });
        }

        const keepAlive = runModifiersOnHitEnemy(projectile, enemy, { world, events });
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
        if (!keepAlive) {
          projectile.destroy();
          break;
        }
      }
    } else if (projectile.team === 'enemy' && player && playerHealth?.alive) {
      if (circlesOverlap(projectile.x, projectile.y, projectile.radius, player.x, player.y, player.radius)) {
        const result = applyDamage(playerHealth, Math.round(projectile.damage), { events, source: 'enemy-projectile' });
        if (result.applied > 0) triggerHitFlash(player);
        projectile.destroy();
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
      }
    }
  }
}
