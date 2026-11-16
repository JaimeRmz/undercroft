import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItemInventory } from '../src/systems/items.js';
import { checkTransformations } from '../src/systems/transformations.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';

const ITEM_DEFS = new Map([
  ['a', { id: 'a', sets: ['set-x'] }],
  ['b', { id: 'b', sets: ['set-x'] }],
  ['c', { id: 'c', sets: ['set-x', 'set-y'] }],
  ['d', { id: 'd', sets: ['set-y'] }],
  ['plain', { id: 'plain' }], // no sets at all
]);
const getItemDef = (id) => ITEM_DEFS.get(id) ?? null;

function setup() {
  return { inventory: new ItemInventory(), stats: new Stats(), playerHealth: new Health({ redMax: 6 }), activeIds: new Set() };
}

test('a transformation does not activate until 3 distinct items carrying its set tag are held', () => {
  const { inventory, stats, playerHealth, activeIds } = setup();
  const defs = [{ id: 'transform-x', setTag: 'set-x', effect: { statBonus: [{ stat: 'luck', value: 5 }] } }];

  inventory.passives.push('a', 'b');
  let activated = checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  assert.deepEqual(activated, []);
  assert.equal(stats.luck, 0);

  inventory.passives.push('c'); // 3rd item carrying set-x
  activated = checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  assert.deepEqual(activated, ['transform-x']);
  assert.equal(stats.luck, 5);
});

test('a transformation only activates once even when checked again on later frames', () => {
  const { inventory, stats, playerHealth, activeIds } = setup();
  const defs = [{ id: 'transform-x', setTag: 'set-x', effect: { statBonus: [{ stat: 'luck', value: 5 }] } }];
  inventory.passives.push('a', 'b', 'c');

  checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  const activated = checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  assert.deepEqual(activated, []);
  assert.equal(stats.luck, 5, 'the bonus must not double-apply on a second check');
});

test('multiple transformations stack independently (each applies its own effect once set-tag threshold is met)', () => {
  const { inventory, stats, playerHealth, activeIds } = setup();
  const defs = [
    { id: 'transform-x', setTag: 'set-x', effect: { statBonus: [{ stat: 'luck', value: 5 }] } },
    { id: 'transform-y', setTag: 'set-y', effect: { statBonus: [{ stat: 'speed', value: 0.2 }] } },
  ];
  inventory.passives.push('a', 'b', 'c', 'd'); // c carries both set-x and set-y, d carries set-y only

  const baseSpeed = stats.speed; // Stats starts speed at CONFIG.BASE_SPEED (1.0), not 0
  const activated = checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  assert.deepEqual(new Set(activated), new Set(['transform-x'])); // set-y only has 2 distinct carriers (c, d)
  assert.equal(stats.luck, 5);
  assert.equal(stats.speed, baseSpeed, 'transform-y (set-y) should not have activated yet'); // not yet transformed
});

test('grantsFlight sets player.flying, and costumeColor appends to player.transformCostumes (stacking)', () => {
  const { inventory, stats, playerHealth, activeIds } = setup();
  const defs = [
    { id: 'transform-x', setTag: 'set-x', grantsFlight: true, costumeColor: '#111' },
    { id: 'transform-y', setTag: 'set-y', costumeColor: '#222' },
  ];
  const player = { flying: false, transformCostumes: [] };
  inventory.passives.push('a', 'b', 'c', 'd');

  checkTransformations(inventory, stats, playerHealth, player, defs, getItemDef, activeIds);
  assert.equal(player.flying, true);
  assert.deepEqual(player.transformCostumes, ['#111']);
});

test('an item with no `sets` field at all never counts toward any transformation', () => {
  const { inventory, stats, playerHealth, activeIds } = setup();
  const defs = [{ id: 'transform-x', setTag: 'set-x', effect: { statBonus: [{ stat: 'luck', value: 5 }] } }];
  inventory.passives.push('a', 'b', 'plain', 'plain'); // only 2 real set-x carriers; 'plain' has no sets field

  const activated = checkTransformations(inventory, stats, playerHealth, null, defs, getItemDef, activeIds);
  assert.deepEqual(activated, []);
});
