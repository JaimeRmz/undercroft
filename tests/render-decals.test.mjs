import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DecalLayer } from '../src/render/decals.js';

test('add appends decals; clear empties the layer', () => {
  const layer = new DecalLayer();
  layer.add({ x: 1, y: 2 });
  layer.add({ x: 3, y: 4 });
  assert.equal(layer.decals.length, 2);
  layer.clear();
  assert.equal(layer.decals.length, 0);
});

test('at max capacity, the oldest decal is dropped', () => {
  const layer = new DecalLayer(2);
  const a = { x: 0, y: 0, id: 'a' };
  layer.add(a);
  layer.add({ x: 0, y: 0, id: 'b' });
  layer.add({ x: 0, y: 0, id: 'c' });
  assert.equal(layer.decals.length, 2);
  assert.ok(!layer.decals.includes(a));
});
