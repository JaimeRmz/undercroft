#!/usr/bin/env node
/**
 * Headless simulate harness (CLAUDE.md §5 (a)/(b)/(c)): every enemy and boss
 * alone, a kitchen-sink combat scenario, a bot clearing seeded single-room
 * encounters, and a bot playing full seeded floors end-to-end (floorgen ->
 * walk/fight through every room on the path -> boss defeated), mirroring
 * main.js's run-building logic headlessly.
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
import { generateFloor, cellKey, ROOM_TYPE } from '../src/systems/floorgen.js';
import { FloorRuntime } from '../src/systems/floor.js';
import { createTransitionState, startTransition, updateTransition, detectDoorExit, entryPositionForSide, oppositeSide } from '../src/systems/transitions.js';
import { buildItemPools, spawnItemPedestal, resolveItemPedestals, chargeActivesOnRoomClear, ItemInventory } from '../src/systems/items.js';
import { Currency, resolvePickups, rollRoomClearReward, spawnRewardPickup } from '../src/systems/pickups.js';
import { TrinketInventory, resolveTrinketPickups } from '../src/systems/trinkets.js';

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
  return {
    enemyDefs: registries.of('enemy').all(),
    bossDefs: registries.of('boss').all(),
    itemDefs: registries.of('item').all(),
    trinketDefs: registries.of('trinket').all(),
    roomTemplates: registries.of('room').all(),
  };
}

const SIDES = [
  { side: 'north', dx: 0, dy: -1 },
  { side: 'south', dx: 0, dy: 1 },
  { side: 'east', dx: 1, dy: 0 },
  { side: 'west', dx: -1, dy: 0 },
];

function isSecretType(type) {
  return type === ROOM_TYPE.SECRET || type === ROOM_TYPE.SUPER_SECRET;
}

/**
 * Full-floor DFS plan: a spanning-tree walk (BFS-tree, DFS-ordered) that visits
 * every door-reachable non-secret cell exactly once and backtracks to its parent
 * afterward, using the same adjacency rule FloorRuntime uses to decide which
 * sides actually get doors (doorSidesForCell in floor.js: any non-secret
 * neighbor). Returns `moves` (an ordered list of exit sides to walk through,
 * including backtracks) and `order` (the cell keys visited, for asserting full
 * coverage against every non-secret cell on the floor).
 */
function buildFullFloorTraversal(floor) {
  const startKey = cellKey(floor.startCell.x, floor.startCell.y);
  const adjacency = new Map();
  for (const [key, cell] of floor.cells) {
    if (isSecretType(cell.type)) continue;
    const neighbors = [];
    for (const { side, dx, dy } of SIDES) {
      const nk = cellKey(cell.x + dx, cell.y + dy);
      const neighbor = floor.cells.get(nk);
      if (neighbor && !isSecretType(neighbor.type)) neighbors.push({ side, toKey: nk });
    }
    adjacency.set(key, neighbors);
  }

  const visited = new Set([startKey]);
  const order = [startKey];
  const moves = [];
  (function dfs(key) {
    for (const { side, toKey } of adjacency.get(key) ?? []) {
      if (visited.has(toKey)) continue;
      visited.add(toKey);
      order.push(toKey);
      moves.push(side);
      dfs(toKey);
      moves.push(oppositeSide(side));
    }
  })(startKey);

  return { moves, order, nonSecretCellCount: adjacency.size };
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
    room.update(DT);
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
      cleared = room.update(DT);
      if (!playerHealth.alive) break; // a loss is fine; only a stuck-forever room is a bug
    }

    if (!cleared && playerHealth.alive) {
      throw new Error(`bot seed ${seed}: room did not clear within ${maxFrames} frames (possible softlock)`);
    }
    console.log(`  seed ${seed}: ${cleared ? 'cleared' : 'player died (not a softlock)'}`);
  }
}

/**
 * Tile-grid BFS from the player's current tile to a goal tile, avoiding solid
 * tiles (walls/rocks/pits) — room templates can place obstacles directly on
 * the straight line toward a door, so a bot that only steers by raw dx/dy
 * (fine in the obstacle-free single-room test above) can walk into a rock and
 * sit there forever. Returns an ordered list of waypoint tiles (excluding the
 * start), or null if the goal is genuinely unreachable.
 */
