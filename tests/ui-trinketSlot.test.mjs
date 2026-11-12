import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrinketSlotLabel } from '../src/ui/trinketSlot.js';
import { TrinketInventory, equipTrinket } from '../src/systems/trinkets.js';
import { Stats } from '../src/systems/stats.js';

test('computeTrinketSlotLabel is null for an empty slot and the trinket name once one is held', () => {
  const inventory = new TrinketInventory();
  assert.equal(computeTrinketSlotLabel(inventory), null);

  equipTrinket(inventory, new Stats(), { id: 'test:lucky', name: 'Lucky Charm', effects: [] });
  assert.equal(computeTrinketSlotLabel(inventory), 'Lucky Charm');
});
