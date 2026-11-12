import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FloorRuntime } from '../src/systems/floor.js';
import { generateFloor } from '../src/systems/floorgen.js';
import { placePlayerInRoom } from '../src/systems/roomEntry.js';
import { entryPositionForSide } from '../src/systems/transitions.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Rng } from '../src/core/rng.js';
import { Camera } from '../src/render/camera.js';
import { ParticlePool } from '../src/render/particles.js';
import { DecalLayer } from '../src/render/decals.js';
import { renderRoom } from '../src/render/renderer.js';
import { Health } from '../src/systems/health.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';
import { loadRealRegistries } from './helpers/realContent.mjs';

const DIRS = ['north', 'south', 'east', 'west'];

function playerDrawCalls(ctx, player, camera) {
  const p = camera.worldToScreen(player.x, player.y);
  // The player sprite is a 14px-radius body circle drawn with the sprite scale at the player's screen position.
  return ctx.calls.filter((c) => c.kind === 'arc' && Math.abs(c.x - p.x) < 1 && Math.abs(c.y - p.y) < 20);
}

test('player stays in the render list, visible, and on-screen across 10+ room transitions in all 4 directions', async () => {
  const { templates } = await loadRealRegistries();
  const seenDirections = new Set();
  let transitions = 0;

  for (let seed = 0; seed < 40 && seenDirections.size < 4; seed++) {
    const floor = generateFloor(1, new Rng(`entry-${seed}`));
    const runtime = new FloorRuntime(floor, templates, new Rng(`tpl-${seed}`));
    let room = runtime.getCurrentRoom();
    const player = createPlayer(room.world, { x: 260, y: 140, stats: new Stats() });
    const camera = new Camera({ viewportWidth: 640, viewportHeight: 360 });
    camera.centerOn(260, 140);

    // Walk a path: keep taking the next available door, preferring directions not yet seen.
    for (let step = 0; step < 12; step++) {
      const options = DIRS.filter((d) => room.doors.has(d));
      const side = options.find((d) => !seenDirections.has(d)) ?? options[step % options.length];
      const result = runtime.move(side);
      if (!result) break;
      seenDirections.add(side);
      const previousWorld = room.world;
      room = runtime.getCurrentRoom();
      placePlayerInRoom(player, previousWorld, room, entryPositionForSide(room, result.enteredFrom));
      transitions++;

      assert.ok(room.world.entities.byType('player').includes(player), `player missing from new world after going ${side}`);
      assert.ok(!previousWorld.entities.byType('player').includes(player), 'player must leave the old world');

      const ctx = createMockCtx(640, 360);
      renderRoom(ctx, { room, camera, playerHealth: new Health({ redMax: 6 }), particles: new ParticlePool(), decals: new DecalLayer(), dt: 1 / 60 });
      const calls = playerDrawCalls(ctx, player, camera);
      assert.ok(calls.length > 0, `player produced no draw calls after going ${side}`);
      assert.ok(calls.every((c) => c.alpha > 0), 'player alpha must be > 0');

      const s = camera.worldToScreen(player.x, player.y);
      const roomRect = { x: camera.worldToScreen(0, 0).x, y: camera.worldToScreen(0, 0).y };
      const tile = room.world.tileGrid.tileSize;
      assert.ok(s.x > roomRect.x && s.x < roomRect.x + room.widthTiles * tile, `player screen x ${s.x} outside the room`);
      assert.ok(s.y > roomRect.y && s.y < roomRect.y + room.heightTiles * tile, `player screen y ${s.y} outside the room`);
    }
  }
  assert.deepEqual([...seenDirections].sort(), [...DIRS].sort(), 'expected transitions in all 4 directions');
  assert.ok(transitions >= 10, `expected at least 10 transitions, got ${transitions}`);
});