function bfsTilePath(tileGrid, startTx, startTy, goalTx, goalTy) {
  const key = (x, y) => `${x},${y}`;
  const startKey = key(startTx, startTy);
  const goalKey = key(goalTx, goalTy);
  if (startKey === goalKey) return [];

  const visited = new Set([startKey]);
  const parent = new Map();
  const queue = [[startTx, startTy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (key(x, y) === goalKey) break;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      if (tileGrid.isSolid(nx, ny) && nk !== goalKey) continue; // allow the final step onto the goal tile itself
      visited.add(nk);
      parent.set(nk, key(x, y));
      queue.push([nx, ny]);
    }
  }

  if (!parent.has(goalKey)) return null;
  const waypoints = [];
  let cur = goalKey;
  while (cur !== startKey) {
    const [cx, cy] = cur.split(',').map(Number);
    waypoints.push({ tx: cx, ty: cy });
    cur = parent.get(cur);
  }
  waypoints.reverse();
  return waypoints;
}

/**
 * (d) A bot plays a full generated floor per seed: floorgen -> FloorRuntime,
 * walking a DFS spanning-tree plan that visits every door-reachable
 * non-secret room (not just the shortest path to the boss), fighting
 * whatever's in each room along the way, until every room has been visited
 * and the boss is defeated. The player is god-mode (permanently invulnerable,
 * via Health.invulnTimer = Infinity) so a death never masks a genuine
 * softlock — this bot is checking "can every room be reached and cleared",
 * not "can a simple bot survive"; that's what (c)'s single-room check and the
 * real game's difficulty tuning are for. Mirrors main.js's
 * run-building/update-loop logic headlessly.
 */
