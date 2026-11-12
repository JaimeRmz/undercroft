/**
 * Enemy spawning + the per-tick AI dispatch loop, plus the shared "how does
 * an enemy take damage and die" helpers every damage source (tears, bombs,
 * melee, explosions, chain lightning) funnels through — so invulnerability
 * windows (hide-and-pop, burrower, champion) and death reactions (exploder,
 * splitter, champion pickup drop) fire no matter what killed the enemy.
 * Movement/attack AI itself lives in the composable behavior registry
 * (ai/behaviors.js) — this file just builds the entity and calls into it.
 */
import { CONFIG } from '../core/config.js';
import { normalize } from '../core/math.js';
import { runAIOnSpawn, runAIOnUpdate, runAIOnDeath } from './ai/behaviors.js';
import { spawnPickup, PICKUP_TYPE, rollCoinValue } from './pickups.js';
import { triggerHitFlash } from '../render/vfx.js';
import { triggerHitstop } from '../render/hitstop.js';
import { tickEnemyStatus, applyStatusMovementOverride } from './statusEffects.js';

const CHAMPION_SECONDARY_EFFECTS = ['faster', 'explodesOnDeath', 'splitsOnDeath', 'invulnerableUntilOthersDie', 'dropsCoinsOnHit'];
const CHAMPION_COLORS = {
  faster: 'cyan',
  explodesOnDeath: 'red',
  splitsOnDeath: 'green',
  invulnerableUntilOthersDie: 'white',
  dropsCoinsOnHit: 'gold',
};
/** The pickup every champion color guarantees on death (CLAUDE.md §3: "drop a pickup matching their color"). [assumed] mapping */
export const CHAMPION_COLOR_DROP = {
  cyan: PICKUP_TYPE.HEART_HALF,
  red: PICKUP_TYPE.BOMB,
  green: PICKUP_TYPE.HEART_HALF,
  white: PICKUP_TYPE.KEY,
  gold: PICKUP_TYPE.COIN,
};

/** Rolls whether a spawn becomes a champion (CONFIG.CHAMPION_CHANCE), and if so, which secondary effect/color it gets. */
export function rollChampion(rng) {
  if (!rng || !rng.chance(CONFIG.CHAMPION_CHANCE)) return null;
  const effect = rng.pick(CHAMPION_SECONDARY_EFFECTS);
  return { effect, color: CHAMPION_COLORS[effect] };
}

export function spawnEnemy(world, def, { x, y, rng } = {}) {
  const behaviors = def.behaviors ?? (def.behavior ? [def.behavior] : []);
  const champion = def.forceChampion ? { effect: def.forceChampion, color: CHAMPION_COLORS[def.forceChampion] } : rollChampion(rng);

  const enemy = world.spawn('enemy', {
    x,
    y,
    radius: def.radius ?? 14,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed ?? 0,
    behaviors: [...behaviors],
    flies: def.flies ?? false,
    contactDamageHalfHearts: def.contactDamageHalfHearts ?? CONFIG.CONTACT_DAMAGE_HALF_HEARTS,
    fireCooldown: 0,
    fireCooldownSeconds: def.fireCooldownSeconds ?? 1,
    shotSpeed: def.shotSpeed ?? 1,
    damage: def.damage ?? 1,
    range: def.range ?? 5,
    aiTimer: 0,
    aiDir: { x: 0, y: 0 },
    invulnerable: false,
    defId: def.id,
    isChampion: false,
    tags: ['enemy'],
  });

  if (champion) {
    enemy.isChampion = true;
    enemy.championColor = champion.color;
    enemy.hp = Math.round(enemy.hp * CONFIG.CHAMPION_HP_MULT);
    enemy.maxHp = enemy.hp;
    if (champion.effect === 'faster') enemy.speed *= CONFIG.CHAMPION_SPEED_MULT;
    if (champion.effect === 'explodesOnDeath' && !enemy.behaviors.includes('exploder')) enemy.behaviors.push('exploder');
    if (champion.effect === 'splitsOnDeath' && !enemy.behaviors.includes('splitter')) enemy.behaviors.push('splitter');
    if (champion.effect === 'invulnerableUntilOthersDie') enemy.invulnerableUntilOthersDie = true;
    if (champion.effect === 'dropsCoinsOnHit') enemy.dropsCoinsOnHit = true;
  }

  runAIOnSpawn(enemy, { rng });
  return enemy;
}

