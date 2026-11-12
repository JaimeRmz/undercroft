import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ModLoader } from '../src/modding/modloader.js';
import { createFsSource } from '../src/modding/source.js';
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
