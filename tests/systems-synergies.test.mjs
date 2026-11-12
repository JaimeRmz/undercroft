import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItemInventory } from '../src/systems/items.js';
import { checkSynergies } from '../src/systems/synergies.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';

function setup() {
  return { inventory: new ItemInventory(), stats: new Stats(), playerHealth: new Health({ redMax: 6 }), appliedIds: new Set() };
}

test('a synergy rule does not fire until every required item is held', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { statBonus: [{ stat: 'flatDamage', value: 5 }] } }];
  inventory.passives.push('a');

  let fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, []);
  assert.equal(stats.flatDamage, 0);

  inventory.passives.push('b');
  fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, ['rule-1']);
  assert.equal(stats.flatDamage, 5);
});

test('a synergy rule only applies its bonus once even when checked again on later frames', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { statBonus: [{ stat: 'flatDamage', value: 5 }] } }];
  inventory.passives.push('a', 'b');

  checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  const fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, [], 'already-applied rule should not fire again');
  assert.equal(stats.flatDamage, 5, 'bonus applied exactly once, not twice');
});

test('a synergy rule can grant red heart containers via the Health API', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { statBonus: [{ stat: 'redHeartContainers', value: 2 }] } }];
  inventory.passives.push('a', 'b');
  const before = playerHealth.redMax;

  checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.equal(playerHealth.redMax, before + 2);
});

test('a synergy rule can set the player\'s weapon type, subject to the normal priority rule', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const player = { weaponType: 'normal' };
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { weaponType: 'laser' } }];
  inventory.passives.push('a', 'b');

  checkSynergies(inventory, stats, playerHealth, player, rules, appliedIds);
  assert.equal(player.weaponType, 'laser');
});

test('a synergy rule can attach a tear modifier to every future shot', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const player = { weaponType: 'normal', tearModifiers: [] };
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { tearModifiers: ['piercing'] } }];
  inventory.passives.push('a', 'b');

  checkSynergies(inventory, stats, playerHealth, player, rules, appliedIds);
  assert.deepEqual(player.tearModifiers, ['piercing']);
});

test('requires is satisfied by active items too, not just passives', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const rules = [{ id: 'rule-1', requires: ['a', 'b'], effect: { statBonus: [{ stat: 'luck', value: 1 }] } }];
  inventory.passives.push('a');
  inventory.actives.push({ id: 'b', charge: 0, maxCharges: 3 });

  const fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, ['rule-1']);
  assert.equal(stats.luck, 1);
});

test('two independent rules can each fire once as their own requirements are met', () => {
  const { inventory, stats, playerHealth, appliedIds } = setup();
  const rules = [
    { id: 'rule-1', requires: ['a', 'b'], effect: { statBonus: [{ stat: 'luck', value: 1 }] } },
    { id: 'rule-2', requires: ['c', 'd'], effect: { statBonus: [{ stat: 'speed', value: 0.1 }] } },
  ];
  inventory.passives.push('a', 'b');

  let fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, ['rule-1']);

  inventory.passives.push('c', 'd');
  fired = checkSynergies(inventory, stats, playerHealth, null, rules, appliedIds);
  assert.deepEqual(fired, ['rule-2']);
});
