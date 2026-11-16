/** Browser entry point: menu -> run (floor/room loop, pause) -> death screen -> restart. */
import { FixedStepLoop } from './core/loop.js';
import { CONFIG } from './core/config.js';
import { FloorRuntime } from './systems/floor.js';
import { TILE } from './systems/room.js';
import { generateFloor, ROOM_TYPE } from './systems/floorgen.js';
import {
  applyCurseDoorDamage,
  spawnSacrificeSpike,
  resolveSacrificeSpikes,
  isAtFullRedHealth,
  setChallengeWaves,
  updateChallengeRoom,
  spawnSlotMachine,
  spawnFortuneMachine,
  resolveArcadeMachines,
} from './systems/specialRooms.js';
import { dealRoomChance, rollDealRoomType, spawnDevilItem, resolveDevilDealPurchases } from './systems/deals.js';
import {
  createTransitionState,
  startTransition,
  updateTransition,
  detectDoorExit,
  entryPositionForSide,
  resolveKeyLockedDoors,
} from './systems/transitions.js';
import { createFloorTransitionState, startFloorTransition, updateFloorTransition, floorTransitionAlpha } from './systems/floorTransition.js';
import { createPlayer, updatePlayer } from './systems/player.js';
import { placePlayerInRoom, placeFamiliarsInRoom } from './systems/roomEntry.js';
import { describeDeathCause } from './systems/deathCause.js';
import { spawnEnemy, updateEnemies } from './systems/enemies.js';
import { findGroundSpawnTile } from './systems/spawnPlacement.js';
import { updateProjectiles } from './systems/projectiles.js';
import { resolveCombat } from './systems/combat.js';
import { Health, tickInvuln } from './systems/health.js';
import { Stats } from './systems/stats.js';
import { placeBomb, updateBombs } from './systems/bombs.js';
import { Currency, resolvePickups, rollRoomClearReward, spawnRewardPickup, spawnPickup, PICKUP_TYPE, rollCoinValue } from './systems/pickups.js';
import {
  ItemInventory,
  pickUpItem,
  buildItemPools,
  spawnItemPedestal,
  resolveItemPedestals,
  chargeActivesOnRoomClear,
  useActiveItem,
} from './systems/items.js';
import { TrinketInventory, resolveTrinketPickups, dropTrinket, equipTrinket } from './systems/trinkets.js';
import { spawnFamiliar, updateFamiliars } from './systems/familiars.js';
import { ConsumableInventory, resolveConsumablePickups, useConsumableSlot } from './systems/consumables.js';
import { PillIdentity } from './systems/pills.js';
import { updateTempStatBoosts } from './systems/effects.js';
import { checkSynergies } from './systems/synergies.js';
import { checkTransformations } from './systems/transformations.js';
import { stockShop, resolveShopPurchases } from './systems/shop.js';
import { spawnBoss, spawnTrapdoor, resolveTrapdoor } from './systems/bosses.js';
import { drawBossBar } from './ui/bossbar.js';
import { createInputState, createKeyboardAdapter, pollGamepads, clearFrameEdges } from './engine/input.js';
import { events } from './core/events.js';
import { Camera } from './render/camera.js';
import { computeViewport } from './render/viewport.js';
import { VIEW_W, VIEW_H, ROOM_RECT } from './ui/layout.js';
import { consumeHitstopFrame } from './render/hitstop.js';
import { ParticlePool } from './render/particles.js';
import { DecalLayer } from './render/decals.js';
import { renderRoom } from './render/renderer.js';
import { computeMinimapIcons, drawMinimap } from './ui/map.js';
import { createBannerState, showBanner, updateBanner, drawBanner } from './ui/itemBanner.js';
import { computeHudModel } from './ui/hudModel.js';
import { drawHudPanels, drawFloorBanner } from './ui/hudPanels.js';
import { drawMenuScreen, drawPauseScreen, drawDeathScreen } from './ui/screens.js';
import { RngStreams } from './core/rng.js';
import { ModLoader } from './modding/modloader.js';
import { createHttpSource } from './modding/source-http.js';
import { registries } from './core/registry.js';
import { log } from './core/log.js';

const DOOR_DELTA = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

