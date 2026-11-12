import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDamage,
  computeTearDelay,
  tearDelayToFireRate,
  tearDelayToCooldownSeconds,
  luckProcChance,
  Stats,
} from '../src/systems/stats.js';

test('base damage with no ups/multipliers equals baseDmg * charMult', () => {
  assert.equal(computeDamage({ baseDmg: 3.5, charMult: 1, damageUps: 0, flatDamage: 0 }), 3.5);
});

test('damage ups follow the diminishing sqrt curve exactly', () => {
  const dmg = computeDamage({ baseDmg: 3.5, charMult: 1, damageUps: 2, flatDamage: 0 });
  const expected = 3.5 * Math.sqrt(1 + 1.2 * 2);
  assert.ok(Math.abs(dmg - expected) < 1e-9);
});

test('flatDamage is additive after the sqrt curve, multipliers apply after that and do not diminish', () => {
  const dmg = computeDamage({ baseDmg: 3.5, charMult: 1, damageUps: 1, flatDamage: 1, multipliers: [2, 1.5] });
  const base = 3.5 * Math.sqrt(1 + 1.2 * 1) + 1;
  const expected = base * 2 * 1.5;
  assert.ok(Math.abs(dmg - expected) < 1e-9);
});

test('tear delay at T=0 is exactly 10', () => {
  assert.equal(computeTearDelay(0), 10);
});

test('tear delay soft-caps at 5 for high positive tears (around T ~= 1.82)', () => {
  const atCap = computeTearDelay(1.82);
  assert.ok(Math.abs(atCap - 5) < 0.02);
  const wayPast = computeTearDelay(10);
  assert.equal(wayPast, 5);
});

test('tear delay is continuous across the T=0 boundary', () => {
  const justAbove = computeTearDelay(0.0001);
  const justBelow = computeTearDelay(-0.0001);
  assert.ok(Math.abs(justAbove - 10) < 0.01);
  assert.ok(Math.abs(justBelow - 10) < 0.01);
});

test('tear delay for -0.77 < T < 0 matches the documented formula', () => {
  const T = -0.4;
  const expected = 16 - 6 * Math.sqrt(1 + 1.3 * T) - 6 * T;
  assert.ok(Math.abs(computeTearDelay(T) - expected) < 1e-9);
});

test('tear delay for T <= -0.77 matches the linear formula', () => {
  const T = -1;
  assert.equal(computeTearDelay(T), 16 - 6 * T);
});

test('direct tear-delay modifiers can break the soft cap but never go below the floor of 1', () => {
  const broken = computeTearDelay(10, { directModifiers: -10 });
  assert.ok(broken < 5); // broke the soft cap
  const flooredOut = computeTearDelay(10, { directModifiers: -1000 });
  assert.equal(flooredOut, 1);
});

test('fire rate and cooldown conversion: delay 10 -> 30/11 shots/sec -> 11/30 sec/shot', () => {
  const rate = tearDelayToFireRate(10);
  assert.ok(Math.abs(rate - 30 / 11) < 1e-9);
  const cooldown = tearDelayToCooldownSeconds(10);
  assert.ok(Math.abs(cooldown - 11 / 30) < 1e-9);
});

test('luckProcChance clamps to [0, 1] and scales with luck', () => {
  assert.equal(luckProcChance(0.5, 0), 0.5);
  assert.equal(luckProcChance(0.9, 100, 0.01), 1); // clamped
  assert.equal(luckProcChance(0.1, -100, 0.01), 0); // clamped
});

test('Stats class derives damage/tearDelay/fireCooldownSeconds/clampedSpeed consistently with the pure functions', () => {
  const stats = new Stats({ damageUps: 3, tears: 2, speed: 5 });
  assert.equal(stats.damage, computeDamage({ baseDmg: 3.5, charMult: 1, damageUps: 3, flatDamage: 0 }));
  assert.equal(stats.tearDelay, computeTearDelay(2));
  assert.equal(stats.fireCooldownSeconds, tearDelayToCooldownSeconds(computeTearDelay(2)));
  assert.equal(stats.clampedSpeed, 2.0); // capped
});

test('Stats defaults match CLAUDE.md §3 base values', () => {
  const stats = new Stats();
  assert.equal(stats.damage, 3.5);
  assert.equal(stats.tearDelay, 10);
  assert.equal(stats.range, 6.5);
  assert.equal(stats.shotSpeed, 1.0);
  assert.equal(stats.speed, 1.0);
  assert.equal(stats.luck, 0);
});
