import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ModLoader } from '../src/modding/modloader.js';
import { createFsSource } from '../src/modding/source-fs.js';
import { ContentRegistries } from '../src/core/registry.js';
import { createEventBus } from '../src/core/events.js';
import { createLogger } from '../src/core/log.js';

const MODS_DIR = path.join(import.meta.dirname, '..', 'mods');

test('the real mods/ directory (core + example-mod) loads cleanly with zero errors', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  const { mods, errors } = await loader.loadAll();
  assert.deepEqual(errors, []);
  assert.ok(mods.some((m) => m.id === 'core'));
  assert.ok(mods.some((m) => m.id === 'example-mod'));
  assert.ok(registries.of('item').has('example-mod:bauble'));
  assert.ok(registries.of('item').has('example-mod:scripted-trinket'));
  for (const id of ['core:chaser', 'core:erratic-flier', 'core:turret']) {
    assert.ok(registries.of('enemy').has(id), `expected enemy registry to contain ${id}`);
  }
});

test('mods/core ships 30+ normal room templates across 2 chapters, plus start/boss/treasure/shop/secret variants', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  await loader.loadAll();
  const rooms = registries.of('room').all();
  const normals = rooms.filter((r) => r.type === 'normal');
  assert.ok(normals.length >= 30, `expected 30+ normal templates, got ${normals.length}`);
  assert.ok(normals.some((r) => r.chapter === 1));
  assert.ok(normals.some((r) => r.chapter === 2));
  for (const type of ['start', 'boss', 'treasure', 'shop', 'secret', 'supersecret']) {
    assert.ok(rooms.some((r) => r.type === type), `expected at least one "${type}" room template`);
  }
});

test('core loads before example-mod per loadOrder/dependency', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  const { mods } = await loader.loadAll();
  const coreIdx = mods.findIndex((m) => m.id === 'core');
  const exampleIdx = mods.findIndex((m) => m.id === 'example-mod');
  assert.ok(coreIdx < exampleIdx);
});
