import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer, updatePlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { createInputState, press, release, clearFrameEdges } from '../src/engine/input.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 }); // big open room
}

test('holding moveRight accelerates the player toward max speed within roughly PLAYER_ACCEL_FRAMES ticks', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const input = createInputState();
  press(input, 'moveRight');
  input.moveX = 1;

  const dt = 1 / 60;
  for (let i = 0; i < CONFIG.PLAYER_ACCEL_FRAMES + 2; i++) updatePlayer(world, player, input, dt);

  const maxSpeed = player.stats.clampedSpeed * CONFIG.PLAYER_BASE_SPEED_PX_PER_SEC;
  assert.ok(Math.abs(player.vx - maxSpeed) < 1, `expected vx near ${maxSpeed}, got ${player.vx}`);
  assert.equal(player.vy, 0);
});

test('releasing movement decelerates the player back to 0 via friction, not an instant stop', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const input = createInputState();
  input.moveX = 1;
  const dt = 1 / 60;
  for (let i = 0; i < 10; i++) updatePlayer(world, player, input, dt);
  const movingSpeed = player.vx;
  assert.ok(movingSpeed > 0);

  input.moveX = 0;
  updatePlayer(world, player, input, dt);
  assert.ok(player.vx > 0 && player.vx < movingSpeed, 'should decelerate gradually, not snap to 0');

  for (let i = 0; i < 20; i++) updatePlayer(world, player, input, dt);
  assert.ok(Math.abs(player.vx) < 1e-3);
});

test('diagonal movement speed equals cardinal movement speed (normalized)', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const input = createInputState();
  input.moveX = 1;
  input.moveY = 1;
  const dt = 1 / 60;
  for (let i = 0; i < 30; i++) updatePlayer(world, player, input, dt);
  const speed = Math.hypot(player.vx, player.vy);
  const maxSpeed = player.stats.clampedSpeed * CONFIG.PLAYER_BASE_SPEED_PX_PER_SEC;
  assert.ok(Math.abs(speed - maxSpeed) < 1, `expected magnitude ~${maxSpeed}, got ${speed}`);
});

test('shooting direction is independent of movement direction', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  const input = createInputState();
  input.moveX = 1; // moving right
  press(input, 'shootUp'); // but shooting up
  clearFrameEdges(input); // simulate "held from a previous frame", not a fresh press
  press(input, 'shootUp');

  const dt = 1 / 60;
  let spawned = null;
  const before = world.entities.byType('projectile').length;
  for (let i = 0; i < 60 && !spawned; i++) {
    updatePlayer(world, player, input, dt);
    const projectiles = world.entities.byType('projectile');
    if (projectiles.length > before) spawned = projectiles[projectiles.length - 1];
  }
  assert.ok(spawned, 'expected a tear to be fired');
  assert.ok(spawned.vy < 0, 'tear should travel upward (shootUp was held, independent of rightward movement)');
  // The tear's primary direction is still up: vy dominates even though it inherits some
  // rightward velocity from the moving player (CLAUDE.md §3: shots inherit 30% of player velocity).
  assert.ok(Math.abs(spawned.vy) > Math.abs(spawned.vx));
});

test('fire cooldown gates shot frequency according to stats.fireCooldownSeconds', () => {
  const world = freshWorld();
  const stats = new Stats(); // tearDelay 10 -> cooldown 11/30s
  const player = createPlayer(world, { x: 400, y: 400, stats });
  const input = createInputState();
  press(input, 'shootRight');

  const dt = 1 / 60;
  let shots = 0;
  const events = createEventBus();
  events.on('player:shoot', () => shots++);
  const totalSeconds = 2;
  for (let i = 0; i < totalSeconds / dt; i++) updatePlayer(world, player, input, dt, { events });

  const expectedShots = Math.floor(totalSeconds / stats.fireCooldownSeconds) + 1;
  assert.ok(Math.abs(shots - expectedShots) <= 1, `expected ~${expectedShots} shots, got ${shots}`);
});

test('charge shot: releasing the aim key early fires a tear with partial, not full, charge', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  player.weaponType = 'chargeShot';
  const input = createInputState();
  press(input, 'shootRight');
  clearFrameEdges(input);

  const dt = 1 / 60;
  const halfCharge = CONFIG.CHARGE_SHOT_MAX_SECONDS / 2;
  for (let i = 0; i < halfCharge / dt; i++) updatePlayer(world, player, input, dt);
  assert.equal(world.entities.byType('projectile').length, 0, 'should not fire while still charging');

  release(input, 'shootRight');
  updatePlayer(world, player, input, dt);
  const tears = world.entities.byType('projectile');
  assert.equal(tears.length, 1);
  const baseDamage = player.stats.damage;
  assert.ok(tears[0].damage > baseDamage, 'partial charge should still boost damage over a bare tear');
  assert.ok(
    tears[0].damage < baseDamage * CONFIG.CHARGE_SHOT_MAX_DAMAGE_MULT,
    'partial charge should do less than a fully-charged shot'
  );
});

test('charge shot: holding past CHARGE_SHOT_MAX_SECONDS auto-fires at full power without needing a release', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 400, y: 400, stats: new Stats() });
  player.weaponType = 'chargeShot';
  const input = createInputState();
  press(input, 'shootRight');
  clearFrameEdges(input);

  const dt = 1 / 60;
  for (let i = 0; i < (CONFIG.CHARGE_SHOT_MAX_SECONDS + dt) / dt; i++) updatePlayer(world, player, input, dt);

  const tears = world.entities.byType('projectile');
  assert.equal(tears.length, 1, 'should auto-fire once fully charged, still holding the key');
  const baseDamage = player.stats.damage;
  assert.ok(
    Math.abs(tears[0].damage - baseDamage * CONFIG.CHARGE_SHOT_MAX_DAMAGE_MULT) < 1e-6,
    'full charge should apply the max damage multiplier'
  );
});

test('player stays inside the room: resolveTileCollision pushes it off a solid tile', () => {
  const world = freshWorld();
  world.tileGrid.setSolid(10, 10, true);
  const center = world.tileGrid.tileCenter(10, 10);
  const player = createPlayer(world, { x: center.x, y: center.y, stats: new Stats() });
  const input = createInputState();
  updatePlayer(world, player, input, 1 / 60);
  const { tx, ty } = world.tileGrid.worldToTile(player.x, player.y);
  assert.ok(!world.tileGrid.isSolid(tx, ty));
});
