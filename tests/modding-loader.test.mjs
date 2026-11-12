import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ModLoader } from '../src/modding/modloader.js';
import { createFsSource } from '../src/modding/source-fs.js';
import { ContentRegistries } from '../src/core/registry.js';
import { createEventBus } from '../src/core/events.js';
import { createLogger } from '../src/core/log.js';

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'mods');

function makeLoader() {
  const registries = new ContentRegistries();
  const events = createEventBus();
  const log = createLogger('test-modloader', 'error'); // silence warn/info noise in test output
  const source = createFsSource(FIXTURES_DIR);
  const loader = new ModLoader({ source, registries, events, log });
  return { loader, registries, events };
}

test('loadAll never throws even with multiple broken mods present', async () => {
  const { loader } = makeLoader();
  await assert.doesNotReject(() => loader.loadAll());
});

test('a valid mod with a valid definition registers its content', async () => {
  const { loader, registries } = makeLoader();
  await loader.loadAll();
  assert.ok(registries.of('enemy').has('crawler'));
  assert.equal(registries.of('enemy').get('crawler').hp, 5);
});

test('a mod with invalid JSON in mod.json is disabled with a readable error, not thrown', async () => {
  const { loader } = makeLoader();
  const { mods, errors } = await loader.loadAll();
  assert.ok(!mods.some((m) => m.dir === 'bad-manifest'));
  const err = errors.find((e) => e.mod === 'bad-manifest');
  assert.ok(err, 'expected an error entry for bad-manifest');
  assert.match(err.problem, /mod\.json missing or invalid/);
});

test('a mod with one invalid definition still loads its other valid definitions', async () => {
  const { loader, registries } = makeLoader();
  const { mods, errors } = await loader.loadAll();
  assert.ok(mods.some((m) => m.dir === 'bad-definition'));
  assert.ok(registries.of('enemy').has('valid-enemy'));
  assert.ok(!registries.of('enemy').has('broken-enemy'));
  const err = errors.find((e) => e.mod === 'bad-definition' && e.file === 'enemies/broken.json');
  assert.ok(err, 'expected a readable error for the broken definition');
  assert.equal(err.field, 'hp');
  assert.match(err.problem, /missing required field "hp"/);
});

test('a mod depending on a nonexistent mod is disabled and logged', async () => {
  const { loader } = makeLoader();
  const { mods, errors } = await loader.loadAll();
  assert.ok(!mods.some((m) => m.dir === 'missing-dependency'));
  const err = errors.find((e) => e.mod === 'missing-dependency');
  assert.ok(err);
  assert.match(err.problem, /missing dependency "does-not-exist"/);
});

test('enabled: false mods are skipped entirely, including their content', async () => {
  const { loader, registries } = makeLoader();
  const { mods } = await loader.loadAll();
  assert.ok(!mods.some((m) => m.dir === 'disabled-mod'));
  assert.ok(!registries.of('enemy').has('should-not-load'));
});

test('a mod script that throws is caught and logged, game keeps running', async () => {
  const { loader } = makeLoader();
  const { errors } = await loader.loadAll();
  const err = errors.find((e) => e.mod === 'bad-script');
  assert.ok(err);
  assert.match(err.problem, /script failed to load/);
});

test('loadAll emits mods:loaded on the event bus', async () => {
  const { loader, events } = makeLoader();
  let payload;
  events.on('mods:loaded', (p) => (payload = p));
  await loader.loadAll();
  assert.ok(payload);
  assert.ok(Array.isArray(payload.mods));
  assert.ok(Array.isArray(payload.errors));
});

test('loadAll is idempotent / safe to re-run (hot reload)', async () => {
  const { loader, registries } = makeLoader();
  await loader.loadAll();
  const firstCount = registries.of('enemy').size;
  await loader.loadAll();
  assert.equal(registries.of('enemy').size, firstCount);
});
