import path from 'node:path';
import { ModLoader } from '../../src/modding/modloader.js';
import { createFsSource } from '../../src/modding/source-fs.js';
import { ContentRegistries } from '../../src/core/registry.js';
import { createEventBus } from '../../src/core/events.js';
import { createLogger } from '../../src/core/log.js';

const MODS_DIR = path.join(import.meta.dirname, '..', '..', 'mods');

/** Loads the real mods/ directory (core + example-mod) exactly as the game does. */
export async function loadRealRegistries() {
  const registries = new ContentRegistries();
  const loader = new ModLoader({ source: createFsSource(MODS_DIR), registries, events: createEventBus(), log: createLogger('test', 'error') });
  const { errors } = await loader.loadAll();
  if (errors.length) throw new Error(`mod load errors: ${JSON.stringify(errors)}`);
  return { registries, templates: registries.of('room').all() };
}
