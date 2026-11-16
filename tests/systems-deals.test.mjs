import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health, addSoulHeart } from '../src/systems/health.js';
import { ItemInventory, buildItemPools } from '../src/systems/items.js';
import { Currency } from '../src/systems/pickups.js';
import { dealRoomChance, rollDealRoomType, spawnDevilItem, resolveDevilDealPurchases } from '../src/systems/deals.js';
import { priceForItem } from '../src/systems/shop.js';
import { CONFIG } from '../src/core/config.js';

const ITEM_DEF = { id: 'test:devil-item', name: 'Test Devil Item', type: 'passive', effects: [{ stat: 'luck', value: 1 }] };
const getItemDef = (id) => (id === ITEM_DEF.id ? ITEM_DEF : null);

test('dealRoomChance never rolls on floor 1, regardless of any bonus', () => {
  assert.equal(dealRoomChance({ stage: 1, noBossDamage: true, noFloorDamage: true, recentlySeen: false }), 0);
});

test('dealRoomChance adds the no-boss-damage bonus, but a perfect (no floor damage) run overrides it with the higher rate', () => {
  const base = dealRoomChance({ stage: 2, noBossDamage: false, noFloorDamage: false, recentlySeen: false });
  const withBossBonus = dealRoomChance({ stage: 2, noBossDamage: true, noFloorDamage: false, recentlySeen: false });
  const perfect = dealRoomChance({ stage: 2, noBossDamage: true, noFloorDamage: true, recentlySeen: false });
  assert.equal(base, CONFIG.DEAL_ROOM_BASE_CHANCE);
  assert.equal(withBossBonus, CONFIG.DEAL_ROOM_BASE_CHANCE + CONFIG.DEAL_ROOM_NO_BOSS_DAMAGE_BONUS);
  assert.equal(perfect, CONFIG.DEAL_ROOM_NO_FLOOR_DAMAGE_CHANCE);
});

test('dealRoomChance drops to a quarter if a deal room was seen recently', () => {
  const normal = dealRoomChance({ stage: 2, noBossDamage: true, noFloorDamage: false, recentlySeen: false });
  const recent = dealRoomChance({ stage: 2, noBossDamage: true, noFloorDamage: false, recentlySeen: true });
  assert.ok(Math.abs(recent - normal * CONFIG.DEAL_ROOM_RECENT_MULT) < 1e-9);
});

test('rollDealRoomType picks angel for a perfect floor, devil otherwise', () => {
  assert.equal(rollDealRoomType(true), 'angel');
  assert.equal(rollDealRoomType(false), 'devil');
});

test('resolveDevilDealPurchases costs 1 heart container when the player has one, and grants the item', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  const inventory = new ItemInventory();
  const pools = buildItemPools([ITEM_DEF]);
  spawnDevilItem(world, ITEM_DEF.id, { x: 0, y: 0 }); // overlapping the player

  resolveDevilDealPurchases(world, player, { inventory, stats: player.stats, playerHealth, pools, getItemDef, events: null });
  assert.equal(playerHealth.redMax, 4, 'should have cost exactly 1 heart container (2 halves)');
  assert.ok(inventory.passives.includes(ITEM_DEF.id));
  assert.equal(pools.poolSize('treasure'), 0, 'bought item should be removed from pools it belonged to'); // ITEM_DEF isn't in 'treasure' by default
});

test('resolveDevilDealPurchases costs 3 soul hearts instead when the player has no red containers left', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const playerHealth = new Health({ redMax: 0, red: 0 });
  addSoulHeart(playerHealth, 4);
  const inventory = new ItemInventory();
  const pools = buildItemPools([ITEM_DEF]);
  spawnDevilItem(world, ITEM_DEF.id, { x: 0, y: 0 });

  resolveDevilDealPurchases(world, player, { inventory, stats: player.stats, playerHealth, pools, getItemDef, events: null });
  assert.equal(playerHealth.extra.length, 1, 'should have spent exactly 3 of the 4 soul hearts');
  assert.ok(inventory.passives.includes(ITEM_DEF.id));
});

test('resolveDevilDealPurchases is a no-op (stays on its pedestal) if the player can afford neither payment', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const playerHealth = new Health({ redMax: 0, red: 0 }); // no red containers, no soul hearts either
  const inventory = new ItemInventory();
  const pools = buildItemPools([ITEM_DEF]);
  const slot = spawnDevilItem(world, ITEM_DEF.id, { x: 0, y: 0 });

  resolveDevilDealPurchases(world, player, { inventory, stats: player.stats, playerHealth, pools, getItemDef, events: null });
  assert.equal(inventory.passives.length, 0);
  assert.ok(slot.alive, 'the item should still be sitting there, unbought');
});

test('resolveDevilDealPurchases charges a paysDealsWithCoins character coins instead of hearts, and leaves hearts untouched', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  player.paysDealsWithCoins = true;
  const playerHealth = new Health({ redMax: 6 });
  const inventory = new ItemInventory();
  const currency = new Currency({ coins: 100 });
  const pools = buildItemPools([ITEM_DEF]);
  spawnDevilItem(world, ITEM_DEF.id, { x: 0, y: 0 });

  resolveDevilDealPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, pools, getItemDef, events: null });
  assert.equal(playerHealth.redMax, 6, 'a coin-paying character should never lose a heart container');
  assert.equal(currency.coins, 100 - priceForItem(ITEM_DEF));
  assert.ok(inventory.passives.includes(ITEM_DEF.id));
});

test('resolveDevilDealPurchases leaves a paysDealsWithCoins character\'s item unbought if they cannot afford the coin price', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  player.paysDealsWithCoins = true;
  const playerHealth = new Health({ redMax: 6 });
  const inventory = new ItemInventory();
  const currency = new Currency({ coins: 0 });
  const pools = buildItemPools([ITEM_DEF]);
  const slot = spawnDevilItem(world, ITEM_DEF.id, { x: 0, y: 0 });

  resolveDevilDealPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, pools, getItemDef, events: null });
  assert.equal(inventory.passives.length, 0);
  assert.ok(slot.alive);
  assert.equal(playerHealth.redMax, 6, 'should not fall back to charging hearts just because coins ran out');
});
