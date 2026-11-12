import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry, ContentRegistries } from '../src/core/registry.js';

test('register/get round-trips a definition by id', () => {
  const reg = new Registry('item');
  reg.register('fang', { name: 'Fang', damage: 1 });
  assert.deepEqual(reg.get('fang'), { name: 'Fang', damage: 1 });
  assert.ok(reg.has('fang'));
});

test('register with no id throws a readable error', () => {
  const reg = new Registry('item');
  assert.throws(() => reg.register(undefined, {}), /missing an "id"/);
});

test('registering the same id twice overrides by default (mods may override core content)', () => {
  const reg = new Registry('item');
  reg.register('fang', { damage: 1 });
  reg.register('fang', { damage: 2 });
  assert.equal(reg.get('fang').damage, 2);
});

test('allowOverride: false rejects duplicate ids', () => {
  const reg = new Registry('item');
  reg.register('fang', { damage: 1 });
  assert.throws(() => reg.register('fang', { damage: 2 }, { allowOverride: false }), /duplicate id/);
});

test('all() and ids() reflect registered content', () => {
  const reg = new Registry('enemy');
  reg.register('crawler', { hp: 5 });
  reg.register('floater', { hp: 3 });
  assert.deepEqual(reg.ids().sort(), ['crawler', 'floater']);
  assert.equal(reg.all().length, 2);
});

test('ContentRegistries creates registries lazily per kind and isolates them', () => {
  const registries = new ContentRegistries();
  registries.of('item').register('fang', { damage: 1 });
  registries.of('enemy').register('fang', { hp: 10 }); // same id, different kind, no collision
  assert.equal(registries.of('item').get('fang').damage, 1);
  assert.equal(registries.of('enemy').get('fang').hp, 10);
});

test('clearAll empties every registry', () => {
  const registries = new ContentRegistries();
  registries.of('item').register('a', {});
  registries.of('enemy').register('b', {});
  registries.clearAll();
  assert.equal(registries.of('item').size, 0);
  assert.equal(registries.of('enemy').size, 0);
});
