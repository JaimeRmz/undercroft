/** Browser entry point: generates a floor, boots a FloorRuntime, and runs the render loop with room transitions. */
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
import { createInputState, createKeyboardAdapter, pollGamepads, clearFrameEdges } from './engine/input.js';
import { events } from './core/events.js';
import { Camera } from './render/camera.js';
import { ParticlePool } from './render/particles.js';
import { DecalLayer } from './render/decals.js';
import { renderRoom } from './render/renderer.js';
import { computeMinimapIcons, drawMinimap } from './ui/map.js';
import { createBannerState, showBanner, updateBanner, drawBanner } from './ui/itemBanner.js';
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

  const rngStreams = new RngStreams(`run-${Date.now()}`);
  const floorRng = rngStreams.stream('floorgen');
  const templateRng = rngStreams.stream('rooms');
  const aiRng = rngStreams.stream('ai');
  const vfxRng = rngStreams.stream('vfx');
  const spawnRng = rngStreams.stream('spawns');

  const floor = generateFloor(1, floorRng);
  const templates = registries.of('room').all();
  const floorRuntime = new FloorRuntime(floor, templates, templateRng);
  const itemPools = buildItemPools(registries.of('item').all());
  const getItemDef = (id) => registries.of('item').get(id);

  const stockedRooms = new Set();
  function stockRoom(room, cell) {
    const key = `${cell.x},${cell.y}`;
    if (stockedRooms.has(key)) return;
    stockedRooms.add(key);

    if (cell.type === 'treasure') {
      const tileSize = room.world.tileGrid.tileSize;
      const center = room.world.tileGrid.tileCenter(Math.floor(room.widthTiles / 2), Math.floor(room.heightTiles / 2));
      const itemId = itemPools.draw('treasure', spawnRng);
      if (itemId) spawnItemPedestal(room.world, itemId, { x: center.x, y: center.y });
      return;
    }

    if (cell.type !== 'normal' && cell.type !== 'boss') return;
    const enemyDefs = registries.of('enemy').all();
    if (enemyDefs.length === 0) return;
    const count = spawnRng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const def = spawnRng.pick(enemyDefs);
      const tx = spawnRng.int(2, room.widthTiles - 3);
      const ty = spawnRng.int(2, room.heightTiles - 3);
      const center = room.world.tileGrid.tileCenter(tx, ty);
      spawnEnemy(room.world, def, { x: center.x, y: center.y });
    }
  }

  let room = floorRuntime.getCurrentRoom();
  stockRoom(room, floorRuntime.getCurrentCell());

  const tileSize = room.world.tileGrid.tileSize;
  const centerX = (room.widthTiles * tileSize) / 2;
  const centerY = (room.heightTiles * tileSize) / 2;
  const player = createPlayer(room.world, { x: centerX, y: centerY, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  const currency = new Currency();
  const inventory = new ItemInventory();
  const synergyRules = registries.of('synergy').all();
  const appliedSynergyIds = new Set();
  const banner = createBannerState();

  const input = createInputState();
  createKeyboardAdapter(input, window);

  const camera = new Camera({ viewportWidth: canvas.width, viewportHeight: canvas.height });
  const particles = new ParticlePool();
  const decals = new DecalLayer();
  const transition = createTransitionState();
  let pendingEntrySide = null;

  events.on('enemy:death', ({ enemy }) => {
    particles.burst(enemy.x, enemy.y, 12, { color: '#8a3a4a', rng: vfxRng });
    decals.add({ x: enemy.x, y: enemy.y, color: '#5a1a1a', size: 10, alpha: 0.5 });
  });
  events.on('health:damaged', () => camera.shake(4, 0.15));
  events.on('bomb:explode', ({ x, y, radius }) => {
    particles.burst(x, y, 20, { color: '#e8a030', speed: 140, life: 0.4, rng: vfxRng });
    camera.shake(8, 0.2);
    floorRuntime.revealSecretWall(x, y);
  });
  events.on('item:pickup', ({ name, description }) => showBanner(banner, name, description));

  const loop = new FixedStepLoop({
    update: (dt) => {
      pollGamepads(input);

      if (transition.active) {
        if (updateTransition(transition, dt)) {
          room = floorRuntime.getCurrentRoom();
          stockRoom(room, floorRuntime.getCurrentCell());
          const pos = entryPositionForSide(room, pendingEntrySide);
          player.x = pos.x;
          player.y = pos.y;
          player.vx = 0;
          player.vy = 0;
          decals.clear();
        }
        clearFrameEdges(input);
        return;
      }

      updatePlayer(room.world, player, input, dt, { events });
      updateEnemies(room.world, player, dt, { events, rng: aiRng });
      updateProjectiles(room.world, dt, events);
      updateBombs(room.world, dt, { player, playerHealth, room, events });
      resolveCombat(room.world, { player, playerHealth, events });
      resolvePickups(room.world, player, { currency, playerHealth, events, rng: spawnRng });
      resolveItemPedestals(room.world, player, {
        inventory,
        stats: player.stats,
        playerHealth,
        events,
        pools: itemPools,
        getItemDef,
      });
      const firedSynergies = checkSynergies(inventory, player.stats, playerHealth, player, synergyRules, appliedSynergyIds);
      for (const ruleId of firedSynergies) {
        const rule = synergyRules.find((r) => r.id === ruleId);
        events.emit('item:pickup', { id: ruleId, name: 'Synergy!', description: rule?.description ?? '' });
      }
      tickInvuln(playerHealth, dt);
      room.world.reap();

      if (input.justPressed.has('bomb') && currency.bombs > 0) {
        currency.bombs -= 1;
        placeBomb(room.world, { x: player.x, y: player.y });
      }
      if (input.justPressed.has('useActive') && inventory.actives.length > 0) {
        const activeDef = getItemDef(inventory.actives[0].id);
        if (activeDef) useActiveItem(inventory, 0, activeDef, { world: room.world, player, playerHealth, events, rng: spawnRng });
      }

      const justCleared = room.update();
      if (justCleared) {
        chargeActivesOnRoomClear(inventory);
        const reward = rollRoomClearReward(spawnRng, player.stats.luck);
        if (reward) spawnRewardPickup(room.world, reward, { x: centerX, y: centerY, rng: spawnRng });
      }

      const exitSide = detectDoorExit(room, player);
      if (exitSide) {
        const result = floorRuntime.move(exitSide);
        if (result) {
          pendingEntrySide = result.enteredFrom;
          startTransition(transition, exitSide);
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
    if (!transition.active) camera.centerOn(player.x, player.y);
    camera.update(dt, vfxRng);
    particles.update(dt);
    updateBanner(banner, dt);

    renderRoom(ctx, { room, camera, playerHealth, particles, decals, dt });
    drawBanner(ctx, banner, { x: 0, y: 80, width: canvas.width });

    if (transition.active) {
      const delta = DOOR_DELTA[transition.direction];
      ctx.fillStyle = '#000';
      if (delta.x !== 0) {
        const w = canvas.width * transition.progress;
        ctx.fillRect(delta.x > 0 ? 0 : canvas.width - w, 0, w, canvas.height);
      } else {
        const h = canvas.height * transition.progress;
        ctx.fillRect(0, delta.y > 0 ? 0 : canvas.height - h, canvas.width, h);
      }
    }

    const icons = computeMinimapIcons(floor, { visited: floorRuntime.visited, currentKey: floorRuntime.currentKey });
    drawMinimap(ctx, icons, { x: canvas.width - 150, y: 16 });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('Undercroft failed to boot:', err);
});
