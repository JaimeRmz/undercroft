import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { createEventBus } from '../src/core/events.js';
import { Rng } from '../src/core/rng.js';
import {
  ConsumableInventory,
  spawnCardPickup,
  spawnPillPickup,
  resolveConsumablePickups,
  useConsumableSlot,
} from '../src/systems/consumables.js';
import { PillIdentity, PILL_COLORS } from '../src/systems/pills.js';

const CARD_DEF = { id: 'test:card', name: 'Test Rune', effects: [{ type: 'coins', value: 5 }] };
const getCardDef = (id) => (id === 'test:card' ? CARD_DEF : null);
const PILL_DEF = { id: 'test:pill-eff', name: 'Test Pill', effects: [{ type: 'statPermanent', stat: 'luck', value: 2 }] };
const getPillDef = (id) => (id === 'test:pill-eff' ? PILL_DEF : null);

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('resolveConsumablePickups fills an empty slot and destroys the pickup', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const pickup = spawnCardPickup(world, 'test:card', { x: 100, y: 100 });
  const inventory = new ConsumableInventory();
  resolveConsumablePickups(world, player, { inventory, getCardDef, getPillDef, pillIdentity: new PillIdentity(['test:pill-eff'], new Rng('c')) });
  assert.ok(!pickup.alive);
  assert.deepEqual(inventory.current, { kind: 'card', cardId: 'test:card' });
});

test('resolveConsumablePickups leaves pickups alone while the slot is occupied', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const inventory = new ConsumableInventory();
  inventory.current = { kind: 'card', cardId: 'already-held' };
  const pickup = spawnCardPickup(world, 'test:card', { x: 100, y: 100 });
  resolveConsumablePickups(world, player, { inventory, getCardDef, getPillDef, pillIdentity: new PillIdentity(['test:pill-eff'], new Rng('d')) });
  assert.ok(pickup.alive, 'pickup should remain on the ground');
  assert.equal(inventory.current.cardId, 'already-held');
});

test('resolveConsumablePickups on a pill shows the un-identified display name until first use', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const identity = new PillIdentity(['test:pill-eff'], new Rng('e'));
  const color = PILL_COLORS[0];
  spawnPillPickup(world, color, { x: 100, y: 100 });
  const inventory = new ConsumableInventory();
  const events = createEventBus();
  let payload;
  events.on('item:pickup', (p) => (payload = p));

  resolveConsumablePickups(world, player, { inventory, events, getCardDef, getPillDef, pillIdentity: identity });
  assert.deepEqual(inventory.current, { kind: 'pill', pillColor: color });
  assert.equal(payload.name, `??? Pill (${color})`);
});

test('useConsumableSlot fires a held card\'s effect and empties the slot', () => {
  const inventory = new ConsumableInventory();
  inventory.current = { kind: 'card', cardId: 'test:card' };
  const currency = { coins: 0 };
  const fired = useConsumableSlot(inventory, { currency }, { getCardDef, getPillDef, pillIdentity: null });
  assert.ok(fired);
  assert.equal(currency.coins, 5);
  assert.equal(inventory.current, null);
});

test('useConsumableSlot fires a held pill\'s effect, identifies its color, and empties the slot', () => {
  const identity = new PillIdentity(['test:pill-eff'], new Rng('f'));
  const color = PILL_COLORS[0];
  const inventory = new ConsumableInventory();
  inventory.current = { kind: 'pill', pillColor: color };
  const stats = new Stats();
  const fired = useConsumableSlot(inventory, { stats }, { getCardDef, getPillDef, pillIdentity: identity });
  assert.ok(fired);
  assert.equal(stats.luck, 2);
  assert.ok(identity.isIdentified(color));
  assert.equal(inventory.current, null);
});

test('useConsumableSlot on an empty slot is a no-op and returns false', () => {
  const inventory = new ConsumableInventory();
  assert.equal(useConsumableSlot(inventory, {}, { getCardDef, getPillDef, pillIdentity: null }), false);
});
