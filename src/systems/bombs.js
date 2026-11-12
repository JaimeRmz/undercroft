/**
 * Placed bombs: fuse countdown, then an explosion that damages the player and
 * every enemy in range and destroys rocks caught in the blast (CLAUDE.md §3).
 * Opening a secret wall is handled by whoever owns the floor graph (FloorRuntime,
 * via the 'bomb:explode' event) — bombs.js only needs the current Room.
 */
import { circlesOverlap } from '../engine/collision.js';
import { applyDamage } from './health.js';
import { triggerHitFlash } from '../render/vfx.js';

const DEFAULT_FUSE_SECONDS = 1.5; // [assumed]
const DEFAULT_BLAST_RADIUS = 60; // px, [assumed] ~1.5 tiles
const DEFAULT_BLAST_DAMAGE = 4;
const SELF_DAMAGE_HALF_HEARTS = 2; // [assumed] 1 heart of self-damage, matches a careless bomb placement costing a heart

export function placeBomb(world, { x, y, fuseSeconds = DEFAULT_FUSE_SECONDS, radius = DEFAULT_BLAST_RADIUS, damage = DEFAULT_BLAST_DAMAGE }) {
  return world.spawn('bomb', { x, y, radius: 10, fuse: fuseSeconds, blastRadius: radius, damage, tags: ['bomb'] });
}

function explodeBomb(world, bomb, { player, playerHealth, room, events }) {
  events?.emit('bomb:explode', { x: bomb.x, y: bomb.y, radius: bomb.blastRadius });

  if (player && playerHealth?.alive && circlesOverlap(bomb.x, bomb.y, bomb.blastRadius, player.x, player.y, player.radius)) {
    const result = applyDamage(playerHealth, SELF_DAMAGE_HALF_HEARTS, { events, source: 'bomb' });
    if (result.applied > 0) triggerHitFlash(player);
  }

  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    if (!circlesOverlap(bomb.x, bomb.y, bomb.blastRadius, enemy.x, enemy.y, enemy.radius)) continue;
    enemy.hp -= bomb.damage;
    triggerHitFlash(enemy);
    events?.emit('enemy:hit', { enemy, damage: bomb.damage });
    if (enemy.hp <= 0) {
      enemy.destroy();
      events?.emit('enemy:death', { enemy });
    }
  }

  if (room) {
    const tileSize = room.world.tileGrid.tileSize;
    const minTx = Math.floor((bomb.x - bomb.blastRadius) / tileSize);
    const maxTx = Math.floor((bomb.x + bomb.blastRadius) / tileSize);
    const minTy = Math.floor((bomb.y - bomb.blastRadius) / tileSize);
    const maxTy = Math.floor((bomb.y + bomb.blastRadius) / tileSize);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const center = room.world.tileGrid.tileCenter(tx, ty);
        if (Math.hypot(center.x - bomb.x, center.y - bomb.y) <= bomb.blastRadius) {
          room.destroyRock(tx, ty);
        }
      }
    }
  }
}

export function updateBombs(world, dt, { player, playerHealth, room, events } = {}) {
  for (const bomb of world.entities.byType('bomb')) {
    if (!bomb.alive) continue;
    bomb.fuse -= dt;
    if (bomb.fuse <= 0) {
      explodeBomb(world, bomb, { player, playerHealth, room, events });
      bomb.destroy();
    }
  }
}
