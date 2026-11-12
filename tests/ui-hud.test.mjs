import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHeartIcons } from '../src/ui/hud.js';
import { Health, applyDamage, addSoulHeart, addBlackHeart } from '../src/systems/health.js';

test('full red health produces all "full" red icons', () => {
  const health = new Health({ redMax: 6 });
  const icons = computeHeartIcons(health);
  assert.equal(icons.length, 3);
  assert.ok(icons.every((i) => i.type === 'full' && i.color === 'red'));
});

test('half-heart damage depletes the last heart icon first, leaving earlier ones full', () => {
  const health = new Health({ redMax: 6 });
  applyDamage(health, 1);
  const icons = computeHeartIcons(health);
  assert.equal(icons[0].type, 'full');
  assert.equal(icons[1].type, 'full');
  assert.equal(icons[2].type, 'half');
});

test('fully empty red containers show as "empty" icons', () => {
  const health = new Health({ redMax: 4 });
  applyDamage(health, 4);
  const icons = computeHeartIcons(health);
  assert.ok(icons.every((i) => i.type === 'empty'));
});

test('soul and black hearts append after red containers, paired into full icons', () => {
  const health = new Health({ redMax: 4 });
  addSoulHeart(health, 2);
  addBlackHeart(health, 1);
  const icons = computeHeartIcons(health);
  assert.equal(icons.length, 4); // 2 red + 1 full soul + 1 half black
  assert.deepEqual(icons[2], { type: 'full', color: 'soul' });
  assert.deepEqual(icons[3], { type: 'half', color: 'black' });
});
