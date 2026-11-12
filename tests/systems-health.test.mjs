import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Health, addRedContainer, addSoulHeart, addBlackHeart, removeRedContainer, heal, applyDamage, tickInvuln } from '../src/systems/health.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

test('default health starts at redMax halves, fully healed, alive, not invulnerable', () => {
  const health = new Health({ redMax: 6 });
  assert.equal(health.red, 6);
  assert.equal(health.totalHalves, 6);
  assert.ok(health.alive);
  assert.ok(!health.isInvulnerable);
});

test('damage consumes extra (soul/black) hearts before red hearts', () => {
  const health = new Health({ redMax: 6 });
  addSoulHeart(health, 2);
  const result = applyDamage(health, 1);
  assert.equal(result.extraLost, 1);
  assert.equal(result.redLost, 0);
  assert.equal(health.red, 6); // untouched
  assert.equal(health.extra.length, 1);
});

test('damage spills over into red once extra hearts are exhausted', () => {
  const health = new Health({ redMax: 6 });
  addSoulHeart(health, 1);
  const result = applyDamage(health, 2); // 1 extra half + 1 red half
  assert.equal(result.extraLost, 1);
  assert.equal(result.redLost, 1);
  assert.equal(health.red, 5);
});

test('losing a black heart emits health:blackHeartLost', () => {
  const health = new Health({ redMax: 6 });
  addBlackHeart(health, 2);
  const events = createEventBus();
  let payload;
  events.on('health:blackHeartLost', (p) => (payload = p));
  applyDamage(health, 2, { events });
  assert.ok(payload);
  assert.equal(payload.count, 2);
});

test('applyDamage grants invulnerability and ignores further damage until it expires', () => {
  const health = new Health({ redMax: 6 });
  applyDamage(health, 1);
  assert.ok(health.isInvulnerable);
  const before = health.red;
  applyDamage(health, 10); // should be fully ignored
  assert.equal(health.red, before);

  tickInvuln(health, CONFIG.INVULN_FRAMES / CONFIG.TICK_RATE + 0.01);
  assert.ok(!health.isInvulnerable);
  applyDamage(health, 1);
  assert.equal(health.red, before - 1);
});

test('death triggers when total halves reaches 0, emits health:death', () => {
  const health = new Health({ redMax: 2 });
  const events = createEventBus();
  let died = false;
  events.on('health:death', () => (died = true));
  applyDamage(health, 2, { events });
  assert.ok(!health.alive);
  assert.ok(died);
});

test('heal restores red hearts up to redMax, no overflow', () => {
  const health = new Health({ redMax: 6 });
  applyDamage(health, 4);
  const healed = heal(health, 10);
  assert.equal(healed, 4);
  assert.equal(health.red, 6);
});

test('heal falls back to soul hearts when the build has no red containers', () => {
  const health = new Health({ redMax: 0, red: 0 });
  const healed = heal(health, 2);
  assert.equal(healed, 2);
  assert.equal(health.extra.length, 2);
  assert.equal(health.extra[0].type, 'soul');
});

test('addRedContainer/addSoulHeart/addBlackHeart never exceed the 24-half (12 heart) cap', () => {
  const health = new Health({ redMax: 20 });
  const granted = addRedContainer(health, 10); // would be 30, cap is 24
  assert.equal(granted, 4);
  assert.equal(health.totalContainerHalves, 24);
  assert.equal(addSoulHeart(health, 5), 0); // already at cap
});

test('removeRedContainer shrinks redMax and caps current red to it, flooring at 0', () => {
  const health = new Health({ redMax: 6 });
  health.red = 3; // already damaged
  assert.equal(removeRedContainer(health, 2), 2);
  assert.equal(health.redMax, 4);
  assert.equal(health.red, 3, 'current red below the new max is untouched');

  assert.equal(removeRedContainer(health, 10), 4, 'clamps to what remains');
  assert.equal(health.redMax, 0);
  assert.equal(health.red, 0);
});

test('zero or negative damage is a no-op', () => {
  const health = new Health({ redMax: 6 });
  const result = applyDamage(health, 0);
  assert.equal(result.applied, 0);
  assert.equal(health.red, 6);
});
