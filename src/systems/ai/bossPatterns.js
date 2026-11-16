/**
 * Boss attack pattern library (CLAUDE.md §3 Bosses): aimed burst, ring,
 * spiral, spread, charge, jump/slam, summon minions, teleport, telegraphed
 * laser, projectile rain. Each pattern is a registered { telegraphSeconds,
 * durationSeconds, cooldownSeconds, onStart, onTick } entry — bossAI.js
 * (the state machine) telegraphs for `telegraphSeconds`, then runs the
 * pattern for `durationSeconds` (calling onTick every frame, which may end
 * it early by returning `{ done: true }`), then cools down before picking
 * the next one. This is the same independent-registry shape as
 * tearModifiers.js and ai/behaviors.js.
 */
import { CONFIG } from '../../core/config.js';
import { normalize } from '../../core/math.js';
import { spawnTear } from '../projectiles.js';
import { spawnEnemy } from '../enemies.js';
import { applyDamage } from '../health.js';

export const bossPatternRegistry = new Map();

export function registerBossPattern(id, pattern) {
  bossPatternRegistry.set(id, { cooldownSeconds: CONFIG.BOSS_PATTERN_DEFAULT_COOLDOWN_SECONDS, ...pattern });
}

export function getBossPattern(id) {
  return bossPatternRegistry.get(id);
}

function fireAimedTear(world, boss, player) {
  const dir = normalize(player.x - boss.x, player.y - boss.y);
  return spawnTear(world, {
    x: boss.x,
    y: boss.y,
    dir,
    stats: { shotSpeed: boss.shotSpeed ?? 1, damage: boss.damage ?? 2, range: boss.range ?? 8 },
    team: 'enemy',
    ownerDefId: boss.defId,
  });
}

function fireTearAtAngle(world, boss, angle) {
  return spawnTear(world, {
    x: boss.x,
    y: boss.y,
    dir: { x: Math.cos(angle), y: Math.sin(angle) },
    stats: { shotSpeed: boss.shotSpeed ?? 1, damage: boss.damage ?? 2, range: boss.range ?? 8 },
    team: 'enemy',
    ownerDefId: boss.defId,
  });
}

registerBossPattern('aimedBurst', {
  telegraphSeconds: 0.4,
  durationSeconds: CONFIG.BOSS_AIMED_BURST_SHOTS * CONFIG.BOSS_AIMED_BURST_INTERVAL_SECONDS,
  onStart(world, boss) {
    boss._patternTimer = 0;
    boss._patternShotsLeft = CONFIG.BOSS_AIMED_BURST_SHOTS;
  },
  onTick(world, boss, player, dt) {
    boss._patternTimer -= dt;
    if (boss._patternTimer <= 0 && boss._patternShotsLeft > 0) {
      fireAimedTear(world, boss, player);
      boss._patternShotsLeft -= 1;
      boss._patternTimer = CONFIG.BOSS_AIMED_BURST_INTERVAL_SECONDS;
    }
  },
});

registerBossPattern('ring', {
  telegraphSeconds: 0.5,
  durationSeconds: 0.1,
  onStart(world, boss) {
    const count = CONFIG.BOSS_RING_SHOT_COUNT;
    for (let i = 0; i < count; i++) {
      fireTearAtAngle(world, boss, (i / count) * Math.PI * 2);
    }
  },
});

registerBossPattern('spread', {
  telegraphSeconds: 0.4,
  durationSeconds: 0.1,
  onStart(world, boss, player) {
    const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
    const count = CONFIG.BOSS_SPREAD_SHOT_COUNT;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      fireTearAtAngle(world, boss, baseAngle + t * CONFIG.BOSS_SPREAD_ARC_RADIANS);
    }
  },
});

registerBossPattern('spiral', {
  telegraphSeconds: 0.4, // P1.G6: every boss attack telegraphs 0.4s+
  durationSeconds: CONFIG.BOSS_SPIRAL_DURATION_SECONDS,
  onStart(world, boss, player) {
    boss._patternTimer = 0;
    boss._spiralAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
  },
  onTick(world, boss, player, dt) {
    boss._patternTimer -= dt;
    if (boss._patternTimer <= 0) {
      fireTearAtAngle(world, boss, boss._spiralAngle);
      boss._spiralAngle += CONFIG.BOSS_SPIRAL_TURN_RADIANS;
      boss._patternTimer = CONFIG.BOSS_SPIRAL_INTERVAL_SECONDS;
    }
  },
});

