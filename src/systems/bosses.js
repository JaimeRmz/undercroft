/**
 * Boss framework (CLAUDE.md §3 Bosses): data-driven phases at HP thresholds,
 * each with a weighted attack pattern list (bossPatterns.js). Bosses are
 * spawned as regular 'enemy' entities (isBoss: true) so combat.js, room
 * clear-locking, and hit-flash all just work — only the pattern state
 * machine is boss-specific, wired in as the 'bossAI' AI behavior so it
 * runs through the same updateEnemies() dispatch as every other archetype.
 */
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/math.js';
import { registerAIBehavior } from './ai/behaviors.js';
import { getBossPattern } from './ai/bossPatterns.js';
import { circlesOverlap } from '../engine/collision.js';

/** Boss HP scales with floor stage (CLAUDE.md §3: "Boss HP scales with floor"). [assumed] +50%/stage. */
export function scaledBossHp(baseHp, stage) {
  return Math.round(baseHp * (1 + CONFIG.BOSS_HP_PER_STAGE_MULT * (stage - 1)));
}

/** phases must be ordered full-health-first; returns the deepest phase whose hpThreshold the boss has dropped to or below. */
export function resolvePhaseIndex(phases, hpFraction) {
  for (let i = phases.length - 1; i >= 0; i--) {
    if (hpFraction <= phases[i].hpThreshold) return i;
  }
  return 0;
}

export function spawnBoss(world, def, { x, y, stage = 1 } = {}) {
  const hp = scaledBossHp(def.hp, stage);
  return world.spawn('enemy', {
    x,
    y,
    radius: def.radius ?? 28,
    hp,
    maxHp: hp,
    speed: def.speed ?? 0,
    behaviors: ['bossAI'],
    flies: def.flies ?? false,
    contactDamageHalfHearts: def.contactDamageHalfHearts ?? CONFIG.CONTACT_DAMAGE_HALF_HEARTS,
    shotSpeed: def.shotSpeed ?? 1,
    damage: def.damage ?? 2,
    range: def.range ?? 8,
    defId: def.id,
    isBoss: true,
    isChampion: false,
    invulnerable: false,
    phases: def.phases,
    currentPhaseIndex: 0,
    patternState: 'cooldown',
    patternTimer: def.initialCooldownSeconds ?? 1,
    currentPatternId: null,
    patternElapsed: 0,
    tags: ['enemy', 'boss'],
  });
}

registerAIBehavior('bossAI', {
  onUpdate(world, boss, player, dt, ctx) {
    const hpFraction = clamp(boss.maxHp > 0 ? boss.hp / boss.maxHp : 0, 0, 1);
    const phaseIndex = resolvePhaseIndex(boss.phases, hpFraction);
    if (phaseIndex !== boss.currentPhaseIndex) {
      boss.currentPhaseIndex = phaseIndex;
      ctx.events?.emit('boss:phase', { boss, phaseIndex });
    }
    const phase = boss.phases[phaseIndex];

    if (boss.patternState === 'cooldown') {
      boss.patternTimer -= dt;
      if (boss.patternTimer <= 0) {
        const entries = phase.patterns.map((p) => ({ item: p.id, weight: p.weight ?? 1 }));
        const patternId = ctx.rng ? ctx.rng.weighted(entries) : phase.patterns[0].id;
        const pattern = getBossPattern(patternId);
        if (!pattern) {
          boss.patternTimer = CONFIG.BOSS_PATTERN_DEFAULT_COOLDOWN_SECONDS;
          return;
        }
        boss.currentPatternId = patternId;
        boss.patternState = 'telegraph';
        boss.patternTimer = pattern.telegraphSeconds;
        pattern.onTelegraphStart?.(world, boss, player, ctx);
        ctx.events?.emit('boss:telegraph', { boss, patternId, duration: pattern.telegraphSeconds });
      }
    } else if (boss.patternState === 'telegraph') {
      boss.patternTimer -= dt;
      if (boss.patternTimer <= 0) {
        const pattern = getBossPattern(boss.currentPatternId);
        boss.patternState = 'executing';
        boss.patternElapsed = 0;
        pattern.onStart?.(world, boss, player, ctx);
        ctx.events?.emit('boss:attack', { boss, patternId: boss.currentPatternId });
      }
    } else if (boss.patternState === 'executing') {
      const pattern = getBossPattern(boss.currentPatternId);
      const result = pattern.onTick?.(world, boss, player, dt, ctx);
      boss.patternElapsed += dt;
      if (result?.done || boss.patternElapsed >= pattern.durationSeconds) {
        boss.patternState = 'cooldown';
        boss.patternTimer = pattern.cooldownSeconds;
      }
    }
  },
});

export function spawnTrapdoor(world, { x, y }) {
  return world.spawn('trapdoor', { x, y, radius: 18, tags: ['trapdoor'] });
}

/** Returns true the tick the player steps onto a trapdoor (caller advances the floor). */
export function resolveTrapdoor(world, player) {
  for (const trapdoor of world.entities.byType('trapdoor')) {
    if (!trapdoor.alive) continue;
    if (circlesOverlap(trapdoor.x, trapdoor.y, trapdoor.radius, player.x, player.y, player.radius)) return true;
  }
  return false;
}
