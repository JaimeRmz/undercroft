/**
 * Moving the player between rooms. Every Room owns its own World, so the
 * player *entity* has to be re-homed into the destination world whenever the
 * current room changes — otherwise anything that finds the player through the
 * world (the renderer, spatial queries) loses it. (This was the root cause of
 * the "player invisible after the first door" playtest bug.)
 */
/** Removes `player` from `fromWorld` (if present) and adds it to `toWorld`. Idempotent. */
export function movePlayerToWorld(player, fromWorld, toWorld) {
  if (fromWorld && fromWorld !== toWorld) fromWorld.entities.remove(player.id);
  if (toWorld && !toWorld.entities.get(player.id)) toWorld.entities.add(player);
}

/**
 * Enters `room` with the player at (x, y): re-homes the entity, zeroes
 * velocity and drops any in-flight charge.
 */
export function placePlayerInRoom(player, fromWorld, room, { x, y }) {
  movePlayerToWorld(player, fromWorld, room.world);
  player.x = x;
  player.y = y;
  player.vx = 0;
  player.vy = 0;
  player.chargeAction = null;
  player.chargeTime = 0;
}