registerBossPattern('charge', {
  telegraphSeconds: 0.5,
  durationSeconds: 3, // upper bound; onTick ends it early on a wall hit
  onStart(world, boss, player) {
    const dir = normalize(player.x - boss.x, player.y - boss.y);
    boss.vx = dir.x * (boss.speed || 60) * CONFIG.BOSS_CHARGE_SPEED_MULT;
    boss.vy = dir.y * (boss.speed || 60) * CONFIG.BOSS_CHARGE_SPEED_MULT;
  },
  onTick(world, boss, player, dt) {
    const nextX = boss.x + boss.vx * dt;
    const nextY = boss.y + boss.vy * dt;
    const { tx, ty } = world.tileGrid.worldToTile(nextX, nextY);
    if (world.tileGrid.isSolid(tx, ty)) {
      boss.vx = 0;
      boss.vy = 0;
      return { done: true };
    }
    boss.x = nextX;
    boss.y = nextY;
    return undefined;
  },
});

registerBossPattern('slam', {
  telegraphSeconds: 0.6,
  durationSeconds: 0.1,
  onStart(world, boss, player, ctx) {
    ctx.events?.emit('boss:slam', { x: boss.x, y: boss.y, radius: CONFIG.BOSS_SLAM_RADIUS });
    if (!player || !ctx.playerHealth?.alive) return;
    const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (dist > CONFIG.BOSS_SLAM_RADIUS + player.radius) return;
    applyDamage(ctx.playerHealth, CONFIG.BOSS_SLAM_DAMAGE_HALF_HEARTS, { events: ctx.events, source: `${boss.defId}:slam` });
  },
});

registerBossPattern('summonMinions', {
  telegraphSeconds: 0.5,
  durationSeconds: 0.1,
  onStart(world, boss, player, ctx) {
    for (let i = 0; i < CONFIG.BOSS_SUMMON_COUNT; i++) {
      const angle = ctx.rng ? ctx.rng.range(0, Math.PI * 2) : (i / CONFIG.BOSS_SUMMON_COUNT) * Math.PI * 2;
      const offset = { x: Math.cos(angle) * boss.radius * 2, y: Math.sin(angle) * boss.radius * 2 };
      spawnEnemy(
        world,
        { id: `${boss.defId}:minion`, hp: 3, speed: 70, radius: 10, behavior: 'chase' },
        { x: boss.x + offset.x, y: boss.y + offset.y }
      );
    }
  },
});

registerBossPattern('teleport', {
  telegraphSeconds: 0.4, // P1.G6: every boss attack telegraphs 0.4s+
  durationSeconds: 0.05,
  onStart(world, boss, player, ctx) {
    if (!ctx.rng) return;
    const tx = ctx.rng.int(2, world.tileGrid.width - 3);
    const ty = ctx.rng.int(2, world.tileGrid.height - 3);
    const center = world.tileGrid.tileCenter(tx, ty);
    boss.x = center.x;
    boss.y = center.y;
    ctx.events?.emit('boss:teleport', { x: boss.x, y: boss.y });
  },
});

registerBossPattern('telegraphedLaser', {
  telegraphSeconds: 0.8,
  durationSeconds: 0.15,
  onTelegraphStart(world, boss, player) {
    boss._laserDir = normalize(player.x - boss.x, player.y - boss.y);
  },
  onStart(world, boss, player, ctx) {
    ctx.events?.emit('boss:laser', { x: boss.x, y: boss.y, dir: boss._laserDir });
    if (!player || !ctx.playerHealth?.alive || !boss._laserDir) return;
    const toPlayer = { x: player.x - boss.x, y: player.y - boss.y };
    const along = toPlayer.x * boss._laserDir.x + toPlayer.y * boss._laserDir.y;
    if (along < 0) return; // behind the beam's origin
    const perpDist = Math.abs(toPlayer.x * boss._laserDir.y - toPlayer.y * boss._laserDir.x);
    if (perpDist > CONFIG.BOSS_LASER_WIDTH_PX / 2 + player.radius) return;
    applyDamage(ctx.playerHealth, CONFIG.BOSS_LASER_DAMAGE_HALF_HEARTS, { events: ctx.events, source: `${boss.defId}:laser` });
  },
});

registerBossPattern('projectileRain', {
  telegraphSeconds: 0.4, // P1.G6: every boss attack telegraphs 0.4s+
  durationSeconds: CONFIG.BOSS_RAIN_DURATION_SECONDS,
  onStart(world, boss) {
    boss._patternTimer = 0;
  },
  onTick(world, boss, player, dt, ctx) {
    boss._patternTimer -= dt;
    if (boss._patternTimer <= 0) {
      boss._patternTimer = CONFIG.BOSS_RAIN_INTERVAL_SECONDS;
      const rng = ctx.rng;
      const tx = rng ? rng.int(2, world.tileGrid.width - 3) : 2;
      const ty = rng ? rng.int(2, world.tileGrid.height - 3) : 2;
      const center = world.tileGrid.tileCenter(tx, ty);
      const dir = normalize(player.x - center.x, player.y - center.y);
      spawnTear(world, {
        x: center.x,
        y: center.y,
        dir,
        stats: { shotSpeed: boss.shotSpeed ?? 1, damage: boss.damage ?? 2, range: 2 },
        team: 'enemy',
        ownerDefId: boss.defId,
      });
    }
  },
});
