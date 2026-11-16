import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoryOpsFor } from '../src/render/enemyAccessories.js';
import { resolveEnemySpec } from '../src/render/sprites.js';

test('every one of the 16 core enemy ids gets a non-empty, distinct-looking accessory', () => {
  const ids = [
    'core:chaser', 'core:erratic-flier', 'core:turret', 'core:drifter', 'core:hopper', 'core:charger',
    'core:rattler', 'core:wraith', 'core:broodmother', 'core:peeker', 'core:grubber', 'core:shellback',
    'core:grudge', 'core:globule', 'core:satellite', 'core:doppel',
  ];
  for (const id of ids) {
    const ops = accessoryOpsFor(id, { radius: 14, fill: '#888', outline: '#222' });
    assert.ok(ops.length > 0, `${id} should have at least one accessory draw op`);
  }
});

test('accessoryOpsFor is deterministic for the same defId', () => {
  const a = accessoryOpsFor('core:chaser', { radius: 14, fill: '#888', outline: '#222' });
  const b = accessoryOpsFor('core:chaser', { radius: 14, fill: '#888', outline: '#222' });
  assert.deepEqual(a, b);
});

test('an unknown (e.g. modded) defId still gets a stable, non-empty accessory via hash fallback', () => {
  const ops = accessoryOpsFor('example-mod:some-new-enemy', { radius: 14, fill: '#888', outline: '#222' });
  assert.ok(ops.length > 0);
});

test('resolveEnemySpec attaches accessories for a hand-authored sprite (core:chaser)', () => {
  const spec = resolveEnemySpec({ defId: 'core:chaser', radius: 14 });
  assert.ok(Array.isArray(spec.accessories) && spec.accessories.length > 0);
});

test('resolveEnemySpec attaches accessories for a procedurally-generated (non-hand-authored) enemy', () => {
  const spec = resolveEnemySpec({ defId: 'mods:unlisted-enemy', radius: 13 });
  assert.ok(Array.isArray(spec.accessories) && spec.accessories.length > 0);
});

test('resolveEnemySpec gives a boss extra "part" accessories, fewer as it advances through its phases', () => {
  const freshBoss = resolveEnemySpec({ defId: 'core:some-boss', radius: 30, isBoss: true, phases: [1, 2, 3], currentPhaseIndex: 0 });
  const laterBoss = resolveEnemySpec({ defId: 'core:some-boss', radius: 30, isBoss: true, phases: [1, 2, 3], currentPhaseIndex: 2 });
  const partCount = (spec) => spec.accessories.filter((op) => op.op === 'circle' && op.radius < 30 * 0.5).length;
  assert.ok(partCount(freshBoss) >= partCount(laterBoss), 'expected fewer/no extra parts in the final phase than the first');
});
