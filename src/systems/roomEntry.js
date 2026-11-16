/**
 * Moving the player between rooms. Every Room owns its own World, so the
 * player *entity* has to be re-homed into the destination world whenever the
 * current room changes — otherwise anything that finds the player through the
 * world (the renderer, spatial queries) loses it. (This was the root cause of
 * the "player invisible after the first door" playtest bug.)
 */
import { CONFIG } from '../core/config.js';

/** Removes `player` from `fromWorld` (if present) and adds it to `toWorld`. Idempotent. */
export function movePlayerToWorld(player, fromWorld, toWorld) {
  if (fromWorld && fromWorld !== toWorld) fromWorld.entities.remove(player.id);
  if (toWorld && !toWorld.entities.get(player.id)) toWorld.entities.add(player);
}

/**
 * Enters `room` with the player at (x, y): re-homes the entity, zeroes
 * velocity, drops any in-flight charge, and starts the enemy grace period:
 * nothing in the new room moves or attacks for CONFIG.ROOM_ENTRY_GRACE_SECONDS.
 */
export function placePlayerInRoom(player, fromWorld, room, { x, y }) {
  movePlayerToWorld(player, fromWorld, room.world);
  player.x = x;
  player.y = y;
  player.vx = 0;
  player.vy = 0;
  player.chargeAction = null;
  player.chargeTime = 0;
  room.world.enemyGraceTimer = CONFIG.ROOM_ENTRY_GRACE_SECONDS;
}

/**
 * Re-homes every familiar entity (P2.4) into the destination world alongside
 * the player, same reason placePlayerInRoom re-homes the player itself — each
 * Room owns its own World, so anything that's supposed to persist across a
 * door has to be physically moved into the new one. Snaps each familiar to
 * the player's new position so it doesn't render at a stale old-room
 * coordinate for the one frame before updateFamiliars repositions it.
 */
export function placeFamiliarsInRoom(fromWorld, toWorld, player) {
  if (!fromWorld || fromWorld === toWorld) return;
  for (const familiar of fromWorld.entities.byType('familiar')) {
    if (!familiar.alive) continue;
    fromWorld.entities.remove(familiar.id);
    toWorld.entities.add(familiar);
    familiar.x = player.x;
    familiar.y = player.y;
  }
}
