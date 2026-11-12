#!/usr/bin/env node
/**
 * Headless simulate harness (CLAUDE.md §5 (a)/(b)/(c)): every enemy and boss
 * alone, a kitchen-sink combat scenario, and a simple bot clearing seeded
 * single-room encounters. Still a single-room subset of the full gate —
 * "every item at once" and "20 seeded full floor runs" land once items are
 * woven into spawnable loadouts and multi-floor runs are easy to script here
 * — see KNOWN_ISSUES.md.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../src/systems/room.js';
import { createPlayer, updatePlayer } from '../src/systems/player.js';
import { spawnEnemy, updateEnemies } from '../src/systems/enemies.js';
import { spawnBoss } from '../src/systems/bosses.js';
import { updateProjectiles } from '../src/systems/projectiles.js';
import { resolveCombat } from '../src/systems/combat.js';
import { Health, tickInvuln } from '../src/systems/health.js';
import { Stats } from '../src/systems/stats.js';
import { createInputState } from '../src/engine/input.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';
import { ModLoader } from '../src/modding/modloader.js';
import { createFsSource } from '../src/modding/source-fs.js';
import { ContentRegistries } from '../src/core/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODS_DIR = path.join(__dirname, '..', 'mods');
const DT = 1 / 60;
const SILENT_LOG = { info() {}, warn() {}, error() {}, debug() {} };

function isFinitePos(entity) {
  return Number.isFinite(entity.x) && Number.isFinite(entity.y);
}

async function loadContentDefs() {
  const registries = new ContentRegistries();
  const loader = new ModLoader({ source: createFsSource(MODS_DIR), registries, events: createEventBus(), log: SILENT_LOG });
  const { errors } = await loader.loadAll();
  if (errors.length > 0) {
    console.error('[simulate] mod load errors:', errors);
    throw new Error(`mod loader reported ${errors.length} error(s) loading mods/`);
  }
  return { enemyDefs: registries.of('enemy').all(), bossDefs: registries.of('boss').all() };
}

function dummyPlayerEntity() {
  return { x: 400, y: 400, radius: 12, vx: 0, vy: 0, alive: true };
}

/** (a) Each enemy, spawned alone with a dummy player, for 1200 frames: no exceptions, no NaN positions. */
function testEachEnemyAlone(enemyDefs) {
  console.log(`\n[simulate] (a) spawning each of ${enemyDefs.length} enemies alone for 1200 frames...`);
  for (const def of enemyDefs) {
    const room = new Room();
    const center = room.world.tileGrid.tileCenter(6, 3);
    const player = dummyPlayerEntity();
    spawnEnemy(room.world, def, { x: center.x + 80, y: center.y });
    const rng = new Rng(`enemy-${def.id}`);
    const events = createEventBus();
    for (let frame = 0; frame < 1200; frame++) {
      updateEnemies(room.world, player, DT, { events, rng });
      updateProjectiles(room.world, DT, events);
      room.world.reap();
      for (const e of room.world.entities.all()) {
        if (!isFinitePos(e)) {
          throw new Error(`${def.id}: entity ${e.type}#${e.id} has a non-finite position at frame ${frame} (${e.x}, ${e.y})`);
        }
      }
    }
    console.log(`  OK: ${def.id}`);
  }
}

/**
 * (a2) Each boss, spawned alone with a dummy player for 1200 frames while taking steady damage:
 * no exceptions, no NaN positions, and it must cycle through every one of its phases.
 */
function testEachBossAlone(bossDefs) {
  console.log(`\n[simulate] (a2) spawning each of ${bossDefs.length} bosses alone for 1200 frames, dealing steady damage...`);
  for (const def of bossDefs) {
    const room = new Room();
    const center = room.world.tileGrid.tileCenter(6, 3);
    const player = { x: center.x + 150, y: center.y, radius: 12, vx: 0, vy: 0, alive: true };
    const boss = spawnBoss(room.world, def, { x: center.x, y: center.y });
    const rng = new Rng(`boss-${def.id}`);
    const events = createEventBus();
    const phasesSeen = new Set([0]);
    events.on('boss:phase', ({ phaseIndex }) => phasesSeen.add(phaseIndex));
    const hpDrainPerFrame = boss.maxHp / 1100; // reach ~0 just before the frame budget runs out

    for (let frame = 0; frame < 1200; frame++) {
      updateEnemies(room.world, player, DT, { events, rng });
      updateProjectiles(room.world, DT, events);
      room.world.reap();
      if (boss.alive) boss.hp = Math.max(1, boss.hp - hpDrainPerFrame);
      for (const e of room.world.entities.all()) {
        if (!isFinitePos(e)) {
          throw new Error(`${def.id}: entity ${e.type}#${e.id} has a non-finite position at frame ${frame} (${e.x}, ${e.y})`);
        }
      }
    }
    if (phasesSeen.size !== def.phases.length) {
      throw new Error(`${def.id}: expected to see all ${def.phases.length} phases, only saw [${[...phasesSeen].join(', ')}]`);
    }
    console.log(`  OK: ${def.id} (${def.phases.length} phase(s))`);
  }
}

