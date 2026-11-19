/**
 * P2.Q Q4a: chapter-1 enemies get a tailored, distinct design (mouth + body),
 * an idle breathe, and a death color keyed to the enemy's body.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designOpsFor, hasTailoredDesign } from '../src/render/enemyDesigns.js';
import { resolveEnemySpec, enemyBodyColor } from '../src/render/sprites.js';
import { updateIdleBreath, idleBreathScale } from '../src/render/vfx.js';

const CHAPTER1_IDS = [
  'core:chaser', 'core:drifter', 'core:charger', 'core:erratic-flier',
  'core:hopper', 'core:rattler', 'core:turret', 'core:wraith',
];

test('every chapter-1 enemy has a tailored design with mouth ops (P2.Q Q4a)', () => {
  for (const id of CHAPTER1_IDS) {
    assert.ok(hasTailoredDesign(id), `${id} should be tailored`);
    const ops = designOpsFor(id, { radius: 14 });
    assert.ok(ops.length > 0, `${id} should contribute facial ops`);
  }
});

test('an untailored enemy id gets no facial ops (unchanged) (P2.Q Q4a)', () => {
  assert.equal(hasTailoredDesign('core:some-chapter-4-thing'), false);
  assert.deepEqual(designOpsFor('core:some-chapter-4-thing', { radius: 14 }), []);
});

test('the chapter-1 mouths are not all identical (distinct personalities) (P2.Q Q4a)', () => {
  const prints = CHAPTER1_IDS.map((id) => JSON.stringify(designOpsFor(id, { radius: 14 })));
  // The 8 enemies map to several mouth styles; at least 4 distinct shapes.
  assert.ok(new Set(prints).size >= 4, 'chapter-1 enemies should show a variety of mouths');
});

test("resolveEnemySpec folds the design ops into a chapter-1 enemy's accessories (P2.Q Q4a)", () => {
  const spec = resolveEnemySpec({ defId: 'core:chaser', radius: 14 });
  assert.ok((spec.accessories?.length ?? 0) > 0);
});

test('enemyBodyColor is stable per enemy and differs across enemies (P2.Q Q4a)', () => {
  const a = enemyBodyColor({ defId: 'core:drifter' });
  const b = enemyBodyColor({ defId: 'core:rattler' });
  assert.equal(a, enemyBodyColor({ defId: 'core:drifter' }), 'stable for the same id');
  assert.notEqual(a, b, 'different enemies get different death colors');
});

test('idle breathing oscillates a scale around 1 (P2.Q Q4a)', () => {
  const e = { id: 3 };
  const samples = [];
  for (let i = 0; i < 40; i++) {
    updateIdleBreath(e, 0.05);
    samples.push(idleBreathScale(e).y);
  }
  assert.ok(Math.max(...samples) > 1, 'breathes taller than rest');
  assert.ok(Math.min(...samples) < 1, 'breathes shorter than rest');
  // Area-preserving-ish: x and y move opposite directions.
  const s = idleBreathScale(e);
  assert.ok((s.x - 1) * (s.y - 1) <= 0, 'x and y breathe in opposite directions');
});
