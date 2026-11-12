import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from '../src/engine/spatialhash.js';
import { Entity } from '../src/engine/entity.js';

test('query finds entities near a point and excludes far ones', () => {
  const hash = new SpatialHash(40);
  const near = new Entity('enemy', { x: 10, y: 10, radius: 5 });
  const far = new Entity('enemy', { x: 1000, y: 1000, radius: 5 });
  hash.rebuild([near, far]);
  const results = hash.query(0, 0, 20);
  assert.ok(results.includes(near));
  assert.ok(!results.includes(far));
});

test('query deduplicates an entity spanning multiple cells', () => {
  const hash = new SpatialHash(10);
  const big = new Entity('boss', { x: 0, y: 0, radius: 50 }); // spans many cells
  hash.rebuild([big]);
  const results = hash.query(0, 0, 5);
  assert.equal(results.filter((e) => e === big).length, 1);
});

test('rebuild clears stale entries from a previous frame', () => {
  const hash = new SpatialHash(40);
  const e = new Entity('enemy', { x: 0, y: 0, radius: 5 });
  hash.rebuild([e]);
  assert.ok(hash.query(0, 0, 10).length === 1);
  hash.rebuild([]);
  assert.equal(hash.query(0, 0, 10).length, 0);
});
