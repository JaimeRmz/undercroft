/**
 * Generic content registry. Every item/enemy/boss/character/room/floor/pickup/
 * card/pill/trinket/transformation/gamemode is registered by ID from data,
 * loaded through the mod loader (CLAUDE.md §2). Kept generic here so the mod
 * loader can register arbitrary content kinds without core changes.
 */
export class Registry {
  constructor(kind) {
    this.kind = kind;
    this._map = new Map();
  }

  register(id, def, { allowOverride = true } = {}) {
    if (!id) throw new Error(`${this.kind} registry: definition missing an "id"`);
    if (this._map.has(id) && !allowOverride) {
      throw new Error(`${this.kind} registry: duplicate id "${id}"`);
    }
    this._map.set(id, def);
  }

  get(id) {
    return this._map.get(id);
  }

  has(id) {
    return this._map.has(id);
  }

  all() {
    return [...this._map.values()];
  }

  ids() {
    return [...this._map.keys()];
  }

  delete(id) {
    return this._map.delete(id);
  }

  clear() {
    this._map.clear();
  }

  get size() {
    return this._map.size;
  }
}

/** Owns one Registry per content kind, created lazily so new kinds need no core change. */
export class ContentRegistries {
  constructor() {
    this._registries = new Map();
  }

  of(kind) {
    if (!this._registries.has(kind)) this._registries.set(kind, new Registry(kind));
    return this._registries.get(kind);
  }

  kinds() {
    return [...this._registries.keys()];
  }

  clearAll() {
    for (const registry of this._registries.values()) registry.clear();
  }
}

/** Process-wide default registries. Prefer `new ContentRegistries()` for isolated test instances. */
export const registries = new ContentRegistries();
