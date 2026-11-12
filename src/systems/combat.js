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

export function resolveCombat(world, { player, playerHealth, events } = {}) {
  if (player && playerHealth?.alive) {
    for (const enemy of world.entities.byType('enemy')) {
      if (!enemy.alive) continue;
      if (circlesOverlap(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        const result = applyDamage(playerHealth, enemy.contactDamageHalfHearts, { events, source: enemy.defId });
        if (result.applied > 0) triggerHitFlash(player);
      }
    }
  }

  for (const projectile of world.entities.byType('projectile')) {
    if (!projectile.alive) continue;

    if (projectile.team === 'player') {
      for (const enemy of world.entities.byType('enemy')) {
        if (!enemy.alive) continue;
        if (!circlesOverlap(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius)) continue;

        projectile.hitEnemyIds = projectile.hitEnemyIds ?? new Set();
        if (projectile.hitEnemyIds.has(enemy.id)) continue;
        projectile.hitEnemyIds.add(enemy.id);

        enemy.hp -= projectile.damage;
        triggerHitFlash(enemy);
        events?.emit('enemy:hit', { enemy, damage: projectile.damage });
        if (enemy.hp <= 0) {
          enemy.destroy();
          events?.emit('enemy:death', { enemy });
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
