import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { ItemInventory, ItemPools } from '../src/systems/items.js';
import { PICKUP_TYPE, Currency } from '../src/systems/pickups.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';
import { spawnShopItem, stockShop, resolveShopPurchases, priceForItem } from '../src/systems/shop.js';

const ITEM_A = { id: 'test:a', name: 'Test A', type: 'passive', quality: 0, effects: [{ stat: 'luck', value: 1 }] };
const ITEM_B = { id: 'test:b', name: 'Test B', type: 'passive', quality: 2, effects: [{ stat: 'speed', value: 0.1 }] };

function itemDefsById(id) {
  return { [ITEM_A.id]: ITEM_A, [ITEM_B.id]: ITEM_B }[id];
}

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('priceForItem scales with quality (CLAUDE.md §3 "quality 0-4 used by a few modifiers/balancing")', () => {
  assert.ok(priceForItem(ITEM_B) > priceForItem(ITEM_A));
});

test('stockShop fills every slot and marks exactly one as on sale at a discount', () => {
  const world = freshWorld();
  const pools = new ItemPools();
  pools.register('shop', ITEM_A.id);
  pools.register('shop', ITEM_B.id);
  const positions = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }];
  const rng = new Rng('shop-stock-1');

  const slots = stockShop(world, positions, { pools, itemDefsById, rng, itemSlots: 2 });

  assert.equal(slots.length, 3);
  const onSale = slots.filter((s) => s.onSale);
  assert.equal(onSale.length, 1, 'exactly one slot should be on sale');
  for (const slot of slots) {
    if (slot.onSale) assert.ok(slot.displayPrice < slot.price, 'sale price should be a discount off the listed price');
    else assert.equal(slot.displayPrice, slot.price);
  }
});

test('stockShop draws distinct items first, then fills remaining slots with priced pickups', () => {
  const world = freshWorld();
  const pools = new ItemPools();
  pools.register('shop', ITEM_A.id);
  const positions = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
  const rng = new Rng('shop-stock-2');

  const slots = stockShop(world, positions, { pools, itemDefsById, rng, itemSlots: 2 });

  assert.equal(slots.filter((s) => s.kind === 'item').length, 1, 'only one distinct item was available to draw');
  assert.equal(slots.filter((s) => s.kind === 'pickup').length, 1, 'remaining slot backfilled with a pickup');
});

test('resolveShopPurchases buys an affordable item: spends coins, grants the item, removes it from pools', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  const playerHealth = new Health({ redMax: 6 });
  const currency = new Currency({ coins: 50 });
  const pools = new ItemPools();
  pools.register('shop', ITEM_A.id);
  pools.register('treasure', ITEM_A.id);
  const events = createEventBus();
  let purchased = null;
  events.on('shop:purchased', (p) => (purchased = p));

  const price = priceForItem(ITEM_A);
  const slot = spawnShopItem(world, { x: 100, y: 100, kind: 'item', itemId: ITEM_A.id, price });

  resolveShopPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, pools, getItemDef: itemDefsById, events });

  assert.ok(!slot.alive, 'bought slot should be removed');
  assert.equal(currency.coins, 50 - price);
  assert.ok(inventory.passives.includes(ITEM_A.id));
  assert.equal(pools.poolSize('shop'), 0, 'bought item should be removed from every pool');
  assert.equal(pools.poolSize('treasure'), 0);
  assert.ok(purchased);
});

test('resolveShopPurchases leaves an unaffordable slot untouched', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  const playerHealth = new Health({ redMax: 6 });
  const currency = new Currency({ coins: 1 });
  const pools = new ItemPools();
  const events = createEventBus();

  const slot = spawnShopItem(world, { x: 100, y: 100, kind: 'item', itemId: ITEM_A.id, price: 15 });
  resolveShopPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, pools, getItemDef: itemDefsById, events });

  assert.ok(slot.alive, 'should not be bought without enough coins');
  assert.equal(currency.coins, 1);
  assert.equal(inventory.passives.length, 0);
});

test('resolveShopPurchases buying a pickup slot spends coins and spawns the pickup', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  const playerHealth = new Health({ redMax: 6 });
  const currency = new Currency({ coins: 10 });
  const events = createEventBus();

  const before = world.entities.byType('pickup').length;
  const slot = spawnShopItem(world, { x: 100, y: 100, kind: 'pickup', pickupType: PICKUP_TYPE.KEY, price: 3 });
  resolveShopPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, getItemDef: itemDefsById, events });

  assert.ok(!slot.alive);
  assert.equal(currency.coins, 7);
  const pickups = world.entities.byType('pickup');
  assert.equal(pickups.length, before + 1);
  assert.equal(pickups[pickups.length - 1].pickupType, PICKUP_TYPE.KEY);
});

test('an already-sold slot cannot be bought twice even if touched again', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ItemInventory();
  const playerHealth = new Health({ redMax: 6 });
  const currency = new Currency({ coins: 100 });
  const events = createEventBus();

  const slot = spawnShopItem(world, { x: 100, y: 100, kind: 'item', itemId: ITEM_A.id, price: 15 });
  resolveShopPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, getItemDef: itemDefsById, events });
  const coinsAfterFirst = currency.coins;

  slot.alive = true; // simulate the (impossible in practice) case of it still overlapping
  resolveShopPurchases(world, player, { inventory, stats: player.stats, playerHealth, currency, getItemDef: itemDefsById, events });
  assert.equal(currency.coins, coinsAfterFirst, 'sold flag should prevent a second purchase');
});
