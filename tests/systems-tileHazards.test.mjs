import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/systems/room.js';
import { Health, tickInvuln } from '../src/systems/health.js';
import { resolveTileHazards } from '../src/systems/tileHazards.js';
import { createEventBus } from '../src/core/events.js';

/** A minimal player on the given tile's center. */
function playerOnTile(room, tx, ty) {
  const c = room.world.tileGrid.tileCenter(tx, ty);
  return { x: c.x, y: c.y, radius: 10 };
}

test('standing on a spike deals damage, gated by i-frames (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  const player = playerOnTile(room, 4, 3);
  const health = new Health({ redMax: 6 });

  const first = resolveTileHazards(room, player, health, {});
  assert.equal(first, 1, 'first contact deals a half-heart');
  assert.ok(health.isInvulnerable, 'the hit started i-frames');

  const second = resolveTileHazards(room, player, health, {});
  assert.equal(second, 0, 'a second hit the same instant is blocked by i-frames');

  // Run i-frames down, then it can hurt again.
  tickInvuln(health, 2);
  assert.equal(resolveTileHazards(room, player, health, {}), 1, 'after i-frames expire it hurts again');
});

test('a fireplace tile hurts the player on contact (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeFireplace(4, 3);
  // The player clips the fireplace tile from the adjacent floor tile.
  const c = room.world.tileGrid.tileCenter(4, 3);
  const player = { x: c.x - room.world.tileGrid.tileSize * 0.5, y: c.y, radius: 10 };
  const health = new Health({ redMax: 6 });
  assert.equal(resolveTileHazards(room, player, health, {}), 1);
});

test('a hazard death reports a readable source (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  const player = playerOnTile(room, 4, 3);
  const health = new Health({ redMax: 0, red: 0 });
  health.red = 1; // one half-heart of red, nothing else
  const events = createEventBus();
  let deathSource = null;
  events.on('health:death', ({ source }) => { deathSource = source; });
  resolveTileHazards(room, player, health, { events });
  assert.ok(!health.alive, 'the spike killed the player');
  assert.equal(deathSource, 'spikes');
});

test('standing off any hazard tile deals no damage (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  const player = playerOnTile(room, 8, 3); // a plain floor tile
  const health = new Health({ redMax: 6 });
  assert.equal(resolveTileHazards(room, player, health, {}), 0);
  assert.equal(health.red, 6);
});

test('a flying player floats over hazards unharmed (P2.Q Q3b)', () => {
  const room = new Room();
  room.placeSpike(4, 3);
  const player = playerOnTile(room, 4, 3);
  player.flying = true;
  const health = new Health({ redMax: 6 });
  assert.equal(resolveTileHazards(room, player, health, {}), 0);
});
