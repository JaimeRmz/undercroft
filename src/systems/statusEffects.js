/**
 * Status effects on enemies (CLAUDE.md §3): poison/burn tick damage over
 * time; slow/freeze/charm/fear/confuse override movement. Durations/DOT are
 * owned here — tearModifiers.js's status-tag modifiers just call
 * applyStatus() on hit. No dependency on enemies.js (which would create an
 * import cycle, since enemies.js is this module's caller): DOT is reported
 * back as a number for the caller to run through applyEnemyDamage itself.
 *
 * Bosses get an ~8s immunity window the instant a status is applied
 * (CLAUDE.md §3), during which further applications are ignored; whatever
 * status is already running still plays out on its own timer.
 */
import { CONFIG } from '../core/config.js';
import { normalize } from '../core/math.js';

const DOT_STATUSES = {
  poison: CONFIG.POISON_DPS,
  burn: CONFIG.BURN_DPS,
};

const DURATION_BY_STATUS = {
  poison: CONFIG.POISON_DURATION_SECONDS,
  burn: CONFIG.BURN_DURATION_SECONDS,
  slow: CONFIG.SLOW_DURATION_SECONDS,
  freeze: CONFIG.FREEZE_DURATION_SECONDS,
  charm: CONFIG.CHARM_DURATION_SECONDS,
  fear: CONFIG.FEAR_DURATION_SECONDS,
  confuse: CONFIG.CONFUSE_DURATION_SECONDS,
};

/** Applies (or refreshes) a status by name. Returns false if blocked by a boss's post-affliction immunity window. */
export function applyStatus(enemy, name) {
  if (enemy.statusImmuneTimer > 0) return false;
  enemy.status = enemy.status ?? {};
  enemy.status[name] = { timer: DURATION_BY_STATUS[name] ?? 4, tickTimer: 1 };
  if (enemy.isBoss) enemy.statusImmuneTimer = CONFIG.BOSS_STATUS_IMMUNITY_SECONDS;
  return true;
}

export function hasStatus(enemy, name) {
  return !!enemy.status?.[name];
}

/**
 * Ticks every active status's duration (and the boss immunity timer).
 * Returns { frozen, dotDamage }: `frozen` means the caller should skip AI/
 * movement entirely this tick; `dotDamage` is this tick's poison/burn damage
 * for the caller to apply (so this module never has to import enemies.js).
 */
export function tickEnemyStatus(enemy, dt) {
  if (enemy.statusImmuneTimer > 0) enemy.statusImmuneTimer = Math.max(0, enemy.statusImmuneTimer - dt);
  if (!enemy.status) return { frozen: false, dotDamage: 0 };

  let dotDamage = 0;
  for (const name of Object.keys(enemy.status)) {
    const s = enemy.status[name];
    s.timer -= dt;
    if (s.timer <= 0) {
      delete enemy.status[name];
      continue;
    }
    const dps = DOT_STATUSES[name];
    if (dps) {
      s.tickTimer -= dt;
      if (s.tickTimer <= 0) {
        s.tickTimer += 1;
        dotDamage += dps;
      }
    }
  }

  return { frozen: !!enemy.status.freeze, dotDamage };
}

function findNearestOtherEnemy(world, enemy) {
  let nearest = null;
  let bestDistSq = Infinity;
  for (const other of world.entities.byType('enemy')) {
    if (!other.alive || other === enemy) continue;
    const dx = other.x - enemy.x;
    const dy = other.y - enemy.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      nearest = other;
    }
  }
  return nearest;
}

/**
 * Overrides whatever vx/vy the normal AI just computed for confuse/fear/charm,
 * then scales the result down for slow. Call after runAIOnUpdate, and only
 * when tickEnemyStatus didn't report `frozen` (freeze is handled by the
 * caller zeroing velocity and skipping AI entirely).
 */
export function applyStatusMovementOverride(world, enemy, player, dt, rng) {
  if (!enemy.status) return;

  if (enemy.status.confuse) {
    enemy.confuseRedirectTimer = (enemy.confuseRedirectTimer ?? 0) - dt;
    if (!(enemy.confuseRedirectTimer > 0)) {
      enemy.confuseRedirectTimer = CONFIG.CONFUSE_REDIRECT_SECONDS;
      const angle = (rng ? rng.next() : Math.random()) * Math.PI * 2;
      enemy.vx = Math.cos(angle) * enemy.speed;
      enemy.vy = Math.sin(angle) * enemy.speed;
    }
  } else if (enemy.status.fear && player) {
    const dir = normalize(enemy.x - player.x, enemy.y - player.y);
    enemy.vx = dir.x * enemy.speed;
    enemy.vy = dir.y * enemy.speed;
  } else if (enemy.status.charm) {
    const target = findNearestOtherEnemy(world, enemy);
    if (target) {
      const dir = normalize(target.x - enemy.x, target.y - enemy.y);
      enemy.vx = dir.x * enemy.speed;
      enemy.vy = dir.y * enemy.speed;
    } else {
      enemy.vx = 0;
      enemy.vy = 0;
    }
  }

  if (enemy.status.slow) {
    enemy.vx *= CONFIG.SLOW_SPEED_MULT;
    enemy.vy *= CONFIG.SLOW_SPEED_MULT;
  }
}
