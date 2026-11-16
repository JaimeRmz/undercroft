/**
 * Loads mods in dependency + loadOrder order, validates every definition
 * against its content-kind schema, and registers valid ones into the content
 * registries. A bad mod.json, a bad definition, or a missing dependency
 * disables just that piece and logs a readable error — it never throws past
 * loadAll() (CLAUDE.md §4).
 */
import { registries as defaultRegistries } from '../core/registry.js';
import { events as defaultEvents } from '../core/events.js';
import { log as defaultLog } from '../core/log.js';
import { SCHEMAS, validateDefinition } from './schema.js';
import { createModApi } from './api.js';

const FOLDER_TO_KIND = {
  items: 'item',
  characters: 'character',
  enemies: 'enemy',
  bosses: 'boss',
  rooms: 'room',
  floors: 'floor',
  pickups: 'pickup',
  cards: 'card',
  pills: 'pill',
  trinkets: 'trinket',
  familiars: 'familiar',
  transformations: 'transformation',
  gamemodes: 'gamemode',
  synergies: 'synergy',
  unlocks: 'unlock',
};

export class ModLoader {
  constructor({ source, registries = defaultRegistries, events = defaultEvents, log = defaultLog }) {
    this.source = source;
    this.registries = registries;
    this.events = events;
    this.log = log;
    this.loadedMods = [];
    this.errors = [];
  }

  /** Clears registries and (re)loads every enabled mod from the source. Safe to call repeatedly (hot reload). */
  async loadAll() {
    this.errors = [];
    this.loadedMods = [];
    this.registries.clearAll();

    const manifests = await this.source.listMods();
    const { ordered, disabled } = this._resolveOrder(manifests);
    this.errors.push(...disabled);

    for (const manifest of ordered) {
      await this._loadMod(manifest);
    }

    for (const err of this.errors) this.log.warn(`mod "${err.mod}": ${err.problem}${err.file ? ` (${err.file}${err.field ? `, field "${err.field}"` : ''})` : ''}`);

    this.events.emit('mods:loaded', { mods: this.loadedMods, errors: this.errors });
    return { mods: this.loadedMods, errors: this.errors };
  }

  /** Topologically sorts by dependencies, tie-broken by loadOrder then id. Disables mods with bad manifests/missing deps/cycles. */
  _resolveOrder(manifestEntries) {
    const disabled = [];
    const valid = [];

    for (const manifest of manifestEntries) {
      if (manifest._error) {
        disabled.push({ mod: manifest._dir, problem: manifest._error });
        continue;
      }
      if (!manifest.id) {
        disabled.push({ mod: manifest._dir, problem: 'mod.json missing required field "id"' });
        continue;
      }
      if (manifest.enabled === false) continue;
      valid.push(manifest);
    }

    const byId = new Map(valid.map((m) => [m.id, m]));
    const visited = new Set();
    const visiting = new Set();
    const ordered = [];
    const broken = new Set();

    const visit = (manifest) => {
      if (visited.has(manifest.id) || broken.has(manifest.id)) return;
      if (visiting.has(manifest.id)) {
        disabled.push({ mod: manifest._dir, problem: `circular dependency involving "${manifest.id}"` });
        broken.add(manifest.id);
        return;
      }
      visiting.add(manifest.id);
      for (const depId of manifest.dependencies ?? []) {
        const dep = byId.get(depId);
        if (!dep) {
          disabled.push({ mod: manifest._dir, problem: `missing dependency "${depId}"` });
          broken.add(manifest.id);
          continue;
        }
        visit(dep);
      }
      visiting.delete(manifest.id);
      if (!broken.has(manifest.id)) {
        visited.add(manifest.id);
        ordered.push(manifest);
      }
    };

    const sorted = [...valid].sort((a, b) => (a.loadOrder ?? 0) - (b.loadOrder ?? 0) || a.id.localeCompare(b.id));
    for (const manifest of sorted) visit(manifest);

    return { ordered, disabled };
  }

  async _loadMod(manifest) {
    const modDir = manifest._dir;
    let definitionCount = 0;

    for (const [folder, kind] of Object.entries(FOLDER_TO_KIND)) {
      const files = await this.source.listFiles(modDir, folder);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        definitionCount += await this._loadDefinitionFile(modDir, folder, kind, file);
      }
    }

    for (const scriptPath of manifest.scripts ?? []) {
      try {
        await this._loadScript(modDir, scriptPath);
      } catch (err) {
        this.errors.push({ mod: modDir, file: scriptPath, problem: `script failed to load: ${err.message}` });
      }
    }

    this.loadedMods.push({ id: manifest.id, dir: modDir, definitionCount });
  }

  /** Returns the number of definitions successfully registered from this file. */
  async _loadDefinitionFile(modDir, folder, kind, file) {
    const fileRef = `${folder}/${file}`;
    let raw;
    try {
      raw = await this.source.readFile(modDir, fileRef);
    } catch (err) {
      this.errors.push({ mod: modDir, file: fileRef, problem: `could not read: ${err.message}` });
      return 0;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.errors.push({ mod: modDir, file: fileRef, problem: `invalid JSON: ${err.message}` });
      return 0;
    }

    const defs = Array.isArray(parsed) ? parsed : [parsed];
    const schema = SCHEMAS[kind];
    const registry = this.registries.of(kind);
    let registered = 0;

    for (const def of defs) {
      const validationErrors = validateDefinition(def, schema);
      if (validationErrors.length > 0) {
        for (const e of validationErrors) {
          this.errors.push({ mod: modDir, file: fileRef, field: e.field, problem: e.problem });
        }
        continue;
      }
      if (def.$patch && registry.has(def.id)) {
        registry.register(def.id, { ...registry.get(def.id), ...def });
      } else {
        registry.register(def.id, def);
      }
      registered++;
    }

    return registered;
  }

  async _loadScript(modDir, scriptPath) {
    const module = await this.source.importScript(modDir, scriptPath);
    if (typeof module.default !== 'function') {
      throw new Error('script has no default export function(api) {...}');
    }
    const api = createModApi({ events: this.events, registries: this.registries, log: this.log });
    await module.default(api);
  }
}
