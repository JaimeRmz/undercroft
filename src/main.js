/** Browser entry point: menu -> run (floor/room loop, pause) -> death screen -> restart. */
import { FixedStepLoop } from './core/loop.js';
import { CONFIG } from './core/config.js';
import { FloorRuntime } from './systems/floor.js';
import { generateFloor } from './systems/floorgen.js';
import {
  createTransitionState,
  startTransition,
  updateTransition,
  detectDoorExit,
  entryPositionForSide,
  resolveKeyLockedDoors,
} from './systems/transitions.js';
import { createPlayer, updatePlayer } from './systems/player.js';
import { spawnEnemy, updateEnemies } from './systems/enemies.js';
import { updateProjectiles } from './systems/projectiles.js';
import { resolveCombat } from './systems/combat.js';
import { Health, tickInvuln } from './systems/health.js';
import { Stats } from './systems/stats.js';
import { placeBomb, updateBombs } from './systems/bombs.js';
import { Currency, resolvePickups, rollRoomClearReward, spawnRewardPickup } from './systems/pickups.js';
import {
  ItemInventory,
  buildItemPools,
  spawnItemPedestal,
  resolveItemPedestals,
  chargeActivesOnRoomClear,
  useActiveItem,
} from './systems/items.js';
import { checkSynergies } from './systems/synergies.js';
import { stockShop, resolveShopPurchases } from './systems/shop.js';
import { spawnBoss, spawnTrapdoor, resolveTrapdoor } from './systems/bosses.js';
import { drawBossBar } from './ui/bossbar.js';
import { createInputState, createKeyboardAdapter, pollGamepads, clearFrameEdges } from './engine/input.js';
import { events } from './core/events.js';
import { Camera } from './render/camera.js';
import { ParticlePool } from './render/particles.js';
import { DecalLayer } from './render/decals.js';
import { renderRoom } from './render/renderer.js';
import { computeMinimapIcons, drawMinimap } from './ui/map.js';
import { createBannerState, showBanner, updateBanner, drawBanner } from './ui/itemBanner.js';
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

    if (cell.type !== 'normal') return;
    const enemyDefs = getEnemyDefsForChapter(chapter);
    if (enemyDefs.length === 0) return;
    const count = run.spawnRng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const def = run.spawnRng.pick(enemyDefs);
      const tx = run.spawnRng.int(2, room.widthTiles - 3);
      const ty = run.spawnRng.int(2, room.heightTiles - 3);
      const center = room.world.tileGrid.tileCenter(tx, ty);
      spawnEnemy(room.world, def, { x: center.x, y: center.y, rng: run.spawnRng });
    }
  }

  function advanceFloor(run) {
    run.stage += 1;
    run.stats.floorsCleared += 1;
    run.floor = generateFloor(run.stage, run.floorRng);
    run.floorRuntime = new FloorRuntime(run.floor, templates, run.templateRng);
    run.stockedRooms.clear();
    run.room = run.floorRuntime.getCurrentRoom();
    stockRoom(run, run.room, run.floorRuntime.getCurrentCell());
    run.player.x = run.centerX;
    run.player.y = run.centerY;
    run.player.vx = 0;
    run.player.vy = 0;
    run.decals.clear();
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
      pendingEntrySide: null,
      transition: createTransitionState(),
      particles: new ParticlePool(),
      decals: new DecalLayer(),
      banner: createBannerState(),
      currency: new Currency(),
      inventory: new ItemInventory(),
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
    return run;
  }

  const input = createInputState();
  createKeyboardAdapter(input, window);
  const camera = new Camera({ viewportWidth: canvas.width, viewportHeight: canvas.height });

  let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'dead'
  let currentRun = null;

  events.on('enemy:death', ({ enemy }) => {
    if (!currentRun) return;
    currentRun.stats.kills += 1;
    currentRun.particles.burst(enemy.x, enemy.y, 12, { color: '#8a3a4a', rng: currentRun.vfxRng });
    currentRun.decals.add({ x: enemy.x, y: enemy.y, color: '#5a1a1a', size: 10, alpha: 0.5 });
    if (enemy.isBoss) {
      const itemId = itemPools.draw('boss', currentRun.spawnRng);
      if (itemId) spawnItemPedestal(currentRun.room.world, itemId, { x: enemy.x, y: enemy.y });
      spawnTrapdoor(currentRun.room.world, { x: currentRun.centerX, y: currentRun.centerY });
    }
  });
  events.on('health:damaged', () => camera.shake(4, 0.15));
  events.on('bomb:explode', ({ x, y, radius }) => {
    if (!currentRun) return;
    currentRun.particles.burst(x, y, 20, { color: '#e8a030', speed: 140, life: 0.4, rng: currentRun.vfxRng });
    camera.shake(8, 0.2);
    currentRun.floorRuntime.revealSecretWall(x, y);
  });
  events.on('item:pickup', ({ name, description }) => {
    if (currentRun) showBanner(currentRun.banner, name, description);
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

      if (run.transition.active) {
        if (updateTransition(run.transition, dt)) {
          run.room = run.floorRuntime.getCurrentRoom();
          stockRoom(run, run.room, run.floorRuntime.getCurrentCell());
          const pos = entryPositionForSide(run.room, run.pendingEntrySide);
          run.player.x = pos.x;
          run.player.y = pos.y;
          run.player.vx = 0;
          run.player.vy = 0;
          run.decals.clear();
        }
        clearFrameEdges(input);
        return;
      }

      updatePlayer(run.room.world, run.player, input, dt, { events });
      updateEnemies(run.room.world, run.player, dt, { events, rng: run.aiRng });
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
      });
      resolveShopPurchases(run.room.world, run.player, {
        inventory: run.inventory,
        stats: run.player.stats,
        playerHealth: run.playerHealth,
        currency: run.currency,
        pools: itemPools,
        getItemDef,
        events,
      });
      resolveKeyLockedDoors(run.room, run.player, { currency: run.currency, events });
      resolvePickups(run.room.world, run.player, { currency: run.currency, playerHealth: run.playerHealth, events, rng: run.spawnRng });
      const firedSynergies = checkSynergies(run.inventory, run.player.stats, run.playerHealth, run.player, synergyRules, run.appliedSynergyIds);
      for (const ruleId of firedSynergies) {
        const rule = synergyRules.find((r) => r.id === ruleId);
        events.emit('item:pickup', { id: ruleId, name: 'Synergy!', description: rule?.description ?? '' });
      }
      tickInvuln(run.playerHealth, dt);
      run.room.world.reap();

      if (input.justPressed.has('bomb') && run.currency.bombs > 0) {
        run.currency.bombs -= 1;
        placeBomb(run.room.world, { x: run.player.x, y: run.player.y });
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

      const justCleared = run.room.update();
      if (justCleared) {
        chargeActivesOnRoomClear(run.inventory);
        // Boss rooms drop their own guaranteed item + trapdoor (CLAUDE.md §3); no extra room-clear roll.
        if (run.floorRuntime.getCurrentCell().type !== 'boss') {
          const reward = rollRoomClearReward(run.spawnRng, run.player.stats.luck);
          if (reward) spawnRewardPickup(run.room.world, reward, { x: run.centerX, y: run.centerY, rng: run.spawnRng });
        }
      }

      if (!run.playerHealth.alive) {
        run.stats.elapsedSeconds = (performance.now() - run.stats.startTime) / 1000;
        gameState = 'dead';
        clearFrameEdges(input);
        return;
      }

      if (resolveTrapdoor(run.room.world, run.player)) {
        advanceFloor(run);
        clearFrameEdges(input);
        return;
      }

      const exitSide = detectDoorExit(run.room, run.player);
      if (exitSide) {
        const result = run.floorRuntime.move(exitSide);
        if (result) {
          run.pendingEntrySide = result.enteredFrom;
          startTransition(run.transition, exitSide);
        }
      }

      clearFrameEdges(input);
    },
  });
  loop.start();

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, CONFIG.MAX_FRAME_TIME);
    lastTime = now;
    loop.tick(dt);

    if (gameState === 'menu') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMenuScreen(ctx, { width: canvas.width, height: canvas.height });
      requestAnimationFrame(frame);
      return;
    }

    const run = currentRun;
    if (!run.transition.active && gameState === 'playing') camera.centerOn(run.player.x, run.player.y);
    camera.update(dt, run.vfxRng);
    run.particles.update(dt);
    updateBanner(run.banner, dt);

    const chapter = Math.ceil(run.stage / 2);
    renderRoom(ctx, { room: run.room, camera, playerHealth: run.playerHealth, particles: run.particles, decals: run.decals, dt, chapter });
    drawBanner(ctx, run.banner, { x: 0, y: 80, width: canvas.width });

    const boss = run.room.world.entities.byType('enemy').find((e) => e.alive && e.isBoss);
    if (boss) {
      const bossDef = getBossDef(boss.defId);
      drawBossBar(ctx, boss, { x: (canvas.width - 300) / 2, y: canvas.height - 50, name: bossDef?.name ?? '' });
    }

    if (run.transition.active) {
      const delta = DOOR_DELTA[run.transition.direction];
      ctx.fillStyle = '#000';
      if (delta.x !== 0) {
        const w = canvas.width * run.transition.progress;
        ctx.fillRect(delta.x > 0 ? 0 : canvas.width - w, 0, w, canvas.height);
      } else {
        const h = canvas.height * run.transition.progress;
        ctx.fillRect(0, delta.y > 0 ? 0 : canvas.height - h, canvas.width, h);
      }
    }

    const icons = computeMinimapIcons(run.floor, { visited: run.floorRuntime.visited, currentKey: run.floorRuntime.currentKey });
    drawMinimap(ctx, icons, { x: canvas.width - 150, y: 16 });

    if (gameState === 'paused') drawPauseScreen(ctx, { width: canvas.width, height: canvas.height });
    if (gameState === 'dead') {
      drawDeathScreen(ctx, {
        width: canvas.width,
        height: canvas.height,
        stats: {
          floorsCleared: run.stats.floorsCleared,
          kills: run.stats.kills,
          coins: run.currency.coins,
          elapsedSeconds: run.stats.elapsedSeconds,
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
