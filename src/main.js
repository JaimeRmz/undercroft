/** Browser entry point: loads mods, builds one room with a player + enemy, and runs the render loop. */
import { FixedStepLoop } from './core/loop.js';
import { CONFIG } from './core/config.js';
import { Room } from './systems/room.js';
import { createPlayer, updatePlayer } from './systems/player.js';
import { spawnEnemy, updateEnemies } from './systems/enemies.js';
import { updateProjectiles } from './systems/projectiles.js';
import { resolveCombat } from './systems/combat.js';
import { Health, tickInvuln } from './systems/health.js';
import { Stats } from './systems/stats.js';
import { createInputState, createKeyboardAdapter, pollGamepads, clearFrameEdges } from './engine/input.js';
import { events } from './core/events.js';
import { Camera } from './render/camera.js';
import { ParticlePool } from './render/particles.js';
import { DecalLayer } from './render/decals.js';
import { renderRoom } from './render/renderer.js';
import { RngStreams } from './core/rng.js';
import { ModLoader } from './modding/modloader.js';
import { createHttpSource } from './modding/source.js';
import { registries } from './core/registry.js';
import { log } from './core/log.js';

async function boot() {
  const loader = new ModLoader({ source: createHttpSource(''), registries, events, log });
  await loader.loadAll();

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const room = new Room();
  const tileSize = room.world.tileGrid.tileSize;
  const centerX = (room.widthTiles * tileSize) / 2;
  const centerY = (room.heightTiles * tileSize) / 2;

  const player = createPlayer(room.world, { x: centerX, y: centerY, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });

  const chaserDef = registries.of('enemy').get('core:chaser');
  if (chaserDef) spawnEnemy(room.world, chaserDef, { x: centerX + 120, y: centerY });

  const input = createInputState();
  createKeyboardAdapter(input, window);

  const camera = new Camera({ viewportWidth: canvas.width, viewportHeight: canvas.height });
  const particles = new ParticlePool();
  const decals = new DecalLayer();
  const rngStreams = new RngStreams(`run-${Date.now()}`);
  const aiRng = rngStreams.stream('ai');
  const vfxRng = rngStreams.stream('vfx');

  events.on('enemy:death', ({ enemy }) => {
    particles.burst(enemy.x, enemy.y, 12, { color: '#8a3a4a', rng: vfxRng });
    decals.add({ x: enemy.x, y: enemy.y, color: '#5a1a1a', size: 10, alpha: 0.5 });
  });
  events.on('health:damaged', () => {
    camera.shake(4, 0.15);
  });

  const loop = new FixedStepLoop({
    update: (dt) => {
      pollGamepads(input);
      updatePlayer(room.world, player, input, dt, { events });
      updateEnemies(room.world, player, dt, { events, rng: aiRng });
      updateProjectiles(room.world, dt, events);
      resolveCombat(room.world, { player, playerHealth, events });
      tickInvuln(playerHealth, dt);
      room.world.reap();
      room.update();
      clearFrameEdges(input);
    },
  });
  loop.start();

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, CONFIG.MAX_FRAME_TIME);
    lastTime = now;
    loop.tick(dt);
    camera.centerOn(player.x, player.y);
    camera.update(dt, vfxRng);
    particles.update(dt);
    renderRoom(ctx, { room, camera, playerHealth, particles, decals, dt });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('Undercroft failed to boot:', err);
});
