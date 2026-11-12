import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { createEventBus } from '../src/core/events.js';
import { PillIdentity, PILL_COLORS, pillDisplayName, usePill } from '../src/systems/pills.js';

const EFFECT_IDS = ['eff-a', 'eff-b', 'eff-c'];
const DEFS = {
  'eff-a': { id: 'eff-a', name: 'Speed Up', effects: [{ type: 'statPermanent', stat: 'speed', value: 0.3 }] },
  'eff-b': { id: 'eff-b', name: 'Damage Down', effects: [{ type: 'statPermanent', stat: 'damageUps', value: -1 }] },
  'eff-c': { id: 'eff-c', name: 'Wealth', effects: [{ type: 'coins', value: 10 }] },
};
const getPillDef = (id) => DEFS[id];

test('PillIdentity assigns every color an effect id from the given list, shuffled per-run', () => {
  const identity = new PillIdentity(EFFECT_IDS, new Rng('pill-identity-1'));
  for (const color of PILL_COLORS) {
    assert.ok(EFFECT_IDS.includes(identity.effectIdForColor(color)));
  }
  const identityB = new PillIdentity(EFFECT_IDS, new Rng('pill-identity-2'));
  const sameMapping = PILL_COLORS.every((c) => identity.effectIdForColor(c) === identityB.effectIdForColor(c));
  assert.ok(!sameMapping, 'different seeds should (almost always) produce different mappings');
});

test('pillDisplayName hides the effect until that color is identified', () => {
  const identity = new PillIdentity(EFFECT_IDS, new Rng('pill-display'));
  const color = PILL_COLORS[0];
  assert.equal(pillDisplayName(color, identity, getPillDef), `??? Pill (${color})`);

  identity.identify(color);
  const expectedName = DEFS[identity.effectIdForColor(color)].name;
  assert.equal(pillDisplayName(color, identity, getPillDef), expectedName);
});

test('usePill applies the mapped effect, identifies the color, and emits pill:used', () => {
  const identity = new PillIdentity(EFFECT_IDS, new Rng('pill-use'));
  const world = new World({ widthTiles: 20, heightTiles: 20, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  const events = createEventBus();
  let payload;
  events.on('pill:used', (p) => (payload = p));

  const color = PILL_COLORS[0];
  const expectedDef = DEFS[identity.effectIdForColor(color)];
  const [{ stat, value }] = expectedDef.effects;
  const before = player.stats[stat];

  const used = usePill(color, identity, getPillDef, { stats: player.stats, playerHealth, events });
  assert.equal(used, expectedDef);
  assert.ok(identity.isIdentified(color));
  assert.equal(payload.name, expectedDef.name);
  if (stat) assert.ok(Math.abs(player.stats[stat] - (before + value)) < 1e-9);
});

test('usePill still identifies the color even if the mapped effect id has no matching def', () => {
  const identity = new PillIdentity(['missing-id'], new Rng('pill-missing'));
  const color = PILL_COLORS[0];
  const result = usePill(color, identity, () => null, {});
  assert.equal(result, null);
  assert.ok(identity.isIdentified(color));
});