async function boot() {
  const loader = new ModLoader({ source: createHttpSource(''), registries, events, log });
  await loader.loadAll();

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const templates = registries.of('room').all();
  const itemPools = buildItemPools(registries.of('item').all());
  const getItemDef = (id) => registries.of('item').get(id);
  const trinketPools = buildItemPools(registries.of('trinket').all());
  const getTrinketDef = (id) => registries.of('trinket').get(id);
  const cardPools = buildItemPools(registries.of('card').all());
  const getCardDef = (id) => registries.of('card').get(id);
  const pillDefs = registries.of('pill').all();
  const getPillDef = (id) => registries.of('pill').get(id);
  const getFamiliarDef = (id) => registries.of('familiar').get(id);
  const getBossDef = (id) => registries.of('boss').get(id);
  const getBossDefsForChapter = (chapter) => {
    const all = registries.of('boss').all();
    const matching = all.filter((b) => b.chapter === chapter);
    return matching.length > 0 ? matching : all;
  };
  const getEnemyDefsForChapter = (chapter) => {
    const all = registries.of('enemy').all();
    const matching = all.filter((e) => e.chapter === chapter);
    return matching.length > 0 ? matching : all;
  };
  const synergyRules = registries.of('synergy').all();
  const transformationDefs = registries.of('transformation').all();

  /** Stocks a freshly-visited room's cell with whatever it should hold (item/shop/boss/enemies). */
  function stockRoom(run, room, cell) {
    const key = `${cell.x},${cell.y}`;
    if (run.stockedRooms.has(key)) return;
    run.stockedRooms.add(key);
    const chapter = Math.ceil(run.stage / 2);

    if (cell.type === 'treasure') {
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      const itemId = itemPools.draw('treasure', run.spawnRng);
      if (itemId) spawnItemPedestal(room.world, itemId, { x: center.x, y: center.y });
      return;
    }

    if (cell.type === 'shop') {
      const midY = Math.floor(room.heightTiles / 2);
      const positions = [0.33, 0.5, 0.67].map((frac) => room.world.tileGrid.tileCenter(Math.round(room.widthTiles * frac), midY));
      stockShop(room.world, positions, { pools: itemPools, itemDefsById: getItemDef, rng: run.spawnRng, itemSlots: 2 });
      return;
    }

    if (cell.type === 'boss') {
      const bossDefs = getBossDefsForChapter(chapter);
      if (bossDefs.length === 0) return;
      const def = run.spawnRng.pick(bossDefs);
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      spawnBoss(room.world, def, { x: center.x, y: center.y, stage: run.stage });
      return;
    }

    if (cell.type === 'sacrifice') {
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      spawnSacrificeSpike(room.world, { x: center.x, y: center.y });
      return;
    }

    if (cell.type === 'arcade') {
      const midY = Math.floor(room.heightTiles / 2);
      spawnSlotMachine(room.world, room.world.tileGrid.tileCenter(Math.round(room.widthTiles * 0.35), midY));
      spawnFortuneMachine(room.world, room.world.tileGrid.tileCenter(Math.round(room.widthTiles * 0.65), midY));
      return;
    }

    if (cell.type === 'devil' || cell.type === 'angel') {
      const midY = Math.floor(room.heightTiles / 2);
      const positions = [0.4, 0.6].map((frac) => room.world.tileGrid.tileCenter(Math.round(room.widthTiles * frac), midY));
      for (const pos of positions) {
        const itemId = itemPools.draw(cell.type, run.spawnRng);
        if (!itemId) continue;
        if (cell.type === 'devil') spawnDevilItem(room.world, itemId, pos);
        else spawnItemPedestal(room.world, itemId, pos);
      }
      return;
    }

    if (cell.type === 'secret') {
      const enemyDefs = getEnemyDefsForChapter(chapter);
      for (let i = 0; i < run.spawnRng.int(1, 2) && enemyDefs.length > 0; i++) {
        const def = run.spawnRng.pick(enemyDefs);
        const center = findGroundSpawnTile(room, run.spawnRng, { flies: def.flies ?? false });
        spawnEnemy(room.world, def, { x: center.x, y: center.y, rng: run.spawnRng });
      }
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      spawnPickup(room.world, PICKUP_TYPE.COIN, { x: center.x, y: center.y, value: rollCoinValue(run.spawnRng) });
      return;
    }

    if (cell.type === 'supersecret') {
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      spawnPickup(room.world, PICKUP_TYPE.CHEST, { x: center.x, y: center.y });
      return;
    }

    if (cell.type === 'challenge') {
      const enemyDefs = getEnemyDefsForChapter(chapter);
      if (enemyDefs.length === 0) return;
      const waves = [];
      for (let w = 0; w < 3; w++) {
        // [assumed] 3 waves of 2-4 enemies each
        const wave = [];
        for (let i = 0; i < run.spawnRng.int(2, 4); i++) wave.push(run.spawnRng.pick(enemyDefs));
        waves.push(wave);
      }
      setChallengeWaves(room, waves);
      for (const def of waves[0]) {
        const center = findGroundSpawnTile(room, run.spawnRng, { flies: def.flies ?? false });
        spawnEnemy(room.world, def, { x: center.x, y: center.y, rng: run.spawnRng });
      }
      return;
    }

    if (cell.type !== 'normal' && cell.type !== 'curse') return; // curse rooms stock exactly like a normal room; only their door differs
    const enemyDefs = getEnemyDefsForChapter(chapter);
    if (enemyDefs.length === 0) return;
    const count = run.spawnRng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const def = run.spawnRng.pick(enemyDefs);
      const center = findGroundSpawnTile(room, run.spawnRng, { flies: def.flies ?? false });
      spawnEnemy(room.world, def, { x: center.x, y: center.y, rng: run.spawnRng });
    }
  }

  /** Floor display name from the floor registry (mods/core/floors), with a fallback past the authored floors. */
  function floorTitle(stage) {
    const def = registries.of('floor').all().find((f) => f.stage === stage);
    return { name: def?.name ?? `Depth ${stage}`, chapter: def?.chapter ?? Math.ceil(stage / 2) };
  }
  function announceFloor(run) {
    const { name, chapter } = floorTitle(run.stage);
    showBanner(run.floorBanner, name, `Floor ${run.stage} - Chapter ${chapter}`, 3);
  }

  function advanceFloor(run) {
    run.stage += 1;
    run.stats.floorsCleared += 1;
    run.floor = generateFloor(run.stage, run.floorRng, { isPlayerFullHealth: isAtFullRedHealth(run.playerHealth) });
    run.floorRuntime = new FloorRuntime(run.floor, templates, run.templateRng);
    run.stockedRooms.clear();
    run.floorRedDamageTaken = false; // a fresh floor starts "clean" for the devil/angel deal chance formula
    run.bossFightRedDamageTaken = false;
    const previousWorld = run.room.world;
    run.room = run.floorRuntime.getCurrentRoom();
    stockRoom(run, run.room, run.floorRuntime.getCurrentCell());
    placePlayerInRoom(run.player, previousWorld, run.room, { x: run.centerX, y: run.centerY });
    placeFamiliarsInRoom(previousWorld, run.room.world, run.player);
    run.decals.clear();
  }

  /** Makes floorRuntime's current cell the active room: stock it, re-home the player, clear decals. `entrySide` null = room center. */
  function enterCurrentRoom(run, entrySide) {
    const previousWorld = run.room.world;
    run.room = run.floorRuntime.getCurrentRoom();
    const cell = run.floorRuntime.getCurrentCell();
    stockRoom(run, run.room, cell);
    const pos = entrySide ? entryPositionForSide(run.room, entrySide) : { x: run.centerX, y: run.centerY };
    placePlayerInRoom(run.player, previousWorld, run.room, pos);
    placeFamiliarsInRoom(previousWorld, run.room.world, run.player);
    applyCurseDoorDamage(run.playerHealth, { leavingType: run.pendingLeavingType, enteringType: cell.type }, { events });
    run.pendingLeavingType = null;
    run.decals.clear();
    announceFloor(run);
  }

  /** Builds a brand-new run (fresh seeds, floor 1, starting stats) — called on first start and on restart. */
  function createRun() {
    const rngStreams = new RngStreams(`run-${Date.now()}`);
    const run = {
      floorRng: rngStreams.stream('floorgen'),
      templateRng: rngStreams.stream('rooms'),
      aiRng: rngStreams.stream('ai'),
      vfxRng: rngStreams.stream('vfx'),
      spawnRng: rngStreams.stream('spawns'),
      stage: 1,
      stockedRooms: new Set(),
      appliedSynergyIds: new Set(),
      activeTransformationIds: new Set(),
      pendingEntrySide: null,
      pendingLeavingType: null,
      floorRedDamageTaken: false,
      bossFightRedDamageTaken: false,
      lastDealRoomStage: -Infinity,
      transition: createTransitionState(),
      floorTransition: createFloorTransitionState(),
      particles: new ParticlePool(),
      decals: new DecalLayer(),
      banner: createBannerState(),
      floorBanner: createBannerState(),
      currency: new Currency(),
      inventory: new ItemInventory(),
      trinketInventory: new TrinketInventory(),
      consumableInventory: new ConsumableInventory(),
      pillIdentity: new PillIdentity(pillDefs.map((d) => d.id), rngStreams.stream('pills')),
      playerHealth: new Health({ redMax: 6 }),
      stats: { kills: 0, floorsCleared: 0, startTime: performance.now(), elapsedSeconds: 0 },
    };
    run.floor = generateFloor(run.stage, run.floorRng);
    run.floorRuntime = new FloorRuntime(run.floor, templates, run.templateRng);
    run.room = run.floorRuntime.getCurrentRoom();
    stockRoom(run, run.room, run.floorRuntime.getCurrentCell());
    const tileSize = run.room.world.tileGrid.tileSize;
    run.centerX = (run.room.widthTiles * tileSize) / 2;
    run.centerY = (run.room.heightTiles * tileSize) / 2;
    run.player = createPlayer(run.room.world, { x: run.centerX, y: run.centerY, stats: new Stats() });
    announceFloor(run);
    return run;
  }

  const input = createInputState();
  createKeyboardAdapter(input, window);
  const camera = new Camera({ viewportWidth: VIEW_W, viewportHeight: VIEW_H });
  // The camera is fixed on the room center: the whole 13x7 room is always on screen, centered (ROOM_RECT).
  const ROOM_CENTER = { x: ROOM_RECT.w / 2, y: ROOM_RECT.h / 2 };
  camera.centerOn(ROOM_CENTER.x, ROOM_CENTER.y);

  // Integer-scaled, letterboxed canvas; recomputed on every window resize.
  let viewport = computeViewport(window.innerWidth, window.innerHeight, VIEW_W, VIEW_H, window.devicePixelRatio || 1);
  function applyViewport() {
    const dpr = window.devicePixelRatio || 1;
    viewport = computeViewport(window.innerWidth, window.innerHeight, VIEW_W, VIEW_H, dpr);
    canvas.width = viewport.backingW;
    canvas.height = viewport.backingH;
    canvas.style.width = `${viewport.cssW}px`;
    canvas.style.height = `${viewport.cssH}px`;
  }
  applyViewport();
  window.addEventListener('resize', applyViewport);

  let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'dead'
  let currentRun = null;
  let lastPlayerScreen = null;

  events.on('enemy:death', ({ enemy }) => {
    if (!currentRun) return;
    currentRun.stats.kills += 1;
    currentRun.particles.burst(enemy.x, enemy.y, 12, { color: '#8a3a4a', rng: currentRun.vfxRng });
    currentRun.decals.add({ x: enemy.x, y: enemy.y, color: '#5a1a1a', size: 10, alpha: 0.5 });
    if (enemy.isBoss) {
      const itemId = itemPools.draw('boss', currentRun.spawnRng);
      if (itemId) spawnItemPedestal(currentRun.room.world, itemId, { x: enemy.x, y: enemy.y });
      spawnTrapdoor(currentRun.room.world, { x: currentRun.centerX, y: currentRun.centerY });

      // Devil/angel deal room (CLAUDE.md §3): a chance, built from this floor's damage-free streak, to
      // attach a bonus room to the boss room the instant it's cleared.
      const chance = dealRoomChance({
        stage: currentRun.stage,
        noBossDamage: !currentRun.bossFightRedDamageTaken,
        noFloorDamage: !currentRun.floorRedDamageTaken,
        recentlySeen: currentRun.stage - currentRun.lastDealRoomStage <= CONFIG.DEAL_ROOM_RECENT_FLOORS,
      });
      if (currentRun.spawnRng.chance(chance)) {
        const dealType = rollDealRoomType(!currentRun.floorRedDamageTaken);
        const key = currentRun.floorRuntime.attachBonusRoom(dealType);
        if (key) currentRun.lastDealRoomStage = currentRun.stage;
      }
    }
  });
  events.on('health:damaged', ({ redLost }) => {
    camera.shake(4, 0.15);
    if (!currentRun || !(redLost > 0)) return;
    currentRun.floorRedDamageTaken = true;
    const bossAlive = currentRun.room.world.entities.byType('enemy').some((e) => e.alive && e.isBoss);
    if (bossAlive) currentRun.bossFightRedDamageTaken = true;
  });
  events.on('health:death', ({ source }) => {
    if (!currentRun || currentRun.stats.killedBy) return;
    currentRun.stats.killedBy = describeDeathCause(source, {
      getEnemyDef: (id) => registries.of('enemy').get(id),
      getBossDef: (id) => registries.of('boss').get(id),
    });
    currentRun.particles.burst(currentRun.player.x, currentRun.player.y, 18, { color: '#c0283c', speed: 120, life: 0.45, rng: currentRun.vfxRng });
  });
  events.on('bomb:explode', ({ x, y, radius }) => {
    if (!currentRun) return;
    currentRun.particles.burst(x, y, 20, { color: '#e8a030', speed: 140, life: 0.4, rng: currentRun.vfxRng });
    camera.shake(8, 0.2);
    currentRun.floorRuntime.revealSecretWall(x, y);
  });
  events.on('item:pickup', ({ name, description, x, y }) => {
    if (!currentRun) return;
    showBanner(currentRun.banner, name, description);
    // Pickup flash (P1.G7): a bright radial sparkle at the pedestal/pickup spot, falling back to the player if no position was given (e.g. synergies).
    const px = x ?? currentRun.player.x;
    const py = y ?? currentRun.player.y;
    currentRun.particles.burst(px, py, 14, { color: '#ffe9a0', speed: 90, life: 0.35, size: 3, rng: currentRun.vfxRng });
  });
  // Shot puff (P1.G7): a tiny muzzle flash wherever any tear (player or enemy) spawns, colored to match that tear's sprite.
  events.on('tear:fired', ({ x, y, team }) => {
    if (!currentRun) return;
    currentRun.particles.burst(x, y, 3, { color: team === 'enemy' ? '#ff9a5a' : '#cfe9ff', speed: 50, life: 0.12, size: 2, rng: currentRun.vfxRng });
  });
  // Tear splash (P1.G7): a small fan of particles wherever a tear is destroyed — a wall hit, an enemy hit, or reaching max range.
  events.on('projectile:splash', ({ entity, reason }) => {
    if (!currentRun || !entity) return;
    const count = reason === 'hit' ? 6 : 4;
    const color = entity.team === 'enemy' ? '#ff9a5a' : '#cfe9ff';
    currentRun.particles.burst(entity.x, entity.y, count, { color, speed: 70, life: 0.2, size: 2, rng: currentRun.vfxRng });
  });

  const loop = new FixedStepLoop({
    update: (dt) => {
      pollGamepads(input);

      if (gameState === 'menu' || gameState === 'dead') {
        if (input.justPressed.has('useActive')) {
          currentRun = createRun();
          gameState = 'playing';
        }
        clearFrameEdges(input);
        return;
      }

      if (input.justPressed.has('pause')) {
        gameState = gameState === 'paused' ? 'playing' : 'paused';
        clearFrameEdges(input);
        return;
      }
      if (gameState === 'paused') {
        clearFrameEdges(input);
        return;
      }

      const run = currentRun;

      if (run.floorTransition.active) {
        if (updateFloorTransition(run.floorTransition, dt) === 'swap') advanceFloor(run);
        clearFrameEdges(input);
        return;
      }

      if (run.transition.active) {
        if (updateTransition(run.transition, dt)) enterCurrentRoom(run, run.pendingEntrySide);
        clearFrameEdges(input);
        return;
      }

      if (consumeHitstopFrame()) {
        clearFrameEdges(input);
        return;
      }

      updatePlayer(run.room.world, run.player, input, dt, { events });
      updateEnemies(run.room.world, run.player, dt, { events, rng: run.aiRng });
      updateFamiliars(run.room.world, run.player, dt, { events, rng: run.spawnRng });
      updateProjectiles(run.room.world, dt, events);
      updateBombs(run.room.world, dt, { player: run.player, playerHealth: run.playerHealth, room: run.room, events, rng: run.spawnRng });
      resolveCombat(run.room.world, { player: run.player, playerHealth: run.playerHealth, events, rng: run.spawnRng });
      resolveItemPedestals(run.room.world, run.player, {
        inventory: run.inventory,
        stats: run.player.stats,
        playerHealth: run.playerHealth,
        events,
        pools: itemPools,
        getItemDef,
        getFamiliarDef,
      });
      resolveShopPurchases(run.room.world, run.player, {
        inventory: run.inventory,
        stats: run.player.stats,
        playerHealth: run.playerHealth,
        currency: run.currency,
        pools: itemPools,
        getItemDef,
        getFamiliarDef,
        events,
      });
      resolveDevilDealPurchases(run.room.world, run.player, {
        inventory: run.inventory,
        stats: run.player.stats,
        playerHealth: run.playerHealth,
        pools: itemPools,
        getItemDef,
        events,
      });
      resolveSacrificeSpikes(run.room.world, run.player, { playerHealth: run.playerHealth, events, rng: run.spawnRng, trinketPools, cardPools });
      resolveArcadeMachines(run.room.world, run.player, { currency: run.currency, events, rng: run.spawnRng, itemPools, cardPools });
      resolveKeyLockedDoors(run.room, run.player, { currency: run.currency, events });
      resolvePickups(run.room.world, run.player, { currency: run.currency, playerHealth: run.playerHealth, events, rng: run.spawnRng, trinketPools, cardPools });
      resolveTrinketPickups(run.room.world, run.player, {
        inventory: run.trinketInventory,
        stats: run.player.stats,
        events,
        pools: trinketPools,
        getTrinketDef,
      });
      resolveConsumablePickups(run.room.world, run.player, {
        inventory: run.consumableInventory,
        events,
        getCardDef,
        getPillDef,
        pillIdentity: run.pillIdentity,
      });
      updateTempStatBoosts(run.player, dt);
      const firedSynergies = checkSynergies(run.inventory, run.player.stats, run.playerHealth, run.player, synergyRules, run.appliedSynergyIds);
      for (const ruleId of firedSynergies) {
        const rule = synergyRules.find((r) => r.id === ruleId);
        events.emit('item:pickup', { id: ruleId, name: 'Synergy!', description: rule?.description ?? '' });
      }
      const activatedTransformations = checkTransformations(run.inventory, run.player.stats, run.playerHealth, run.player, transformationDefs, getItemDef, run.activeTransformationIds);
      for (const transformationId of activatedTransformations) {
        const def = transformationDefs.find((t) => t.id === transformationId);
        events.emit('item:pickup', { id: transformationId, name: `Transformation: ${def?.name ?? transformationId}!`, description: def?.description ?? '', x: run.player.x, y: run.player.y });
      }
      tickInvuln(run.playerHealth, dt);
      run.room.world.reap();

      if (input.justPressed.has('bomb') && run.currency.bombs > 0) {
        run.currency.bombs -= 1;
        placeBomb(run.room.world, { x: run.player.x, y: run.player.y });
      }
      if (input.justPressed.has('dropTrinket')) {
        dropTrinket(run.room.world, run.trinketInventory, run.player.stats, { x: run.player.x, y: run.player.y });
      }
      if (input.justPressed.has('useConsumable')) {
        useConsumableSlot(
          run.consumableInventory,
          {
            world: run.room.world,
            player: run.player,
            playerHealth: run.playerHealth,
            stats: run.player.stats,
            events,
            rng: run.spawnRng,
            floor: run.floor,
            floorRuntime: run.floorRuntime,
            currency: run.currency,
          },
          { getCardDef, getPillDef, pillIdentity: run.pillIdentity }
        );
      }
      if (input.justPressed.has('useActive') && run.inventory.actives.length > 0) {
        const activeDef = getItemDef(run.inventory.actives[0].id);
        if (activeDef) {
          useActiveItem(run.inventory, 0, activeDef, {
            world: run.room.world,
            player: run.player,
            playerHealth: run.playerHealth,
            events,
            rng: run.spawnRng,
          });
        }
      }

      updateChallengeRoom(run.room, dt, { rng: run.spawnRng });
      const justCleared = run.room.update(dt);
      if (justCleared) {
        chargeActivesOnRoomClear(run.inventory);
        // Boss rooms drop their own guaranteed item + trapdoor (CLAUDE.md §3); no extra room-clear roll.
        if (run.floorRuntime.getCurrentCell().type !== 'boss') {
          const reward = rollRoomClearReward(run.spawnRng, run.player.stats.luck);
          if (reward) spawnRewardPickup(run.room.world, reward, { x: run.centerX, y: run.centerY, rng: run.spawnRng, trinketPools, cardPools });
        }
      }

      if (!run.playerHealth.alive) {
        run.stats.elapsedSeconds = (performance.now() - run.stats.startTime) / 1000;
        gameState = 'dead';
        clearFrameEdges(input);
        return;
      }

      if (resolveTrapdoor(run.room.world, run.player)) {
        startFloorTransition(run.floorTransition);
        clearFrameEdges(input);
        return;
      }

      const exitSide = detectDoorExit(run.room, run.player);
      if (exitSide) {
        const destCell = run.floorRuntime.peekNeighborCell(exitSide);
        // Challenge rooms are only enterable at full health (CLAUDE.md §3) — the door simply doesn't open otherwise.
        const blockedByChallenge = destCell?.type === 'challenge' && !isAtFullRedHealth(run.playerHealth);
        if (!blockedByChallenge) {
          const leavingType = run.floorRuntime.getCurrentCell().type;
          const result = run.floorRuntime.move(exitSide);
          if (result) {
            run.pendingEntrySide = result.enteredFrom;
            run.pendingLeavingType = leavingType;
            startTransition(run.transition, exitSide);
          }
        }
      }

      clearFrameEdges(input);
    },
  });
  loop.start();

  // Dev/test hook used by tools/smoke.mjs (Playwright) to drive the real game through real doors.
  window.__undercroft = {
    state: () => gameState,
    snapshot() {
      const run = currentRun;
      if (!run) return { state: gameState };
      const room = run.room;
      return {
        state: gameState,
        stage: run.stage,
        cellKey: run.floorRuntime.currentKey,
        cellType: run.floorRuntime.getCurrentCell().type,
        player: { x: run.player.x, y: run.player.y, inWorld: room.world.entities.byType('player').includes(run.player) },
        enemies: room.world.entities.byType('enemy').filter((e) => e.alive).length,
        familiars: room.world.entities.byType('familiar').filter((e) => e.alive).length,
        transformations: [...run.activeTransformationIds],
        flying: !!run.player.flying,
        enemyPos: room.world.entities.byType('enemy').filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y })),
        enemyShots: room.world.entities.byType('projectile').filter((p) => p.alive && p.team === 'enemy').length,
        graceTimer: room.world.enemyGraceTimer ?? 0,
        doors: [...room.doors].map(([side, d]) => ({ side, tx: d.tx, ty: d.ty, locked: d.locked, keyLocked: !!d.keyLocked, animPulse: room.doorAnimProgress(side) })),
        transitioning: run.transition.active,
        floorTransitioning: run.floorTransition.active,
        hp: run.playerHealth.red,
        killedBy: run.stats.killedBy ?? null,
        playerPixel: lastPlayerScreen,
        floorCells: [...run.floor.cells.values()].map((c) => ({ key: `${c.x},${c.y}`, type: c.type })),
        boss: (() => {
          const boss = room.world.entities.byType('enemy').find((e) => e.alive && e.isBoss);
          return boss ? { patternState: boss.patternState, currentPatternId: boss.currentPatternId } : null;
        })(),
      };
    },
    killAllEnemies() {
      for (const e of currentRun.room.world.entities.byType('enemy')) e.alive = false;
    },
    setPlayer(x, y) {
      currentRun.player.x = x;
      currentRun.player.y = y;
    },
    setHealth(red) {
      currentRun.playerHealth.red = red;
    },
    giveCoins(n) {
      currentRun.currency.coins += n;
    },
    gotoCell(key) {
      const run = currentRun;
      run.floorRuntime.currentKey = key;
      run.floorRuntime.visited.add(key);
      enterCurrentRoom(run, null);
    },
    spawnEnemyOnPlayer(defId) {
      const def = registries.of('enemy').get(defId);
      const run = currentRun;
      return spawnEnemy(run.room.world, def, { x: run.player.x, y: run.player.y, rng: run.spawnRng });
    },
    /** Gives a representative loadout (active item w/ partial charge, trinket, card, pickups) to exercise the HUD. */
    giveLoadout() {
      const run = currentRun;
      const active = registries.of('item').all().find((d) => d.type === 'active');
      if (active) {
        pickUpItem(run.inventory, run.player.stats, run.playerHealth, active, run.player);
        run.inventory.actives[run.inventory.actives.length - 1].charge = 1;
      }
      const trinket = registries.of('trinket').all()[0];
      if (trinket) equipTrinket(run.trinketInventory, run.player.stats, trinket);
      const card = registries.of('card').all()[0];
      if (card) run.consumableInventory.current = { kind: 'card', cardId: card.id };
      run.currency.coins = 23;
      run.currency.bombs = 3;
      run.currency.keys = 2;
    },
    spawnEnemyAt(defId, x, y) {
      const run = currentRun;
      return spawnEnemy(run.room.world, registries.of('enemy').get(defId), { x, y, rng: run.spawnRng });
    },
    /** Picks up 3 real items carrying `transformationId`'s set tag through the real pickUpItem pipeline, so the next tick's checkTransformations call activates it for real (dev/test only, for P2.5 visual verification). */
    triggerTransformation(transformationId) {
      const run = currentRun;
      const def = registries.of('transformation').get(transformationId);
      if (!def) return false;
      const carriers = registries.of('item').all().filter((i) => i.sets?.includes(def.setTag)).slice(0, 3);
      for (const itemDef of carriers) {
        pickUpItem(run.inventory, run.player.stats, run.playerHealth, itemDef, run.player);
      }
      return carriers.length >= 3;
    },
    /** Spawns one familiar of each behavior (orbit/hover/follow) on the player (dev/test only, for P2.4 visual verification). */
    giveFamiliars() {
      const run = currentRun;
      for (const behavior of ['orbit', 'hover', 'follow']) {
        const def = registries.of('familiar').all().find((d) => d.behavior === behavior);
        if (def) spawnFamiliar(run.room.world, def, { player: run.player });
      }
    },
    /** Stocks the current room with a P2.6 special room type's content directly (dev/test only, since these room types are rare/gated and this skips waiting on a natural floor roll). */
    debugStockSpecial(type) {
      const run = currentRun;
      const room = run.room;
      const tileGrid = room.world.tileGrid;
      if (type === 'sacrifice') {
        spawnSacrificeSpike(room.world, tileGrid.tileCenter(6, 3));
      } else if (type === 'arcade') {
        spawnSlotMachine(room.world, tileGrid.tileCenter(4, 3));
        spawnFortuneMachine(room.world, tileGrid.tileCenter(8, 3));
      } else if (type === 'devil') {
        const itemId = itemPools.draw('devil', run.spawnRng) ?? registries.of('item').all()[0]?.id;
        if (itemId) spawnDevilItem(room.world, itemId, tileGrid.tileCenter(5, 3));
      }
    },
    enemyIds: () => registries.of('enemy').all().map((d) => d.id),
    /** Paints a pit into the current room's tile grid (dev/test only, for P1.G1's pit-vs-tear verification). */
    placePit(tx, ty) {
      currentRun.room.placePit(tx, ty);
    },
    /** Clears a tile back to plain floor regardless of what a template put there (dev/test only). */
    setFloor(tx, ty) {
      currentRun.room.setTileType(tx, ty, TILE.FLOOR);
    },
    /** Starts the floor-descent fade (dev/test only, for P1.G7 visual verification without walking to a real trapdoor). */
    triggerFloorTransition() {
      startFloorTransition(currentRun.floorTransition);
    },
    /** Resets the current room's clear/lock bookkeeping (dev/test only) so a freshly spawned enemy actually re-locks its doors, even if this room was already cleared earlier in the same test run. */
    resetRoomClear() {
      const room = currentRun.room;
      room.cleared = false;
      room._locked = false;
      room._lockedSeconds = 0;
      room._softlockEscaped = false;
    },
  };

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, CONFIG.MAX_FRAME_TIME);
    lastTime = now;
    loop.tick(dt);

    ctx.setTransform(viewport.scale, 0, 0, viewport.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (gameState === 'menu') {
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      drawMenuScreen(ctx, { width: VIEW_W, height: VIEW_H });
      requestAnimationFrame(frame);
      return;
    }

    const run = currentRun;
    camera.update(dt, run.vfxRng);
    run.particles.update(dt);
    updateBanner(run.banner, dt);
    updateBanner(run.floorBanner, dt);

    const chapter = Math.ceil(run.stage / 2);
    renderRoom(ctx, {
      room: run.room,
      camera,
      playerHealth: run.playerHealth,
      particles: run.particles,
      decals: run.decals,
      dt,
      chapter,
      getItemDef,
      getTrinketDef,
      getCardDef,
    });
    const ps = camera.worldToScreen(run.player.x, run.player.y);
    lastPlayerScreen = { x: ps.x * viewport.scale, y: ps.y * viewport.scale }; // canvas backing-store pixels (for the smoke pixel check)
    drawHudPanels(ctx, computeHudModel({
      playerHealth: run.playerHealth,
      currency: run.currency,
      stats: run.player.stats,
      inventory: run.inventory,
      trinketInventory: run.trinketInventory,
      consumableInventory: run.consumableInventory,
      getItemDef,
      getCardDef,
      getPillDef,
      pillIdentity: run.pillIdentity,
    }));
    drawFloorBanner(ctx, run.floorBanner);
    // Item pickup banner sits in the bottom wall row so it never covers walkable floor.
    drawBanner(ctx, run.banner, { x: ROOM_RECT.x, y: ROOM_RECT.y + ROOM_RECT.h - 20, width: ROOM_RECT.w });

    const boss = run.room.world.entities.byType('enemy').find((e) => e.alive && e.isBoss);
    if (boss) {
      const bossDef = getBossDef(boss.defId);
      drawBossBar(ctx, boss, { x: (VIEW_W - 300) / 2, y: VIEW_H - 22, width: 300, height: 10, name: bossDef?.name ?? '' });
    }

    if (run.transition.active) {
      const delta = DOOR_DELTA[run.transition.direction];
      ctx.fillStyle = '#000';
      if (delta.x !== 0) {
        const w = ROOM_RECT.w * run.transition.progress;
        ctx.fillRect(delta.x > 0 ? ROOM_RECT.x : ROOM_RECT.x + ROOM_RECT.w - w, ROOM_RECT.y, w, ROOM_RECT.h);
      } else {
        const h = ROOM_RECT.h * run.transition.progress;
        ctx.fillRect(ROOM_RECT.x, delta.y > 0 ? ROOM_RECT.y : ROOM_RECT.y + ROOM_RECT.h - h, ROOM_RECT.w, h);
      }
    }

    const icons = computeMinimapIcons(run.floor, { visited: run.floorRuntime.visited, currentKey: run.floorRuntime.currentKey });
    drawMinimap(ctx, icons, { x: VIEW_W - 56, y: 6, cellSize: 5, gap: 1 });

    const floorFadeAlpha = floorTransitionAlpha(run.floorTransition);
    if (floorFadeAlpha > 0) {
      ctx.fillStyle = '#000';
      ctx.globalAlpha = floorFadeAlpha;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }

    if (gameState === 'paused') drawPauseScreen(ctx, { width: VIEW_W, height: VIEW_H });
    if (gameState === 'dead') {
      drawDeathScreen(ctx, {
        width: VIEW_W,
        height: VIEW_H,
        stats: {
          floorsCleared: run.stats.floorsCleared,
          kills: run.stats.kills,
          coins: run.currency.coins,
          elapsedSeconds: run.stats.elapsedSeconds,
          killedBy: run.stats.killedBy,
        },
      });
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('Undercroft failed to boot:', err);
});
