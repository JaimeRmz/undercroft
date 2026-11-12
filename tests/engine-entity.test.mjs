import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Entity, EntityManager, resetEntityIds } from '../src/engine/entity.js';

test('entity gets sane defaults and a unique id', () => {
  resetEntityIds();
  const a = new Entity('enemy');
  const b = new Entity('enemy');
  assert.equal(a.x, 0);
  assert.equal(a.radius, 8);
  assert.equal(a.alive, true);
  assert.notEqual(a.id, b.id);
});

test('extra props pass through without clobbering the tags Set', () => {
  const e = new Entity('enemy', { x: 5, y: 6, hp: 10, tags: ['boss', 'flying'] });
  assert.equal(e.x, 5);
  assert.equal(e.hp, 10);
  assert.ok(e.tags instanceof Set);
  assert.ok(e.hasTag('boss'));
  assert.ok(e.hasTag('flying'));
});

test('components attach/detach by name', () => {
  const e = new Entity('player');
  e.addComponent('homing', { strength: 0.5 });
  assert.ok(e.hasComponent('homing'));
  assert.deepEqual(e.getComponent('homing'), { strength: 0.5 });
  e.removeComponent('homing');
  assert.ok(!e.hasComponent('homing'));
});

test('destroy() marks alive=false without removing from a manager immediately', () => {
  const manager = new EntityManager();
  const e = manager.add(new Entity('projectile'));
  e.destroy();
  assert.equal(e.alive, false);
  assert.ok(manager.get(e.id));
});

test('EntityManager.reap() removes only dead entities', () => {
  const manager = new EntityManager();
  const alive = manager.add(new Entity('player'));
  const dead = manager.add(new Entity('projectile'));
  dead.destroy();
  manager.reap();
  assert.ok(manager.get(alive.id));
  assert.equal(manager.get(dead.id), undefined);
});

test('byType and byTag filter correctly', () => {
  const manager = new EntityManager();
  manager.add(new Entity('enemy', { tags: ['flying'] }));
  manager.add(new Entity('enemy', { tags: [] }));
  manager.add(new Entity('player', {}));
  assert.equal(manager.byType('enemy').length, 2);
  assert.equal(manager.byTag('flying').length, 1);
});