/** (b) Player + every enemy at once for 3000 frames of combat: no exceptions, frame time under budget. */
function testKitchenSink(enemyDefs) {
  console.log(`\n[simulate] (b) kitchen sink: player + all ${enemyDefs.length} enemies for 3000 frames...`);
  const room = new Room();
  const centerX = (room.widthTiles * room.world.tileGrid.tileSize) / 2;
  const centerY = (room.heightTiles * room.world.tileGrid.tileSize) / 2;
  const player = createPlayer(room.world, { x: centerX, y: centerY, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  enemyDefs.forEach((def, i) => {
    spawnEnemy(room.world, def, { x: centerX + 100 + i * 40, y: centerY - 60 + i * 30 });
  });
  const input = createInputState();
  input.moveX = 1;
  input.held.add('shootRight');
  const events = createEventBus();
  const rng = new Rng('kitchen-sink');

  const start = performance.now();
  for (let frame = 0; frame < 3000; frame++) {
    updatePlayer(room.world, player, input, DT, { events });
    updateEnemies(room.world, player, DT, { events, rng });
    updateProjectiles(room.world, DT, events);
    resolveCombat(room.world, { player, playerHealth, events });
    tickInvuln(playerHealth, DT);
    room.world.reap();
    room.update();
    for (const e of room.world.entities.all()) {
      if (!isFinitePos(e)) throw new Error(`kitchen sink: entity ${e.type}#${e.id} has a non-finite position at frame ${frame}`);
    }
  }
  const elapsedMs = performance.now() - start;
  const perFrameMs = elapsedMs / 3000;
  console.log(`  OK: 3000 frames in ${elapsedMs.toFixed(1)}ms (${perFrameMs.toFixed(3)}ms/frame avg)`);
  const budgetMs = 1000 / 60;
  if (perFrameMs > budgetMs) {
    throw new Error(`kitchen sink: average frame time ${perFrameMs.toFixed(3)}ms exceeds the ${budgetMs.toFixed(3)}ms/frame budget`);
  }
}

/** (c) A simple bot (nearest-enemy chase + shoot) clears seeded single-room encounters without softlocking. */
function testBotClearsRooms(enemyDefs, seedCount = 20) {
  console.log(`\n[simulate] (c) bot clears ${seedCount} seeded single-room encounters...`);
  for (let seed = 0; seed < seedCount; seed++) {
    const rng = new Rng(`bot-${seed}`);
    const room = new Room();
    const centerX = (room.widthTiles * room.world.tileGrid.tileSize) / 2;
    const centerY = (room.heightTiles * room.world.tileGrid.tileSize) / 2;
    const player = createPlayer(room.world, { x: centerX, y: centerY, stats: new Stats({ damageUps: 3 }) });
    const playerHealth = new Health({ redMax: 6 });

    const count = 1 + (seed % 3);
    for (let i = 0; i < count; i++) {
      const def = enemyDefs[rng.int(0, enemyDefs.length - 1)];
      // Tile-based placement (same pattern main.js's stockRoom uses) rather than a raw polar offset from
      // center: a 13x7 room's interior is wider than it is tall, so a polar distance big enough to spread
      // enemies out horizontally could land a stationary one inside/behind the border wall vertically —
      // permanently unreachable, since turretShooter/hideAndPopShooter don't move to self-correct out of it.
      const tx = rng.int(2, room.widthTiles - 3);
      const ty = rng.int(2, room.heightTiles - 3);
      const center = room.world.tileGrid.tileCenter(tx, ty);
      spawnEnemy(room.world, def, { x: center.x, y: center.y });
    }

    const input = createInputState();
    const events = createEventBus();
    let cleared = false;
    const maxFrames = 1800; // 30 seconds

    for (let frame = 0; frame < maxFrames && !cleared; frame++) {
      const enemies = room.world.entities.byType('enemy').filter((e) => e.alive);
      input.held.clear();
      input.justPressed.clear();
      input.moveX = 0;
      input.moveY = 0;

      if (enemies.length > 0) {
        let nearest = enemies[0];
        let bestDist = Infinity;
        for (const e of enemies) {
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = e;
          }
        }
        const dx = nearest.x - player.x;
        const dy = nearest.y - player.y;
        if (Math.abs(dx) > Math.abs(dy)) input.held.add(dx > 0 ? 'shootRight' : 'shootLeft');
        else input.held.add(dy > 0 ? 'shootDown' : 'shootUp');
        // Close each axis independently (not just overall distance) so the bot keeps adjusting
        // position to stay cardinal-aligned with a fleeing/erratic target, instead of freezing
        // the moment it's "close enough" by Euclidean distance while still off-axis for its shot.
        const ALIGN_TOLERANCE_PX = 12;
        input.moveX = Math.abs(dx) > ALIGN_TOLERANCE_PX ? Math.sign(dx) : 0;
        input.moveY = Math.abs(dy) > ALIGN_TOLERANCE_PX ? Math.sign(dy) : 0;
      }

      updatePlayer(room.world, player, input, DT, { events });
      updateEnemies(room.world, player, DT, { events, rng });
      updateProjectiles(room.world, DT, events);
      resolveCombat(room.world, { player, playerHealth, events });
      tickInvuln(playerHealth, DT);
      room.world.reap();
      cleared = room.update();
      if (!playerHealth.alive) break; // a loss is fine; only a stuck-forever room is a bug
    }

    if (!cleared && playerHealth.alive) {
      throw new Error(`bot seed ${seed}: room did not clear within ${maxFrames} frames (possible softlock)`);
    }
    console.log(`  seed ${seed}: ${cleared ? 'cleared' : 'player died (not a softlock)'}`);
  }
}

async function main() {
  console.log('=== Undercroft headless simulate harness ===');
  const { enemyDefs, bossDefs } = await loadContentDefs();
  if (enemyDefs.length === 0) throw new Error('no enemy definitions loaded from mods/core — check the mod loader');
  if (bossDefs.length === 0) throw new Error('no boss definitions loaded from mods/core — check the mod loader');

  testEachEnemyAlone(enemyDefs);
  testEachBossAlone(bossDefs);
  testKitchenSink(enemyDefs);
  testBotClearsRooms(enemyDefs);

  console.log('\n=== simulate: ALL CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('\n[simulate] FAILED:', err);
  process.exitCode = 1;
});
