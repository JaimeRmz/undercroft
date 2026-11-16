import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { ItemInventory } from '../src/systems/items.js';
import { Currency } from '../src/systems/pickups.js';
import { createCharacterHealth, applyCharacterStartingLoadout } from '../src/systems/characters.js';

const BASELINE_DEF = { id: 'test:baseline', name: 'Baseline', redMax: 6 };
const SOUL_ONLY_DEF = { id: 'test:soul-only', name: 'Soul Only', redMax: 0, soulHearts: 4, statDeltas: [{ stat: 'luck', value: 1 }] };
const LASER_DEF = { id: 'test:laser', name: 'Laser', redMax: 4, weaponType: 'laser' };
const COIN_DEALS_DEF = { id: 'test:broker', name: 'Broker', redMax: 6, paysDealsWithCoins: true, startingCoins: 15 };
const FAMILIAR_DEF = { id: 'test:tethered', name: 'Tethered', redMax: 6, startingFamiliar: 'test:ember' };
const ITEM_DEF = { id: 'test:item-01', type: 'passive', effects: [{ stat: 'speed', value: 0.1 }] };
const FAMILIAR_CONTENT_DEF = { id: 'test:ember', name: 'Ember', behavior: 'orbit', radius: 6, damage: 1, orbitRadius: 30, orbitSpeed: 4 };

test('createCharacterHealth builds red containers from redMax (halves), defaulting to 6', () => {
  assert.equal(createCharacterHealth(BASELINE_DEF).redMax, 6);
  assert.equal(createCharacterHealth({}).redMax, 6);
});

test('createCharacterHealth grants a soul-hearts-only character redMax 0 and starting soul hearts', () => {
  const health = createCharacterHealth(SOUL_ONLY_DEF);
  assert.equal(health.redMax, 0);
  assert.equal(health.red, 0);
  assert.equal(health.extra.filter((h) => h.type === 'soul').length, 4);
});

test('createCharacterHealth grants starting black hearts when the def carries blackHearts', () => {
  const health = createCharacterHealth({ redMax: 6, blackHearts: 2 });
  assert.equal(health.extra.filter((h) => h.type === 'black').length, 2);
});

test('applyCharacterStartingLoadout applies stat deltas (soul-hearts-only character also gets +luck)', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const stats = player.stats;
  applyCharacterStartingLoadout(SOUL_ONLY_DEF, {
    player,
    stats,
    playerHealth: createCharacterHealth(SOUL_ONLY_DEF),
    inventory: new ItemInventory(),
    currency: new Currency(),
    world,
    getItemDef: () => null,
    getFamiliarDef: () => null,
  });
  assert.equal(stats.luck, 1);
});

test('applyCharacterStartingLoadout overrides the weapon type for a unique-weapon character', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  applyCharacterStartingLoadout(LASER_DEF, {
    player,
    stats: player.stats,
    playerHealth: createCharacterHealth(LASER_DEF),
    inventory: new ItemInventory(),
    currency: new Currency(),
    world,
    getItemDef: () => null,
    getFamiliarDef: () => null,
  });
  assert.equal(player.weaponType, 'laser');
});

test('applyCharacterStartingLoadout sets paysDealsWithCoins and grants starting coins', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const currency = new Currency();
  applyCharacterStartingLoadout(COIN_DEALS_DEF, {
    player,
    stats: player.stats,
    playerHealth: createCharacterHealth(COIN_DEALS_DEF),
    inventory: new ItemInventory(),
    currency,
    world,
    getItemDef: () => null,
    getFamiliarDef: () => null,
  });
  assert.equal(player.paysDealsWithCoins, true);
  assert.equal(currency.coins, 15);
});

test('applyCharacterStartingLoadout picks up real starting items through the pickUpItem pipeline', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const inventory = new ItemInventory();
  applyCharacterStartingLoadout({ id: 'test:item-holder', redMax: 6, startingItems: ['test:item-01'] }, {
    player,
    stats: player.stats,
    playerHealth: createCharacterHealth({ redMax: 6 }),
    inventory,
    currency: new Currency(),
    world,
    getItemDef: (id) => (id === 'test:item-01' ? ITEM_DEF : null),
    getFamiliarDef: () => null,
  });
  assert.ok(inventory.passives.includes('test:item-01'));
});

test('applyCharacterStartingLoadout spawns a starting familiar', () => {
  const world = new World();
  const player = createPlayer(world, { x: 50, y: 60, stats: new Stats() });
  applyCharacterStartingLoadout(FAMILIAR_DEF, {
    player,
    stats: player.stats,
    playerHealth: createCharacterHealth(FAMILIAR_DEF),
    inventory: new ItemInventory(),
    currency: new Currency(),
    world,
    getItemDef: () => null,
    getFamiliarDef: (id) => (id === 'test:ember' ? FAMILIAR_CONTENT_DEF : null),
  });
  assert.equal(world.entities.byType('familiar').length, 1);
});

test('a character def with none of the optional fields leaves the player at defaults (baseline character)', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const currency = new Currency();
  applyCharacterStartingLoadout(BASELINE_DEF, {
    player,
    stats: player.stats,
    playerHealth: createCharacterHealth(BASELINE_DEF),
    inventory: new ItemInventory(),
    currency,
    world,
    getItemDef: () => null,
    getFamiliarDef: () => null,
  });
  assert.equal(player.weaponType, 'normal');
  assert.equal(player.paysDealsWithCoins, undefined);
  assert.equal(currency.coins, 0);
});
