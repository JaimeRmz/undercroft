/**
 * Enemy AI: three basic archetypes for the P0 vertical slice (chaser, erratic
 * flier, turret shooter). The full composable behavior library is P1.7 — this
 * is a direct `behavior` string dispatch, data-driven from mods/core/enemies/*.json.
 */
import { CONFIG } from '../core/config.js';
import { normalize, clamp } from '../core/math.js';
import { spawnTear } from './projectiles.js';

export function spawnEnemy(world, def, { x, y }) {
  return world.spawn('enemy', {
    x,
    y,
    radius: def.radius ?? 14,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed ?? 0,
    behavior: def.behavior,
    flies: def.flies ?? false,
    contactDamageHalfHearts: def.contactDamageHalfHearts ?? CONFIG.CONTACT_DAMAGE_HALF_HEARTS,
    fireCooldown: 0,
    fireCooldownSeconds: def.fireCooldownSeconds ?? 1,
    shotSpeed: def.shotSpeed ?? 1,
    damage: def.damage ?? 1,
    range: def.range ?? 5,
    aiTimer: 0,
    aiDir: { x: 0, y: 0 },
    defId: def.id,
    tags: ['enemy'],
  });
}

function moveAndIntegrate(world, enemy, dt) {
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  if (!enemy.flies) {
    world.resolveTileCollision(enemy);
  } else {
    const maxX = world.tileGrid.width * world.tileGrid.tileSize;
    const maxY = world.tileGrid.height * world.tileGrid.tileSize;
    enemy.x = clamp(enemy.x, enemy.radius, maxX - enemy.radius);
    enemy.y = clamp(enemy.y, enemy.radius, maxY - enemy.radius);
  }
}

function updateChaser(world, enemy, player, dt) {
  const dir = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.vx = dir.x * enemy.speed;
  enemy.vy = dir.y * enemy.speed;
  moveAndIntegrate(world, enemy, dt);
}

function updateErraticFlier(world, enemy, player, dt, rng) {
  enemy.aiTimer -= dt;
  if (enemy.aiTimer <= 0) {
    const angle = rng.range(0, Math.PI * 2);
    enemy.aiDir = { x: Math.cos(angle), y: Math.sin(angle) };
    enemy.aiTimer = rng.range(0.5, 1.2);
  }
  enemy.vx = enemy.aiDir.x * enemy.speed;
  enemy.vy = enemy.aiDir.y * enemy.speed;
  moveAndIntegrate(world, enemy, dt);
}

function updateTurret(world, enemy, player, dt, events) {
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.fireCooldown -= dt;
  if (enemy.fireCooldown <= 0) {
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    spawnTear(world, {
      x: enemy.x,
      y: enemy.y,
      dir,
      stats: { shotSpeed: enemy.shotSpeed, damage: enemy.damage, range: enemy.range },
      team: 'enemy',
    });
    enemy.fireCooldown = enemy.fireCooldownSeconds;
    events?.emit('enemy:shoot', { enemy, dir });
  }
}

export function updateEnemies(world, player, dt, { events, rng } = {}) {
  for (const enemy of world.entities.byType('enemy')) {
    if (!enemy.alive) continue;
    switch (enemy.behavior) {
      case 'chaser':
        updateChaser(world, enemy, player, dt);
        break;
      case 'erratic_flier':
        updateErraticFlier(world, enemy, player, dt, rng);
        break;
      case 'turret':
        updateTurret(world, enemy, player, dt, events);
        break;
      default:
        break;
    }
  }
}
