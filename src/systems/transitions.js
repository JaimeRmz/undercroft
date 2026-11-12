/**
 * Room-to-room transitions: detecting a door crossing, and the ~0.25s slide
 * progress state machine (CLAUDE.md §3 game feel). Pure logic — the renderer
 * reads `progress`/`direction` to offset the camera; it doesn't own this state.
 */
export const TRANSITION_DURATION = 0.25;

const OPPOSITE_SIDE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const SIDE_DELTA = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export function oppositeSide(side) {
  return OPPOSITE_SIDE[side];
}

export function sideDelta(side) {
  return SIDE_DELTA[side];
}

/** Returns the door side the player is currently standing on, if that door is unlocked — else null. */
export function detectDoorExit(room, player) {
  const { tx, ty } = room.world.tileGrid.worldToTile(player.x, player.y);
  for (const [side, door] of room.doors) {
    if (door.locked) continue;
    if (tx === door.tx && ty === door.ty) return side;
  }
  return null;
}

/** World position just inside `side`'s door — where a player entering from that side should appear. */
export function entryPositionForSide(room, side) {
  const door = room.doors.get(side);
  const tileSize = room.world.tileGrid.tileSize;
  const center = room.world.tileGrid.tileCenter(door.tx, door.ty);
  const inward = { north: { x: 0, y: 1 }, south: { x: 0, y: -1 }, east: { x: -1, y: 0 }, west: { x: 1, y: 0 } }[side];
  return { x: center.x + inward.x * tileSize, y: center.y + inward.y * tileSize };
}

export function createTransitionState() {
  return { active: false, direction: null, progress: 0 };
}

export function startTransition(state, direction) {
  state.active = true;
  state.direction = direction;
  state.progress = 0;
}

/** Advances the slide by dt; returns true on the tick it completes. */
export function updateTransition(state, dt, duration = TRANSITION_DURATION) {
  if (!state.active) return false;
  state.progress = Math.min(1, state.progress + dt / duration);
  if (state.progress >= 1) {
    state.active = false;
    return true;
  }
  return false;
}

/** Camera pixel offset (old-room-exiting, new-room-entering) for a slide in `direction` at `progress` [0,1]. */
export function transitionCameraOffsets(direction, progress, viewportWidth, viewportHeight) {
  const delta = SIDE_DELTA[direction];
  const dx = delta.dx * viewportWidth * progress;
  const dy = delta.dy * viewportHeight * progress;
  return {
    oldRoomOffset: { x: -dx || 0, y: -dy || 0 },
    newRoomOffset: { x: viewportWidth * delta.dx - dx || 0, y: viewportHeight * delta.dy - dy || 0 },
  };
}

