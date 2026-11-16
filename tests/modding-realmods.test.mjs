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
  assert.ok(registries.of('synergy').size >= 2, 'expected the core synergy rules to load');
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

test('mods/core ships 10 familiars covering all 3 behaviors (orbit/hover/follow)', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  await loader.loadAll();
  const familiars = registries.of('familiar').all();
  assert.equal(familiars.length, 10);
  for (const behavior of ['orbit', 'hover', 'follow']) {
    assert.ok(familiars.some((f) => f.behavior === behavior), `expected at least one "${behavior}" familiar`);
  }
  const items = registries.of('item').all();
  for (const familiar of familiars) {
    assert.ok(items.some((i) => i.grantsFamiliar === familiar.id), `expected an item granting ${familiar.id}`);
  }
});

test('mods/core ships 5 transformations, each with a set tag carried by 3+ real items', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  await loader.loadAll();
  const transformations = registries.of('transformation').all();
  assert.equal(transformations.length, 5);
  const items = registries.of('item').all();
  for (const transformation of transformations) {
    const carriers = items.filter((i) => i.sets?.includes(transformation.setTag));
    assert.ok(carriers.length >= 3, `expected 3+ items carrying ${transformation.setTag}, got ${carriers.length}`);
  }
});

test('mods/core ships 5 characters, each with a distinct §3-named mechanic', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  await loader.loadAll();
  const characters = registries.of('character').all();
  assert.equal(characters.length, 5);
  assert.ok(characters.some((c) => c.redMax === 0 && c.soulHearts > 0), 'expected a soul-hearts-only character');
  assert.ok(characters.some((c) => c.weaponType), 'expected a character with a unique starting weapon');
  assert.ok(characters.some((c) => c.paysDealsWithCoins), 'expected a character that pays deals in coins');
  assert.ok(characters.some((c) => c.startingFamiliar), 'expected a character with a starting familiar');
});

test('mods/core ships chapters 3-5 (P2.8): 5 more floors, 25 more enemies, 8 more bosses incl. one isFinalBoss, item count 80+', async () => {
  const registries = new ContentRegistries();
  const loader = new ModLoader({
    source: createFsSource(MODS_DIR),
    registries,
    events: createEventBus(),
    log: createLogger('real-mods-test', 'error'),
  });
  await loader.loadAll();

  const floors = registries.of('floor').all();
  for (const stage of [5, 6, 7, 8, 9]) {
    assert.ok(floors.some((f) => f.stage === stage), `expected a floor def for stage ${stage}`);
  }
  assert.equal(floors.find((f) => f.stage === 9)?.chapter, 5);

  const enemies = registries.of('enemy').all();
  assert.ok(enemies.length >= 41, `expected 41+ enemies, got ${enemies.length}`);
  for (const chapter of [3, 4, 5]) {
    assert.ok(enemies.some((e) => e.chapter === chapter), `expected at least one chapter-${chapter} enemy`);
  }

  const bosses = registries.of('boss').all();
  assert.ok(bosses.length >= 12, `expected 12+ bosses, got ${bosses.length}`);
  const finalBosses = bosses.filter((b) => b.isFinalBoss);
  assert.equal(finalBosses.length, 1, 'expected exactly one isFinalBoss');
  assert.ok(finalBosses[0].phases.length >= 3, 'the final boss should have 3+ phases');
  assert.equal(finalBosses[0].chapter, 5);

  const items = registries.of('item').all();
  assert.ok(items.length >= 80, `expected 80+ items, got ${items.length}`);
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
