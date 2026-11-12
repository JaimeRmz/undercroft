/**
 * Connects projectiles, enemies, and the player's Health: contact damage,
 * tears hitting enemies, enemy tears hitting the player. No piercing yet
 * (P1.5 adds tear modifiers) — one tear resolves against at most one target.
 */
import { circlesOverlap } from '../engine/collision.js';
import { applyDamage } from './health.js';

export function resolveCombat(world, { player, playerHealth, events } = {}) {
  if (player && playerHealth?.alive) {
    for (const enemy of world.entities.byType('enemy')) {
      if (!enemy.alive) continue;
      if (circlesOverlap(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        applyDamage(playerHealth, enemy.contactDamageHalfHearts, { events, source: enemy.defId });
      }
    }
  }

  for (const projectile of world.entities.byType('projectile')) {
    if (!projectile.alive) continue;

    if (projectile.team === 'player') {
      for (const enemy of world.entities.byType('enemy')) {
        if (!enemy.alive) continue;
        if (!circlesOverlap(projectile.x, projectile.y, projectile.radius, enemy.x, enemy.y, enemy.radius)) continue;
        enemy.hp -= projectile.damage;
        events?.emit('enemy:hit', { enemy, damage: projectile.damage });
        projectile.destroy();
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
        if (enemy.hp <= 0) {
          enemy.destroy();
          events?.emit('enemy:death', { enemy });
        }
        break;
      }
    } else if (projectile.team === 'enemy' && player && playerHealth?.alive) {
      if (circlesOverlap(projectile.x, projectile.y, projectile.radius, player.x, player.y, player.radius)) {
        applyDamage(playerHealth, Math.round(projectile.damage), { events, source: 'enemy-projectile' });
        projectile.destroy();
        events?.emit('projectile:splash', { entity: projectile, reason: 'hit' });
      }
    }
  }
}