function testBotPlaysFloors(enemyDefs, bossDefs, itemDefs, trinketDefs, roomTemplates, seedCount = 20) {
  console.log(`\n[simulate] (d) bot plays ${seedCount} seeded floors, visiting every room (floorgen -> full clear -> boss defeated)...`);
  const itemPools = buildItemPools(itemDefs);
  const getItemDef = (id) => itemDefs.find((d) => d.id === id);
  const trinketPools = buildItemPools(trinketDefs);
  const getTrinketDef = (id) => trinketDefs.find((d) => d.id === id);

  for (let seed = 0; seed < seedCount; seed++) {
    const floorRng = new Rng(`floor-${seed}`);
    const templateRng = new Rng(`template-${seed}`);
    const spawnRng = new Rng(`spawn-${seed}`);
    const aiRng = new Rng(`ai-${seed}`);

    const floor = generateFloor(1, floorRng);
    const floorRuntime = new FloorRuntime(floor, roomTemplates, templateRng);
    const bossKey = cellKey(floor.boss.x, floor.boss.y);
    const { moves, order, nonSecretCellCount } = buildFullFloorTraversal(floor);
    const visitedRooms = new Set([cellKey(floor.startCell.x, floor.startCell.y)]);

    const stockedRooms = new Set();
    const stockRoom = (room, cell) => {
      const key = cellKey(cell.x, cell.y);
      if (stockedRooms.has(key)) return;
      stockedRooms.add(key);
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));

      if (cell.type === ROOM_TYPE.BOSS) {
        const def = spawnRng.pick(bossDefs);
        spawnBoss(room.world, def, { x: center.x, y: center.y, stage: 1 });
        return;
      }
      if (cell.type === ROOM_TYPE.TREASURE) {
        const itemId = itemPools.draw('treasure', spawnRng);
        if (itemId) spawnItemPedestal(room.world, itemId, { x: center.x, y: center.y });
        return;
      }
      if (cell.type !== ROOM_TYPE.NORMAL) return;
      const count = spawnRng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const def = spawnRng.pick(enemyDefs);
        const tx = spawnRng.int(2, room.widthTiles - 3);
        const ty = spawnRng.int(2, room.heightTiles - 3);
        const tileCenter = room.world.tileGrid.tileCenter(tx, ty);
        spawnEnemy(room.world, def, { x: tileCenter.x, y: tileCenter.y, rng: spawnRng });
      }
    };

    let room = floorRuntime.getCurrentRoom();
    stockRoom(room, floorRuntime.getCurrentCell());

    const tileSize = room.world.tileGrid.tileSize;
    const centerX = (room.widthTiles * tileSize) / 2;
    const centerY = (room.heightTiles * tileSize) / 2;
    const player = createPlayer(room.world, { x: centerX, y: centerY, stats: new Stats({ damageUps: 3 }) });
    const playerHealth = new Health({ redMax: 6 });
    playerHealth.invulnTimer = Infinity; // god mode: this bot proves reachability/clearability, not survival
    const currency = new Currency();
    const inventory = new ItemInventory();
    const trinketInventory = new TrinketInventory();
    const transition = createTransitionState();
    const input = createInputState();
    const events = createEventBus();

    let moveIndex = 0;
    let pendingEntrySide = null;
    let bossEverSeen = false;
    let bossDefeated = false;
    let waypoints = null; // tile path to the current room's exit door, recomputed whenever the room/target changes

    // ~30 sim-seconds per room to visit (every room gets walked to AND backtracked from), plus slack for the boss fight.
    const maxFrames = 1800 * (order.length * 2 + 3);
    let frame = 0;
    for (; frame < maxFrames; frame++) {
      input.held.clear();
      input.justPressed.clear();
      input.moveX = 0;
      input.moveY = 0;

      if (transition.active) {
        if (updateTransition(transition, DT)) {
          room = floorRuntime.getCurrentRoom();
          stockRoom(room, floorRuntime.getCurrentCell());
          visitedRooms.add(floorRuntime.currentKey);
          const pos = entryPositionForSide(room, pendingEntrySide);
          player.x = pos.x;
          player.y = pos.y;
          player.vx = 0;
          player.vy = 0;
          waypoints = null;
        }
        continue;
      }

      const enemies = room.world.entities.byType('enemy').filter((e) => e.alive);
      const atBossRoom = floorRuntime.currentKey === bossKey;
      if (atBossRoom) {
        const bossAlive = enemies.some((e) => e.isBoss);
        if (bossAlive) bossEverSeen = true;
        else if (bossEverSeen) bossDefeated = true;
      }

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

        // Room obstacles (rock/pit patterns) can sit directly between the player and the
        // nearest enemy, so a raw dx/dy chase can wedge the bot against a wall forever
        // (it has no line of sight to route around). Path around obstacles the same way
        // the door-travel branch below does, falling back to the direct heading up close.
        const tileGrid = room.world.tileGrid;
        const here = tileGrid.worldToTile(player.x, player.y);
        const goal = tileGrid.worldToTile(nearest.x, nearest.y);
        const combatPath = bfsTilePath(tileGrid, here.tx, here.ty, goal.tx, goal.ty);
        const ALIGN_TOLERANCE_PX = 12;
        if (combatPath && combatPath.length > 0) {
          const target = tileGrid.tileCenter(combatPath[0].tx, combatPath[0].ty);
          const tdx = target.x - player.x;
          const tdy = target.y - player.y;
          input.moveX = Math.abs(tdx) > ALIGN_TOLERANCE_PX ? Math.sign(tdx) : 0;
          input.moveY = Math.abs(tdy) > ALIGN_TOLERANCE_PX ? Math.sign(tdy) : 0;
        } else {
          input.moveX = Math.abs(dx) > ALIGN_TOLERANCE_PX ? Math.sign(dx) : 0;
          input.moveY = Math.abs(dy) > ALIGN_TOLERANCE_PX ? Math.sign(dy) : 0;
        }
      } else if (moveIndex < moves.length) {
        const tileGrid = room.world.tileGrid;
        const doorPos = room.doorPositionForSide(moves[moveIndex]);

        if (waypoints === null) {
          const here = tileGrid.worldToTile(player.x, player.y);
          waypoints = bfsTilePath(tileGrid, here.tx, here.ty, doorPos.tx, doorPos.ty) ?? [{ tx: doorPos.tx, ty: doorPos.ty }];
        }

        const ARRIVE_PX = tileGrid.tileSize * 0.3;
        while (waypoints.length > 1) {
          const wp = tileGrid.tileCenter(waypoints[0].tx, waypoints[0].ty);
          if (Math.hypot(wp.x - player.x, wp.y - player.y) > ARRIVE_PX) break;
          waypoints.shift();
        }

        const next = waypoints[0] ?? { tx: doorPos.tx, ty: doorPos.ty };
        const target = tileGrid.tileCenter(next.tx, next.ty);
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const ALIGN_TOLERANCE_PX = 6;
        input.moveX = Math.abs(dx) > ALIGN_TOLERANCE_PX ? Math.sign(dx) : 0;
        input.moveY = Math.abs(dy) > ALIGN_TOLERANCE_PX ? Math.sign(dy) : 0;
      }

      updatePlayer(room.world, player, input, DT, { events });
      updateEnemies(room.world, player, DT, { events, rng: aiRng });
      updateProjectiles(room.world, DT, events);
      resolveCombat(room.world, { player, playerHealth, events, rng: spawnRng });
      resolveItemPedestals(room.world, player, { inventory, stats: player.stats, playerHealth, events, pools: itemPools, getItemDef });
      resolvePickups(room.world, player, { currency, playerHealth, events, rng: spawnRng, trinketPools });
      resolveTrinketPickups(room.world, player, { inventory: trinketInventory, stats: player.stats, events, pools: trinketPools, getTrinketDef });
      tickInvuln(playerHealth, DT);
      room.world.reap();

      const justCleared = room.update(DT);
      if (justCleared) {
        chargeActivesOnRoomClear(inventory);
        if (floorRuntime.getCurrentCell().type !== ROOM_TYPE.BOSS) {
          const reward = rollRoomClearReward(spawnRng, player.stats.luck);
          if (reward) spawnRewardPickup(room.world, reward, { x: centerX, y: centerY, rng: spawnRng, trinketPools });
        }
      }

      if (moveIndex < moves.length) {
        const exitSide = detectDoorExit(room, player);
        if (exitSide && exitSide === moves[moveIndex]) {
          const result = floorRuntime.move(exitSide);
          if (result) {
            pendingEntrySide = result.enteredFrom;
            startTransition(transition, exitSide);
            moveIndex++;
          }
        }
      }

      if (moveIndex >= moves.length && bossDefeated) break;
    }

    const fullyTraversed = visitedRooms.size >= nonSecretCellCount;
    if (!fullyTraversed || !bossDefeated) {
      const stuckRoom = floorRuntime.getCurrentRoom();
      throw new Error(
        `floor seed ${seed}: softlock — visited ${visitedRooms.size}/${nonSecretCellCount} non-secret rooms, ` +
          `boss ${bossDefeated ? 'defeated' : 'NOT defeated'}, stuck at room ${floorRuntime.currentKey} ` +
          `(template=${stuckRoom.templateId ?? 'unknown'}, move ${moveIndex}/${moves.length}) within ${maxFrames} frames`
      );
    }
    console.log(`  seed ${seed}: every room visited (${visitedRooms.size}/${nonSecretCellCount}), boss defeated (${frame} frames)`);
  }
}

async function main() {
  console.log('=== Undercroft headless simulate harness ===');
  const { enemyDefs, bossDefs, itemDefs, trinketDefs, roomTemplates } = await loadContentDefs();
  if (enemyDefs.length === 0) throw new Error('no enemy definitions loaded from mods/core — check the mod loader');
  if (bossDefs.length === 0) throw new Error('no boss definitions loaded from mods/core — check the mod loader');

  testEachEnemyAlone(enemyDefs);
  testEachBossAlone(bossDefs);
  testKitchenSink(enemyDefs);
  testBotClearsRooms(enemyDefs);
  testBotPlaysFloors(enemyDefs, bossDefs, itemDefs, trinketDefs, roomTemplates);

  console.log('\n=== simulate: ALL CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('\n[simulate] FAILED:', err);
  process.exitCode = 1;
});
