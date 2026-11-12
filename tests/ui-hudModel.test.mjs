import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHudModel, computeStatRows, computeActiveSlot, wrapLabel } from '../src/ui/hudModel.js';
import { drawHudPanels, drawFloorBanner } from '../src/ui/hudPanels.js';
import { ROOM_RECT, isOutsideRoom } from '../src/ui/layout.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { Currency } from '../src/systems/pickups.js';
import { ItemInventory } from '../src/systems/items.js';
import { TrinketInventory } from '../src/systems/trinkets.js';
import { ConsumableInventory } from '../src/systems/consumables.js';
import { PillIdentity } from '../src/systems/pills.js';
import { Rng } from '../src/core/rng.js';
import { createMockCtx } from './helpers/mockCanvas.mjs';

function makeModel({ withLoadout = true } = {}) {
  const inventory = new ItemInventory();
  const trinketInventory = new TrinketInventory();
  const consumableInventory = new ConsumableInventory();
  if (withLoadout) {
    inventory.actives.push({ id: 'core:zap', charge: 2, maxCharges: 3 });
    trinketInventory.current = { name: 'Lucky Splinter' };
    consumableInventory.current = { kind: 'card', cardId: 'core:rune-of-ash' };
  }
  return computeHudModel({
    playerHealth: new Health({ redMax: 6 }),
    currency: new Currency({ coins: 7, bombs: 2, keys: 1 }),
    stats: new Stats(),
    inventory,
    trinketInventory,
    consumableInventory,
    getItemDef: (id) => ({ id, name: 'Zap Rod' }),
    getCardDef: (id) => ({ id, name: 'Rune of Ash' }),
    getPillDef: () => null,
    pillIdentity: new PillIdentity(['a', 'b'], new Rng('p')),
  });
}

test('stat rows show damage, tears, speed, range, shot speed and luck with formatted values', () => {
  const rows = computeStatRows(new Stats());
  assert.deepEqual(rows.map((r) => r.label), ['DMG', 'TEARS', 'SPEED', 'RANGE', 'SHOT', 'LUCK']);
  assert.equal(rows[0].value, '3.50');
  assert.equal(rows[2].value, '1.00');
  assert.equal(rows[5].value, '0.00');
  const t = Number(rows[1].value);
  assert.ok(t > 2 && t < 3.5, `base fire rate ${t} should be ~2.7 shots/s`);
});

test('stat rows track stat changes', () => {
  const s = new Stats();
  s.damageUps = 3;
  s.luck = 2;
  const rows = computeStatRows(s);
  assert.ok(Number(rows[0].value) > 3.5);
  assert.equal(rows[5].value, '2.00');
});

test('active slot reports charge state and readiness', () => {
  const inv = new ItemInventory();
  assert.equal(computeActiveSlot(inv, () => null), null);
  inv.actives.push({ id: 'x', charge: 3, maxCharges: 3 });
  assert.equal(computeActiveSlot(inv, () => ({ name: 'X' })).ready, true);
  inv.actives[0].charge = 1;
  assert.equal(computeActiveSlot(inv, () => ({ name: 'X' })).ready, false);
});

test('wrapLabel wraps on words and ellipsizes overflow', () => {
  assert.deepEqual(wrapLabel('Rune of Ash', 11, 2), ['Rune of Ash']);
  assert.deepEqual(wrapLabel('Weeping Nettle Bundle', 11, 2), ['Weeping', 'Nettle…']);
  assert.ok(wrapLabel('Supercalifragilistic', 8, 2)[0].length <= 8);
});

test('model carries counters, trinket and consumable names', () => {
  const m = makeModel();
  assert.deepEqual(m.counters.map((c) => [c.kind, c.value]), [['coin', 7], ['bomb', 2], ['key', 1]]);
  assert.equal(m.trinket, 'Lucky Splinter');
  assert.equal(m.consumable, 'Rune of Ash');
  assert.equal(m.active.name, 'Zap Rod');
  const empty = makeModel({ withLoadout: false });
  assert.equal(empty.trinket, null);
  assert.equal(empty.consumable, null);
  assert.equal(empty.active, null);
});

test('HUD panels draw every required element, and every HUD text/box stays outside the play area', () => {
  const ctx = createMockCtx();
  drawHudPanels(ctx, makeModel());
  const texts = ctx.calls.filter((c) => c.kind === 'fillText').map((c) => c.text);
  for (const needle of ['DMG', 'TEARS', 'SPEED', 'RANGE', 'SHOT', 'LUCK', '07', '02', '01', 'ACTIVE', 'TRINKET']) {
    assert.ok(texts.includes(needle), `HUD missing "${needle}" (got ${texts.join('|')})`);
  }
  assert.ok(texts.some((t) => t.includes('Rune')), 'consumable name missing');
  assert.ok(texts.some((t) => t.includes('Lucky')), 'trinket name missing');
  assert.ok(ctx.calls.filter((c) => c.kind === 'arc').length > 0, 'hearts/icons missing');
  for (const c of ctx.calls) {
    if (c.kind === 'fillText') {
      assert.ok(isOutsideRoom(c.x - 1, c.y - 4, 2, 8), `text "${c.text}" at (${c.x},${c.y}) is over the play area`);
    }
    if (c.kind === 'fillRect' || c.kind === 'strokeRect') {
      assert.ok(isOutsideRoom(c.x, c.y, c.w, c.h), `HUD rect at (${c.x},${c.y}) ${c.w}x${c.h} overlaps the play area`);
    }
    if (c.kind === 'arc') {
      assert.ok(isOutsideRoom(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2), `HUD circle at (${c.x},${c.y}) overlaps the play area`);
    }
  }
});

test('floor banner draws inside the top wall row only while its timer runs', () => {
  const ctx = createMockCtx();
  drawFloorBanner(ctx, { text: 'Hollow Cellars', subtext: 'Floor 1', timer: 0 });
  assert.equal(ctx.calls.length, 0);
  drawFloorBanner(ctx, { text: 'Hollow Cellars', subtext: 'Floor 1', timer: 2 });
  assert.ok(ctx.calls.some((c) => c.kind === 'fillText' && c.text === 'Hollow Cellars'));
  const wallRowBottom = ROOM_RECT.y + 40; // one tile row
  for (const c of ctx.calls.filter((c) => c.kind === 'fillRect' || c.kind === 'fillText')) {
    assert.ok(c.y < wallRowBottom, 'banner must stay in the top wall row');
  }
});
