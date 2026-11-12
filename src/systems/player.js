/**
 * Player controller: movement feel (accel/friction, diagonal-normalized) and
 * 4-way shooting that's independent of movement direction (CLAUDE.md §3).
 * Shooting direction follows whichever arrow key was most recently pressed,
 * falling back to any other currently-held shoot key when that one releases.
 */
import { CONFIG } from '../core/config.js';
import { normalizeDiagonal, moveToward } from '../core/math.js';
import { fireWeapon, WEAPON_TYPES } from './weapons.js';

const SHOOT_DIRS = {
  shootUp: { x: 0, y: -1 },
  shootDown: { x: 0, y: 1 },
  shootLeft: { x: -1, y: 0 },
  shootRight: { x: 1, y: 0 },
};
const SHOOT_ORDER = ['shootUp', 'shootDown', 'shootLeft', 'shootRight'];

export function createPlayer(world, { x, y, stats }) {
  return world.spawn('player', {
    x,
    y,
    radius: CONFIG.PLAYER_RADIUS,
    stats,
    fireCooldown: 0,
    aimAction: null,
    speedBoostTimer: 0,
    speedBoostMult: 1,
    weaponType: 'normal',
    tearModifiers: [],
    chargeAction: null,
    chargeTime: 0,
    tags: ['player'],
  });
}

function resolveShootAction(input, currentAction) {
  for (const action of SHOOT_ORDER) {
    if (input.justPressed.has(action)) return action;
  }
  if (currentAction && input.held.has(currentAction)) return currentAction;
  for (const action of SHOOT_ORDER) {
    if (input.held.has(action)) return action;
  }
  return null;
}

export function updatePlayer(world, player, input, dt, { events } = {}) {
  if (player.speedBoostTimer > 0) {
    player.speedBoostTimer = Math.max(0, player.speedBoostTimer - dt);
    if (player.speedBoostTimer === 0) player.speedBoostMult = 1;
  }

  const inputDir = normalizeDiagonal(input.moveX, input.moveY);
  const maxSpeed = player.stats.clampedSpeed * player.speedBoostMult * CONFIG.PLAYER_BASE_SPEED_PX_PER_SEC;
  const targetVx = inputDir.x * maxSpeed;
  const targetVy = inputDir.y * maxSpeed;
  const accelerating = inputDir.x !== 0 || inputDir.y !== 0;
  const frames = accelerating ? CONFIG.PLAYER_ACCEL_FRAMES : CONFIG.PLAYER_FRICTION_FRAMES;
  const maxDelta = (maxSpeed / frames) * (dt * CONFIG.TICK_RATE);

  player.vx = moveToward(player.vx, targetVx, maxDelta);
  player.vy = moveToward(player.vy, targetVy, maxDelta);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  world.resolveTileCollision(player);

  player.aimAction = resolveShootAction(input, player.aimAction);
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  const weapon = WEAPON_TYPES[player.weaponType ?? 'normal'];
  if (weapon.charges) {
    // Hold-to-charge weapons (charge shot): accumulate charge while the aim
    // direction stays held, firing an empowered shot on release or at max charge.
    if (player.aimAction) {
      if (player.chargeAction !== player.aimAction) {
        player.chargeAction = player.aimAction;
        player.chargeTime = 0;
      }
      player.chargeTime = Math.min(player.chargeTime + dt, CONFIG.CHARGE_SHOT_MAX_SECONDS);
    }
    const stillHeld = player.chargeAction && input.held.has(player.chargeAction);
    const maxed = player.chargeTime >= CONFIG.CHARGE_SHOT_MAX_SECONDS;
    if (player.chargeAction && (!stillHeld || maxed) && player.fireCooldown <= 0) {
      const dir = SHOOT_DIRS[player.chargeAction];
      const chargeFraction = player.chargeTime / CONFIG.CHARGE_SHOT_MAX_SECONDS;
      fireWeapon(world, player, dir, { events, chargeFraction });
      player.fireCooldown = player.stats.fireCooldownSeconds;
      events?.emit('player:shoot', { player, dir });
      player.chargeAction = null;
      player.chargeTime = 0;
    }
  } else if (player.aimAction && player.fireCooldown <= 0) {
    const dir = SHOOT_DIRS[player.aimAction];
    fireWeapon(world, player, dir, { events });
    player.fireCooldown = player.stats.fireCooldownSeconds;
    events?.emit('player:shoot', { player, dir });
  }
}
