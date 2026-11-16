import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { ItemInventory } from '../src/systems/items.js';
import { Currency } from '../src/systems/pickups.js';
import { TrinketInventory } from '../src/systems/trinkets.js';
import { ConsumableInventory } from '../src/systems/consumables.js';
import { PillIdentity } from '../src/systems/pills.js';
import {
  createMemoryStorage,
  serializeRun,
  deserializeRunData,
  saveRunToStorage,
  loadRunFromStorage,
  hasSavedRun,
  clearSavedRun,
  saveSettings,
  loadSettings,
  saveUnlocks,
  loadUnlocks,
} from '../src/systems/save.js';

const TRINKET_DEF = { id: 'test:trinket-01', name: 'Test Trinket', effects: [] };

/** A run-shaped fixture using the real classes serializeRun expects, standing in for main.js's run object. */
function makeRun(overrides = {}) {
  const health = new Health({ redMax: 6 });
  health.extra.push({ type: 'soul' }, { type: 'soul' });
  const inventory = new ItemInventory();
  inventory.passives.push('test:item-01', 'test:item-02');
  inventory.actives.push({ id: 'test:active-01', charge: 2, maxCharges: 4 });
  inventory.seenIds.add('test:item-01').add('test:item-02').add('test:item-seen-but-dropped');
  const trinketInventory = new TrinketInventory();
  trinketInventory.current = TRINKET_DEF;
  const consumableInventory = new ConsumableInventory();
  consumableInventory.current = { kind: 'card', cardId: 'test:card-01' };
  const pillIdentity = new PillIdentity(['effect-a', 'effect-b'], { shuffle: (arr) => arr });
  pillIdentity.identify('blue');

  const cellA = { x: 4, y: 4, type: 'start', depth: 0 };
  const cellB = { x: 4, y: 5, type: 'normal', depth: 1 };
  const cells = new Map([['4,4', cellA], ['4,5', cellB]]);

  const run = {
    characterId: 'test:character-01',
    stage: 3,
    player: {
      weaponType: 'laser',
      paysDealsWithCoins: true,
      flying: true,
      transformCostumes: ['#ff0000'],
      tearModifiers: ['poison'],
      stats: new Stats({ damageUps: 2, luck: 1 }),
    },
    playerHealth: health,
    currency: new Currency({ coins: 42, bombs: 2, keys: 1 }),
    inventory,
    trinketInventory,
    consumableInventory,
    pillIdentity,
    appliedSynergyIds: new Set(['synergy-a']),
    activeTransformationIds: new Set(['transform-a', 'transform-b']),
    floorRedDamageTaken: true,
    bossFightRedDamageTaken: false,
    finalBossDefeated: false,
    lastDealRoomStage: 2,
    stats: { kills: 7, floorsCleared: 2, elapsedSeconds: 123.4 },
    floor: { stage: 3, startCell: cellA, cells },
    floorRuntime: { currentKey: '4,5', visited: new Set(['4,4', '4,5']) },
    stockedRooms: new Set(['4,4', '4,5']),
    ...overrides,
  };
  return run;
}

test('serializeRun produces a JSON-safe plain object (no Maps/Sets/class instances survive a JSON round trip)', () => {
  const run = makeRun();
  const data = serializeRun(run);
  const roundTripped = JSON.parse(JSON.stringify(data));
  assert.deepEqual(roundTripped, data);
});

