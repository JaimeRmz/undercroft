/**
 * Render audit: every registered entity type must actually produce canvas draw
 * calls. Guards against the "entity exists in the sim but is invisible" class
 * of bug (e.g. enemies with no sprite spec, pickup types the renderer skips).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/systems/room.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { spawnBoss } from '../src/systems/bosses.js';
import { spawnTear } from '../src/systems/projectiles.js';
import { placeBomb } from '../src/systems/bombs.js';
import { spawnPickup, PICKUP_TYPE } from '../src/systems/pickups.js';
import { spawnItemPedestal } from '../src/systems/items.js';
import { spawnTrinketPickup } from '../src/systems/trinkets.js';
import { spawnCardPickup, spawnPillPickup } from '../src/systems/consumables.js';
import { spawnShopItem } from '../src/systems/shop.js';
import { spawnTrapdoor } from '../src/systems/bosses.js';
import { Camera } from '../src/render/camera.js';
import { ParticlePool } from '../src/render/particles.js';
import { DecalLayer } from '../src/render/decals.js';
import { renderRoom } from '../src/render/renderer.js';
import { Health } from '../src/systems/health.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';
import { loadRealRegistries } from './helpers/realContent.mjs';

const CX = 260;
const CY = 140;

function renderCount(room, player, camera, { health = new Health({ redMax: 6 }), ...defGetters } = {}) {
  const ctx = createMockCtx(640, 360);
  renderRoom(ctx, { room, camera, playerHealth: health, particles: new ParticlePool(), decals: new DecalLayer(), dt: 1 / 60, ...defGetters });
  return ctx;
}

function freshRoom() {
  const room = new Room({ doorSides: ['north', 'south', 'east', 'west'] });
  const camera = new Camera({ viewportWidth: 640, viewportHeight: 360 });
  camera.centerOn(CX, CY);
  return { room, camera };
}

/** Draw-call delta between a room with and without the spawned entity (player kept out of the way). */
function visibleDelta(spawn, defGetters) {
  const baseline = freshRoom();
  const baseCalls = renderCount(baseline.room, null, baseline.camera, defGetters).calls.length;
  const { room, camera } = freshRoom();
  const entity = spawn(room.world);
  assert.ok(entity, 'spawn helper must return the entity');
  const ctx = renderCount(room, null, camera, defGetters);
  return { delta: ctx.calls.length - baseCalls, ctx, entity, camera };
}

test('the player produces draw calls', () => {
  const { delta } = visibleDelta((w) => createPlayer(w, { x: CX, y: CY, stats: new Stats() }));
  assert.ok(delta > 0);
});

test('every registered enemy produces draw calls at the right screen position', async () => {
  const { registries } = await loadRealRegistries();
  const defs = registries.of('enemy').all();
  assert.ok(defs.length >= 16);
  for (const def of defs) {
    const { delta, ctx, camera, entity } = visibleDelta((w) => spawnEnemy(w, def, { x: CX, y: CY }));
    assert.ok(delta > 0, `${def.id} produced no draw calls`);
    const s = camera.worldToScreen(entity.x, entity.y);
    assert.ok(ctx.calls.some((c) => c.kind === 'arc' || c.kind === 'fillRect' ? Math.abs(c.x - s.x) < entity.radius + 2 && Math.abs(c.y - s.y) < entity.radius + 2 : false), `${def.id} not drawn near its position`);
  }
});

test('every registered boss produces draw calls', async () => {
  const { registries } = await loadRealRegistries();
  for (const def of registries.of('boss').all()) {
    const { delta } = visibleDelta((w) => spawnBoss(w, def, { x: CX, y: CY, stage: 1 }));
    assert.ok(delta > 0, `${def.id} produced no draw calls`);
  }
});

test('champions still draw', async () => {
  const { registries } = await loadRealRegistries();
  const def = { ...registries.of('enemy').all()[0], forceChampion: 'faster' };
  const { delta } = visibleDelta((w) => spawnEnemy(w, def, { x: CX, y: CY }));
  assert.ok(delta > 0);
});

test('player tears and enemy tears produce draw calls', () => {
  for (const team of ['player', 'enemy']) {
    const { delta } = visibleDelta((w) => spawnTear(w, { x: CX, y: CY, dir: { x: 1, y: 0 }, stats: new Stats(), team }));
    assert.ok(delta > 0, `${team} tear produced no draw calls`);
  }
});

test('bombs produce draw calls', () => {
  const { delta } = visibleDelta((w) => placeBomb(w, { x: CX, y: CY }));
  assert.ok(delta > 0);
});

test('every pickup type produces draw calls', () => {
  for (const type of Object.values(PICKUP_TYPE)) {
    const { delta } = visibleDelta((w) => spawnPickup(w, type, { x: CX, y: CY, value: 1 }));
    assert.ok(delta > 0, `pickup ${type} produced no draw calls`);
  }
});

test('every registered trinket, card and pill color pickup produces draw calls', async () => {
  const { registries } = await loadRealRegistries();
  const getTrinketDef = (id) => registries.of('trinket').get(id);
  const getCardDef = (id) => registries.of('card').get(id);
  for (const trinket of registries.of('trinket').all()) {
    assert.ok(visibleDelta((w) => spawnTrinketPickup(w, trinket.id, { x: CX, y: CY }), { getTrinketDef }).delta > 0, `${trinket.id} trinket pickup invisible`);
  }
  for (const card of registries.of('card').all()) {
    assert.ok(visibleDelta((w) => spawnCardPickup(w, card.id, { x: CX, y: CY }), { getCardDef }).delta > 0, `${card.id} card pickup invisible`);
  }
  for (const pill of registries.of('pill').all()) {
    assert.ok(visibleDelta((w) => spawnPillPickup(w, 'red', { x: CX, y: CY })).delta > 0, `${pill.id} pill pickup invisible`);
  }
});

test('every registered item\'s pedestal and shop slot produce draw calls', async () => {
  const { registries } = await loadRealRegistries();
  const getItemDef = (id) => registries.of('item').get(id);
  for (const item of registries.of('item').all()) {
    assert.ok(visibleDelta((w) => spawnItemPedestal(w, item.id, { x: CX, y: CY }), { getItemDef }).delta > 0, `${item.id} pedestal invisible`);
    assert.ok(visibleDelta((w) => spawnShopItem(w, { x: CX, y: CY, kind: 'item', itemId: item.id, price: 15 }), { getItemDef }).delta > 0, `${item.id} shop item invisible`);
  }
  for (const pickupType of ['key', 'bomb', 'battery', 'heart_full']) {
    assert.ok(visibleDelta((w) => spawnShopItem(w, { x: CX, y: CY, kind: 'pickup', pickupType, price: 3 })).delta > 0, `shop pickup ${pickupType} invisible`);
  }
  assert.ok(visibleDelta((w) => spawnTrapdoor(w, { x: CX, y: CY })).delta > 0, 'trapdoor invisible');
});
