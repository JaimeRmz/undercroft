/**
 * Per-tile floor hazards (P2.Q Q3b): spikes and open flames hurt the player
 * when their circle overlaps a hazard tile. Damage is gated by the player's
 * existing i-frames (applyDamage ignores a hit while invulnerable), so standing
 * in spikes deals about one hit per i-frame cycle rather than every tick —
 * matching how a floor hazard reads in the reference. A flying player (a
 * transformation granting flight) floats over hazards unharmed.
 */
import { CONFIG } from '../core/config.js';
import { applyDamage } from './health.js';
import { TILE } from './room.js';

/** Maps a hazard tile type to the death-cause keyword describeDeathCause understands. */
function hazardSource(type) {
  return type === TILE.FIREPLACE ? 'fire' : 'spikes';
}

/**
 * Applies hazard-tile damage to the player for the current frame. Returns the
 * half-hearts actually dealt (0 if none / invulnerable / flying). Checks every
 * tile the player's circle touches, so a player clipping the edge of a spike
 * still takes the hit.
 */
export function resolveTileHazards(room, player, playerHealth, { events } = {}) {
  if (!player || !playerHealth?.alive || player.flying) return 0;
  const grid = room.world.tileGrid;
  const r = player.radius;
  const minTx = Math.floor((player.x - r) / grid.tileSize);
  const maxTx = Math.floor((player.x + r) / grid.tileSize);
  const minTy = Math.floor((player.y - r) / grid.tileSize);
  const maxTy = Math.floor((player.y + r) / grid.tileSize);

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!grid.isHazard(tx, ty)) continue;
      const result = applyDamage(playerHealth, CONFIG.HAZARD_CONTACT_DAMAGE_HALF_HEARTS, {
        events,
        source: hazardSource(room.getTileType(tx, ty)),
      });
      return result.applied; // at most one hazard hit per frame; i-frames block the rest anyway
    }
  }
  return 0;
}