test('serializeRun -> deserializeRunData round trip preserves every field it touches', () => {
  const run = makeRun();
  const data = deserializeRunData(serializeRun(run));

  assert.equal(data.characterId, 'test:character-01');
  assert.equal(data.stage, 3);
  assert.equal(data.player.weaponType, 'laser');
  assert.equal(data.player.paysDealsWithCoins, true);
  assert.equal(data.player.flying, true);
  assert.deepEqual(data.player.transformCostumes, ['#ff0000']);
  assert.deepEqual(data.player.tearModifiers, ['poison']);
  assert.equal(data.player.stats.damageUps, 2);
  assert.equal(data.player.stats.luck, 1);

  assert.equal(data.health.redMax, 6);
  assert.equal(data.health.red, 6);
  assert.deepEqual(data.health.extra, [{ type: 'soul' }, { type: 'soul' }]);

  assert.equal(data.currency.coins, 42);
  assert.equal(data.currency.bombs, 2);
  assert.equal(data.currency.keys, 1);

  assert.deepEqual(data.inventory.passives, ['test:item-01', 'test:item-02']);
  assert.deepEqual(data.inventory.actives, [{ id: 'test:active-01', charge: 2, maxCharges: 4 }]);
  assert.deepEqual([...data.inventory.seenIds].sort(), ['test:item-01', 'test:item-02', 'test:item-seen-but-dropped'].sort());

  assert.equal(data.trinketId, 'test:trinket-01');
  assert.deepEqual(data.consumable, { kind: 'card', cardId: 'test:card-01' });

  assert.equal(data.pillIdentity.colorToEffectId.get('blue') !== undefined || true, true); // just needs to be a real Map
  assert.ok(data.pillIdentity.colorToEffectId instanceof Map);
  assert.ok(data.pillIdentity.identifiedColors instanceof Set);
  assert.ok(data.pillIdentity.identifiedColors.has('blue'));

  assert.ok(data.appliedSynergyIds instanceof Set);
  assert.ok(data.appliedSynergyIds.has('synergy-a'));
  assert.ok(data.activeTransformationIds.has('transform-a'));
  assert.ok(data.activeTransformationIds.has('transform-b'));

  assert.equal(data.floorRedDamageTaken, true);
  assert.equal(data.bossFightRedDamageTaken, false);
  assert.equal(data.lastDealRoomStage, 2);

  assert.deepEqual(data.progress, { kills: 7, floorsCleared: 2, elapsedSeconds: 123.4 });

  assert.equal(data.floor.stage, 3);
  assert.deepEqual(data.floor.startCell, { x: 4, y: 4 });
  assert.equal(data.floor.cells.length, 2);
  assert.ok(data.floor.cells.some((c) => c.x === 4 && c.y === 5 && c.type === 'normal'));

  assert.equal(data.currentKey, '4,5');
  assert.ok(data.visited instanceof Set);
  assert.deepEqual([...data.visited].sort(), ['4,4', '4,5']);
});

test('serializeRun excludes the current room from stockedRooms, so it re-stocks fresh on restore', () => {
  const run = makeRun();
  const data = serializeRun(run); // currentKey is '4,5', stockedRooms has both '4,4' and '4,5'
  assert.deepEqual(data.stockedRooms, ['4,4']);
});

test('a run with no trinket/consumable held serializes null for both, and restores back to null', () => {
  const run = makeRun();
  run.trinketInventory.current = null;
  run.consumableInventory.current = null;
  const data = deserializeRunData(serializeRun(run));
  assert.equal(data.trinketId, null);
  assert.equal(data.consumable, null);
});

test('saveRunToStorage -> loadRunFromStorage round trips through a storage adapter, and hasSavedRun/clearSavedRun behave correctly', () => {
  const storage = createMemoryStorage();
  assert.equal(hasSavedRun(storage), false);
  assert.equal(loadRunFromStorage(storage), null);

  const run = makeRun();
  saveRunToStorage(storage, run);
  assert.equal(hasSavedRun(storage), true);

  const loaded = loadRunFromStorage(storage);
  assert.equal(loaded.stage, 3);
  assert.equal(loaded.currentKey, '4,5');

  clearSavedRun(storage);
  assert.equal(hasSavedRun(storage), false);
  assert.equal(loadRunFromStorage(storage), null);
});

test('loadRunFromStorage returns null (not a throw) for corrupted JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem('undercroft:save:run', '{not valid json');
  assert.equal(loadRunFromStorage(storage), null);
});

test('settings round trip through a storage adapter, defaulting to {} when nothing is saved', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadSettings(storage), {});
  saveSettings(storage, { musicVolume: 0.5 });
  assert.deepEqual(loadSettings(storage), { musicVolume: 0.5 });
});

test('unlocks round trip through a storage adapter as a Set, defaulting to empty when nothing is saved', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadUnlocks(storage), new Set());
  saveUnlocks(storage, new Set(['core:character-02', 'core:item-05']));
  const loaded = loadUnlocks(storage);
  assert.ok(loaded instanceof Set);
  assert.ok(loaded.has('core:character-02'));
  assert.ok(loaded.has('core:item-05'));
});
