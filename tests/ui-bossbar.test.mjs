import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBossBarFraction } from '../src/ui/bossbar.js';

test('computeBossBarFraction returns hp/maxHp clamped to [0, 1]', () => {
  assert.equal(computeBossBarFraction({ hp: 50, maxHp: 100 }), 0.5);
  assert.equal(computeBossBarFraction({ hp: 100, maxHp: 100 }), 1);
  assert.equal(computeBossBarFraction({ hp: -10, maxHp: 100 }), 0);
  assert.equal(computeBossBarFraction({ hp: 150, maxHp: 100 }), 1);
});

test('computeBossBarFraction is 0 for a missing boss or a non-positive maxHp', () => {
  assert.equal(computeBossBarFraction(null), 0);
  assert.equal(computeBossBarFraction({ hp: 10, maxHp: 0 }), 0);
});
