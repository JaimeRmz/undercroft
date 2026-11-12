/**
 * Composable AI behaviors (CLAUDE.md §3): each archetype registers under an id
 * with an onUpdate (movement/attack, every tick) and/or onDeath (fires once
 * when hp drops to 0, before the entity is destroyed) hook — the same
 * independent-hook shape as tearModifiers.js. An enemy def's `behaviors`
 * array can combine several (e.g. ['chase', 'exploder'] chases the player
 * and detonates on death), so movement and death-reaction archetypes mix
 * freely without special-casing in enemies.js/combat.js.
 */
import { CONFIG } from '../../core/config.js';
import { normalize, clamp } from '../../core/math.js';
import { spawnTear } from '../projectiles.js';
import { spawnEnemy } from '../enemies.js';
import { applyDamage } from '../health.js';

export const aiBehaviorRegistry = new Map();

export function registerAIBehavior(id, hooks) {
  aiBehaviorRegistry.set(id, hooks);
}

/** Runs once right after an enemy is spawned, for behaviors that need to set up initial state (e.g. a random bounce direction). */
export function runAIOnSpawn(enemy, ctx) {
  for (const id of enemy.behaviors ?? []) {
    aiBehaviorRegistry.get(id)?.onSpawn?.(enemy, ctx);
  }
}

export function runAIOnUpdate(world, enemy, player, dt, ctx) {
  for (const id of enemy.behaviors ?? []) {
    aiBehaviorRegistry.get(id)?.onUpdate?.(world, enemy, player, dt, ctx);
  }
}

/** Runs every behavior's onDeath hook (explode/split), once, before the entity is destroyed. */
export function runAIOnDeath(world, enemy, ctx) {
  for (const id of enemy.behaviors ?? []) {
    aiBehaviorRegistry.get(id)?.onDeath?.(world, enemy, ctx);
  }
}

