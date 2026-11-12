/**
 * P1.F4 fairness: entry grace period, i-frame blink, high-contrast enemy
 * projectiles, and "Killed by <enemy>" attribution.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/systems/room.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health, applyDamage, tickInvuln } from '../src/systems/health.js';
import { spawnEnemy, updateEnemies } from '../src/systems/enemies.js';
import { resolveCombat } from '../src/systems/combat.js';
import { updateProjectiles, spawnTear } from '../src/systems/projectiles.js';
import { placePlayerInRoom } from '../src/systems/roomEntry.js';
import { describeDeathCause } from '../src/systems/deathCause.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';
import { CONFIG } from '../src/core/config.js';
import { SPRITES, computeSpriteDrawOps } from '../src/render/sprites.js';
import { playerBlinkAlpha } from '../src/render/vfx.js';
import { Camera } from '../src/render/camera.js';
import { ParticlePool } from '../src/render/particles.js';
import { DecalLayer } from '../src/render/decals.js';
import { renderRoom } from '../src/render/renderer.js';
import { drawDeathScreen } from '../src/ui/screens.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';
import { loadRealRegistries } from './helpers/realContent.mjs';

const DT = 1 / 60;

function setup(def) {
  const oldRoom = new Room({ doorSides: ['north', 'south'] });
  const room = new Room({ doorSides: ['north', 'south'] });
  const player = createPlayer(oldRoom.world, { x: 260, y: 140, stats: new Stats() });
  placePlayerInRoom(player, oldRoom.world, room, { x: 260, y: 140 });
  const enemy = spawnEnemy(room.world, def, { x: 270, y: 140 }); // overlapping the player
  const health = new Health({ redMax: 6 });
  const events = createEventBus();
  return { room, player, enemy, health, events };
}

const CHASER = { id: 'core:chaser', name: 'Chaser', hp: 5, speed: 90, radius: 14, behavior: 'chase', contactDamageHalfHearts: 1 };

test('entering a room starts a ~0.5s grace: enemies neither move nor deal damage, then resume', () => {
  const { room, player, enemy, health, events } = setup(CHASER);
  const rng = new Rng('grace');
  const start = { x: enemy.x, y: enemy.y };
  const graceTicks = Math.floor(CONFIG.ROOM_ENTRY_GRACE_SECONDS / DT) - 2;

  for (let i = 0; i < graceTicks; i++) {
    updateEnemies(room.world, player, DT, { events, rng });
    resolveCombat(room.world, { player, playerHealth: health, events, rng });
  }
  assert.equal(health.red, 6, 'no damage during the grace period');
  assert.deepEqual({ x: enemy.x, y: enemy.y }, start, 'enemy must not move during the grace period');

  for (let i = 0; i < 20; i++) {
    updateEnemies(room.world, player, DT, { events, rng });
    resolveCombat(room.world, { player, playerHealth: health, events, rng });
  }
  assert.ok(health.red < 6, 'enemy contact must hurt once the grace period is over');
});

test('enemy projectiles also do nothing during the grace period', () => {
  const { room, player, health, events } = setup(CHASER);
  spawnTear(room.world, { x: player.x, y: player.y, dir: { x: 1, y: 0 }, stats: { shotSpeed: 1, damage: 1, range: 5 }, team: 'enemy', ownerDefId: 'core:turret' });
  resolveCombat(room.world, { player, playerHealth: health, events, rng: new Rng('x') });
  assert.equal(health.red, 6);
});

test('playerBlinkAlpha alternates faint/solid while invulnerable, never reaches 0, and is 1 otherwise', () => {
  assert.equal(playerBlinkAlpha(0), 1);
  const seen = new Set();
  for (let f = CONFIG.INVULN_FRAMES; f > 0; f--) {
    const a = playerBlinkAlpha(f / CONFIG.TICK_RATE);
    assert.ok(a > 0 && a <= 1, `alpha ${a} out of range`);
    seen.add(a);
  }
  assert.deepEqual([...seen].sort(), [0.3, 1]);
});

test('invulnerable player renders blinking (alpha < 1 at times, always > 0) and alpha is restored afterwards', () => {
  const { room, player } = setup(CHASER);
  const camera = new Camera({ viewportWidth: 640, viewportHeight: 360 });
  camera.centerOn(260, 140);
  const health = new Health({ redMax: 6 });
  applyDamage(health, 1);
  const alphas = new Set();
  for (let f = 0; f < CONFIG.INVULN_FRAMES; f++) {
    const ctx = createMockCtx();
    renderRoom(ctx, { room, camera, playerHealth: health, particles: new ParticlePool(), decals: new DecalLayer(), dt: DT });
    const s = camera.worldToScreen(player.x, player.y);
    const calls = ctx.calls.filter((c) => c.kind === 'arc' && Math.abs(c.x - s.x) < 1 && Math.abs(c.y - s.y) < 20);
    assert.ok(calls.length > 0, 'player must draw every frame of the blink');
    for (const c of calls) {
      assert.ok(c.alpha > 0);
      alphas.add(c.alpha);
    }
    assert.equal(ctx.globalAlpha, 1, 'globalAlpha must be restored after drawing');
    tickInvuln(health, DT);
  }
  assert.ok(alphas.has(1) && [...alphas].some((a) => a < 1), 'expected both faint and solid frames');
});

function channels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('enemy projectiles are hot red/orange with a dark outline and visibly different from player tears', () => {
  const enemy = SPRITES.enemyTear;
  const player = SPRITES.tear;
  const body = channels(enemy.fill);
  assert.ok(body.r > 220 && body.g < 120 && body.b < 60, `enemy tear body ${enemy.fill} must be bright red/orange`);
  assert.ok(luminance(channels(enemy.outline)) < 40, 'enemy tear outline must be dark');
  assert.ok(enemy.outlineWidth >= 2, 'enemy tear outline must be thick enough to read');
  const pBody = channels(player.fill);
  assert.ok(pBody.b > pBody.r, 'player tears stay cool/blue');
  assert.notEqual(enemy.fill, player.fill);
  const ops = computeSpriteDrawOps(enemy);
  assert.ok(ops.length >= 3, 'enemy tear has glow + body + core');
});

test('the renderer draws enemy tears and player tears with different colors', () => {
  const room = new Room({ doorSides: ['north', 'south'] });
  const camera = new Camera({ viewportWidth: 640, viewportHeight: 360 });
  camera.centerOn(260, 140);
  spawnTear(room.world, { x: 200, y: 140, dir: { x: 1, y: 0 }, stats: new Stats(), team: 'player' });
  spawnTear(room.world, { x: 300, y: 140, dir: { x: 1, y: 0 }, stats: new Stats(), team: 'enemy' });
  const ctx = createMockCtx();
  renderRoom(ctx, { room, camera, playerHealth: new Health({ redMax: 6 }), particles: new ParticlePool(), decals: new DecalLayer(), dt: DT });
  const fillAt = (wx) => {
    const s = camera.worldToScreen(wx, 140);
    const idx = ctx.calls.findIndex((c) => c.kind === 'arc' && Math.abs(c.x - s.x) < 1);
    // The fill color is the fillStyle recorded on the following 'fill' call.
    return ctx.calls.slice(idx).find((c) => c.kind === 'fill')?.fillStyle;
  };
  assert.notEqual(fillAt(200), fillAt(300));
});

test('an enemy shot that kills the player is attributed to the enemy that fired it', async () => {
  const { registries } = await loadRealRegistries();
  const turretDef = registries.of('enemy').get('core:turret');
  const room = new Room({ doorSides: ['north', 'south'] });
  const player = createPlayer(room.world, { x: 100, y: 140, stats: new Stats() });
  const turret = spawnEnemy(room.world, { ...turretDef, fireCooldownSeconds: 0.01 }, { x: 300, y: 140 });
  const health = new Health({ redMax: 1 });
  const events = createEventBus();
  let deathSource = null;
  events.on('health:death', ({ source }) => { deathSource = source; });
  const rng = new Rng('kill');
  for (let i = 0; i < 600 && health.alive; i++) {
    updateEnemies(room.world, player, DT, { events, rng });
    updateProjectiles(room.world, DT, events);
    resolveCombat(room.world, { player, playerHealth: health, events, rng });
    tickInvuln(health, DT);
  }
  assert.ok(!health.alive, 'turret should have killed a 1-half-heart player');
  assert.equal(deathSource, turret.defId);
  assert.equal(describeDeathCause(deathSource, { getEnemyDef: (id) => registries.of('enemy').get(id) }), turretDef.name);
});

test('describeDeathCause resolves enemies, bosses and hazards with safe fallbacks', () => {
  const lookups = {
    getEnemyDef: (id) => (id === 'e1' ? { name: 'Gnasher' } : undefined),
    getBossDef: (id) => (id === 'b1' ? { name: 'The Maw' } : undefined),
  };
  assert.equal(describeDeathCause('e1', lookups), 'Gnasher');
  assert.equal(describeDeathCause('b1', lookups), 'The Maw');
  assert.equal(describeDeathCause('bomb', lookups), 'Your own bomb');
  assert.equal(describeDeathCause('mystery', lookups), 'Unknown causes');
  assert.equal(describeDeathCause(undefined, lookups), 'Unknown causes');
});

test('the death screen says "Killed by <name>"', () => {
  const ctx = createMockCtx();
  drawDeathScreen(ctx, { width: 640, height: 360, stats: { floorsCleared: 0, kills: 0, coins: 0, elapsedSeconds: 7.5, killedBy: 'The Maw' } });
  assert.ok(ctx.calls.some((c) => c.kind === 'fillText' && c.text === 'Killed by The Maw'));
});