/** True if any OTHER enemy in the room is still alive (champion "invulnerable until the others die" effect). */
function othersStillAlive(world, enemy) {
  return world.entities.byType('enemy').some((e) => e.alive && e !== enemy);
}

/** Generic (non-directional) invulnerability: hide-and-pop/burrower's hidden phase, or a champion's "until others die" window. */
export function isEnemyDamageBlocked(world, enemy) {
  if (enemy.invulnerable) return true;
  if (enemy.invulnerableUntilOthersDie && othersStillAlive(world, enemy)) return true;
  return false;
}

/** Instant positional push-back (CLAUDE.md §3 "knockback") — not a velocity impulse, since most AI behaviors overwrite vx/vy every tick anyway. */
export function applyKnockback(world, enemy, ctx = {}) {
  let dir = ctx.knockbackDir;
  if (!dir && ctx.knockbackFrom) dir = normalize(enemy.x - ctx.knockbackFrom.x, enemy.y - ctx.knockbackFrom.y);
  if (!dir || (dir.x === 0 && dir.y === 0)) return;
  enemy.x += dir.x * CONFIG.KNOCKBACK_DISTANCE_PX;
  enemy.y += dir.y * CONFIG.KNOCKBACK_DISTANCE_PX;
  if (!enemy.flies) world.resolveTileCollision(enemy);
}

/**
 * Applies flat damage to an enemy (bombs/melee/explosions/chain lightning —
 * anything without a directional tear to check front-armor against), killing
 * it through killEnemy if it drops to 0. Returns the amount actually applied
 * (0 if the enemy was invulnerable).
 */
export function applyEnemyDamage(world, enemy, amount, ctx = {}) {
  if (isEnemyDamageBlocked(world, enemy)) return 0;
  enemy.hp -= amount;
  triggerHitFlash(enemy);
  applyKnockback(world, enemy, ctx);
  ctx.events?.emit('enemy:hit', { enemy, damage: amount });
  if (enemy.hp <= 0) killEnemy(world, enemy, ctx);
  return amount;
}

/** Destroys the enemy, runs its behaviors' onDeath hooks (exploder/splitter), drops a champion pickup if applicable, and emits enemy:death. */
export function killEnemy(world, enemy, ctx = {}) {
  enemy.destroy();
  triggerHitstop(CONFIG.HITSTOP_FRAMES); // CLAUDE.md §3 "~2-frame hitstop on heavy hits" — a kill is the clearest "heavy hit" signal
  runAIOnDeath(world, enemy, ctx);
  if (enemy.isChampion && CHAMPION_COLOR_DROP[enemy.championColor]) {
    const pickupType = CHAMPION_COLOR_DROP[enemy.championColor];
    const value = pickupType === PICKUP_TYPE.COIN && ctx.rng ? rollCoinValue(ctx.rng) : 1;
    spawnPickup(world, pickupType, { x: enemy.x, y: enemy.y, value });
  }
  ctx.events?.emit('enemy:death', { enemy });
}

export function updateEnemies(world, player, dt, { events, rng } = {}) {
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;

    const { frozen, dotDamage } = tickEnemyStatus(enemy, dt);
    if (dotDamage > 0) applyEnemyDamage(world, enemy, dotDamage, { events, rng });
    if (!enemy.alive) continue;

    if (frozen) {
      enemy.vx = 0;
      enemy.vy = 0;
      continue;
    }

    runAIOnUpdate(world, enemy, player, dt, { events, rng });
    applyStatusMovementOverride(world, enemy, player, dt, rng);
  }
}