export function moveAndIntegrate(world, enemy, dt) {
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

function aimedShot(world, enemy, player, events) {
  const dir = normalize(player.x - enemy.x, player.y - enemy.y);
  spawnTear(world, {
    x: enemy.x,
    y: enemy.y,
    dir,
    stats: { shotSpeed: enemy.shotSpeed, damage: enemy.damage, range: enemy.range },
    team: 'enemy',
    ownerDefId: enemy.defId,
  });
  events?.emit('enemy:shoot', { enemy, dir });
}

// --- Ground / flight movement archetypes ---------------------------------

registerAIBehavior('wander', {
  onUpdate(world, enemy, player, dt, { rng }) {
    enemy.aiTimer -= dt;
    if (enemy.aiTimer <= 0) {
      const angle = rng.range(0, Math.PI * 2);
      enemy.aiDir = { x: Math.cos(angle), y: Math.sin(angle) };
      enemy.aiTimer = rng.range(CONFIG.WANDER_MIN_SECONDS, CONFIG.WANDER_MAX_SECONDS);
    }
    enemy.vx = enemy.aiDir.x * enemy.speed;
    enemy.vy = enemy.aiDir.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('chase', {
  onUpdate(world, enemy, player, dt) {
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.vx = dir.x * enemy.speed;
    enemy.vy = dir.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('erraticFlier', {
  onUpdate(world, enemy, player, dt, { rng }) {
    enemy.aiTimer -= dt;
    if (enemy.aiTimer <= 0) {
      const angle = rng.range(0, Math.PI * 2);
      enemy.aiDir = { x: Math.cos(angle), y: Math.sin(angle) };
      enemy.aiTimer = rng.range(0.5, 1.2);
    }
    enemy.vx = enemy.aiDir.x * enemy.speed;
    enemy.vy = enemy.aiDir.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('hopLeap', {
  onSpawn(enemy) {
    enemy.hopPhase = 'idle';
    enemy.aiTimer = CONFIG.HOP_IDLE_SECONDS;
  },
  onUpdate(world, enemy, player, dt) {
    enemy.aiTimer -= dt;
    if (enemy.hopPhase === 'idle') {
      enemy.vx = 0;
      enemy.vy = 0;
      if (enemy.aiTimer <= 0) {
        enemy.hopPhase = 'leaping';
        enemy.aiTimer = CONFIG.HOP_LEAP_SECONDS;
        const dir = normalize(player.x - enemy.x, player.y - enemy.y);
        enemy.vx = dir.x * enemy.speed * CONFIG.HOP_LEAP_SPEED_MULT;
        enemy.vy = dir.y * enemy.speed * CONFIG.HOP_LEAP_SPEED_MULT;
      }
    } else if (enemy.aiTimer <= 0) {
      enemy.hopPhase = 'idle';
      enemy.aiTimer = CONFIG.HOP_IDLE_SECONDS;
      enemy.vx = 0;
      enemy.vy = 0;
    }
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('dashCharger', {
  onSpawn(enemy) {
    enemy.dashCooldown = 0;
    enemy.dashing = false;
  },
  onUpdate(world, enemy, player, dt) {
    enemy.dashCooldown = Math.max(0, enemy.dashCooldown - dt);
    const alignedX = Math.abs(enemy.x - player.x) <= CONFIG.DASH_ALIGN_TOLERANCE_PX;
    const alignedY = Math.abs(enemy.y - player.y) <= CONFIG.DASH_ALIGN_TOLERANCE_PX;

    if (!enemy.dashing && enemy.dashCooldown <= 0 && (alignedX || alignedY)) {
      enemy.dashing = true;
      enemy.dashCooldown = CONFIG.DASH_MIN_INTERVAL_SECONDS;
      const dir = alignedX ? { x: 0, y: Math.sign(player.y - enemy.y) || 1 } : { x: Math.sign(player.x - enemy.x) || 1, y: 0 };
      enemy.vx = dir.x * enemy.speed * CONFIG.DASH_SPEED_MULT;
      enemy.vy = dir.y * enemy.speed * CONFIG.DASH_SPEED_MULT;
    }

    if (enemy.dashing) {
      const { tx, ty } = world.tileGrid.worldToTile(enemy.x + enemy.vx * dt, enemy.y + enemy.vy * dt);
      if (world.tileGrid.isSolid(tx, ty)) {
        enemy.dashing = false;
        enemy.vx = 0;
        enemy.vy = 0;
      }
    } else {
      const dir = normalize(player.x - enemy.x, player.y - enemy.y);
      enemy.vx = dir.x * enemy.speed * 0.3; // [assumed] slow reposition while not dashing
      enemy.vy = dir.y * enemy.speed * 0.3;
    }
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('turretShooter', {
  onUpdate(world, enemy, player, dt, { events }) {
    enemy.vx = 0;
    enemy.vy = 0;
    moveAndIntegrate(world, enemy, dt); // zero velocity, but still self-corrects if ever spawned overlapping a wall tile
    enemy.fireCooldown -= dt;
    if (enemy.fireCooldown <= 0) {
      aimedShot(world, enemy, player, events);
      enemy.fireCooldown = enemy.fireCooldownSeconds;
    }
  },
});

registerAIBehavior('fleeingSpawner', {
  onSpawn(enemy) {
    enemy.spawnTimer = CONFIG.FLEEING_SPAWNER_INTERVAL_SECONDS;
    enemy.minionsSpawned = 0;
  },
  onUpdate(world, enemy, player, dt, { events, rng }) {
    const away = normalize(enemy.x - player.x, enemy.y - player.y);
    enemy.vx = away.x * enemy.speed;
    enemy.vy = away.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);

    if (enemy.minionsSpawned >= CONFIG.FLEEING_SPAWNER_MAX_MINIONS) return; // bounded, so a fleeing spawner can't fill the room forever
    enemy.spawnTimer -= dt;
    if (enemy.spawnTimer <= 0) {
      enemy.spawnTimer = CONFIG.FLEEING_SPAWNER_INTERVAL_SECONDS;
      enemy.minionsSpawned += 1;
      const angle = rng ? rng.range(0, Math.PI * 2) : 0;
      const offset = { x: Math.cos(angle) * enemy.radius * 2, y: Math.sin(angle) * enemy.radius * 2 };
      const minion = spawnEnemy(
        world,
        { id: `${enemy.defId}:spawn`, hp: CONFIG.FLEEING_SPAWNER_MINION_HP, speed: enemy.speed * 1.2, radius: 8, behaviors: ['chase'] },
        { x: enemy.x + offset.x, y: enemy.y + offset.y }
      );
      events?.emit('enemy:spawned', { parent: enemy, minion });
    }
  },
});

registerAIBehavior('hideAndPopShooter', {
  onSpawn(enemy) {
    enemy.popPhase = 'hidden';
    enemy.aiTimer = CONFIG.HIDE_SECONDS;
    enemy.invulnerable = true;
  },
  onUpdate(world, enemy, player, dt, { events }) {
    enemy.vx = 0;
    enemy.vy = 0;
    moveAndIntegrate(world, enemy, dt); // zero velocity, but still self-corrects if ever spawned overlapping a wall tile
    enemy.aiTimer -= dt;
    if (enemy.aiTimer <= 0) {
      if (enemy.popPhase === 'hidden') {
        enemy.popPhase = 'popped';
        enemy.aiTimer = CONFIG.POP_SECONDS;
        enemy.invulnerable = false;
      } else {
        enemy.popPhase = 'hidden';
        enemy.aiTimer = CONFIG.HIDE_SECONDS;
        enemy.invulnerable = true;
      }
    }
    if (enemy.popPhase === 'popped') {
      enemy.fireCooldown -= dt;
      if (enemy.fireCooldown <= 0) {
        aimedShot(world, enemy, player, events);
        enemy.fireCooldown = enemy.fireCooldownSeconds;
      }
    }
  },
});

registerAIBehavior('burrower', {
  onSpawn(enemy) {
    enemy.burrowPhase = 'burrowed';
    enemy.aiTimer = CONFIG.BURROW_SECONDS;
    enemy.invulnerable = true;
  },
  onUpdate(world, enemy, player, dt) {
    enemy.aiTimer -= dt;
    if (enemy.aiTimer <= 0) {
      if (enemy.burrowPhase === 'burrowed') {
        enemy.burrowPhase = 'surfaced';
        enemy.aiTimer = CONFIG.SURFACE_SECONDS;
        enemy.invulnerable = false;
      } else {
        enemy.burrowPhase = 'burrowed';
        enemy.aiTimer = CONFIG.BURROW_SECONDS;
        enemy.invulnerable = true;
      }
    }

    if (enemy.burrowPhase === 'burrowed') {
      const dir = normalize(player.x - enemy.x, player.y - enemy.y);
      enemy.vx = dir.x * enemy.speed * 1.5; // [assumed] fast while safely underground
      enemy.vy = dir.y * enemy.speed * 1.5;
    } else {
      enemy.vx = 0;
      enemy.vy = 0;
    }
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('frontArmoredKnight', {
  onSpawn(enemy) {
    enemy.frontArmored = true;
    enemy.facing = { x: 0, y: 1 };
  },
  onUpdate(world, enemy, player, dt) {
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.facing = dir;
    enemy.vx = dir.x * enemy.speed;
    enemy.vy = dir.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('fourDirectionBouncer', {
  onSpawn(enemy, { rng }) {
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    enemy.aiDir = rng ? rng.pick(dirs) : dirs[0];
  },
  onUpdate(world, enemy, player, dt) {
    const speed = CONFIG.BOUNCER_SPEED;
    const nextX = enemy.x + enemy.aiDir.x * speed * dt;
    const nextY = enemy.y + enemy.aiDir.y * speed * dt;
    const tileX = world.tileGrid.worldToTile(nextX, enemy.y);
    const tileY = world.tileGrid.worldToTile(enemy.x, nextY);
    if (world.tileGrid.isSolid(tileX.tx, tileX.ty)) enemy.aiDir.x *= -1;
    if (world.tileGrid.isSolid(tileY.tx, tileY.ty)) enemy.aiDir.y *= -1;
    enemy.vx = enemy.aiDir.x * speed;
    enemy.vy = enemy.aiDir.y * speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('wallPhasingGhost', {
  onSpawn(enemy) {
    enemy.flies = true; // phases through walls/rocks/pits exactly like a flier, regardless of the def
  },
  onUpdate(world, enemy, player, dt) {
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.vx = dir.x * enemy.speed;
    enemy.vy = dir.y * enemy.speed;
    moveAndIntegrate(world, enemy, dt);
  },
});

registerAIBehavior('orbiter', {
  // Orbits a fixed anchor (its own spawn point), not the player: orbiting the player directly would
  // re-center the circle every frame as the player moves, letting it evade a chasing player forever.
  // A fixed patrol circle is still a real threat (it sweeps through every point within ORBITER_RADIUS
  // of its anchor) and the player can actually corner/hit it by approaching the anchor.
  onSpawn(enemy) {
    enemy.orbitAnchor = { x: enemy.x, y: enemy.y };
    enemy.orbitAngle = 0;
  },
  onUpdate(world, enemy, player, dt) {
    enemy.orbitAngle += CONFIG.ORBITER_ANGULAR_SPEED * dt;
    const newX = enemy.orbitAnchor.x + Math.cos(enemy.orbitAngle) * CONFIG.ORBITER_RADIUS;
    const newY = enemy.orbitAnchor.y + Math.sin(enemy.orbitAngle) * CONFIG.ORBITER_RADIUS;
    enemy.vx = newX - enemy.x;
    enemy.vy = newY - enemy.y;
    enemy.x = newX;
    enemy.y = newY;
  },
});

registerAIBehavior('mirrorOfPlayer', {
  onUpdate(world, enemy, player, dt) {
    const homeDir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.vx = (player.vx ?? 0) + homeDir.x * enemy.speed * CONFIG.MIRROR_HOMING_FRACTION;
    enemy.vy = (player.vy ?? 0) + homeDir.y * enemy.speed * CONFIG.MIRROR_HOMING_FRACTION;
    moveAndIntegrate(world, enemy, dt);
  },
});

// --- Death-reaction archetypes (composable with any movement archetype) --

registerAIBehavior('exploder', {
  onDeath(world, enemy, { player, playerHealth, events }) {
    events?.emit('enemy:explode', { x: enemy.x, y: enemy.y, radius: CONFIG.EXPLODER_RADIUS });
    if (!player || !playerHealth?.alive) return;
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (dist > CONFIG.EXPLODER_RADIUS + player.radius) return;
    applyDamage(playerHealth, CONFIG.EXPLODER_DAMAGE_HALF_HEARTS, { events, source: `${enemy.defId}:explode` });
  },
});

registerAIBehavior('splitter', {
  onDeath(world, enemy, { rng }) {
    const childBehaviors = (enemy.behaviors ?? []).filter((id) => id !== 'splitter');
    if (childBehaviors.length === 0) childBehaviors.push('wander');
    for (let i = 0; i < CONFIG.SPLITTER_CHILD_COUNT; i++) {
      const angle = rng ? rng.range(0, Math.PI * 2) : (i / CONFIG.SPLITTER_CHILD_COUNT) * Math.PI * 2;
      const offset = { x: Math.cos(angle) * enemy.radius, y: Math.sin(angle) * enemy.radius };
      spawnEnemy(
        world,
        {
          id: `${enemy.defId}:split`,
          hp: Math.max(1, Math.round(enemy.maxHp * CONFIG.SPLITTER_HP_FRACTION)),
          speed: enemy.speed,
          radius: Math.max(4, enemy.radius * CONFIG.SPLITTER_RADIUS_FRACTION),
          flies: enemy.flies,
          behaviors: childBehaviors,
          contactDamageHalfHearts: enemy.contactDamageHalfHearts,
        },
        { x: enemy.x + offset.x, y: enemy.y + offset.y }
      );
    }
  },
});
