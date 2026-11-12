/** Plain-data entity with a component map for composable behavior (tear modifiers, AI, etc.). */
let nextId = 1;

/** Resets the id counter. Only for deterministic tests. */
export function resetEntityIds() {
  nextId = 1;
}

export class Entity {
  constructor(type, props = {}) {
    const { x = 0, y = 0, vx = 0, vy = 0, radius = 8, tags = [], ...rest } = props;
    this.id = nextId++;
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.tags = new Set(tags);
    this.alive = true;
    this.components = new Map();
    Object.assign(this, rest);
  }

  addComponent(name, data) {
    this.components.set(name, data);
    return this;
  }

  getComponent(name) {
    return this.components.get(name);
  }

  hasComponent(name) {
    return this.components.has(name);
  }

  removeComponent(name) {
    return this.components.delete(name);
  }

  hasTag(tag) {
    return this.tags.has(tag);
  }

  addTag(tag) {
    this.tags.add(tag);
    return this;
  }

  destroy() {
    this.alive = false;
  }
}

/** Owns the live entity set for a world/room; reap() clears dead ones once per tick. */
export class EntityManager {
  constructor() {
    this.entities = new Map();
  }

  add(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id) {
    return this.entities.delete(id);
  }

  get(id) {
    return this.entities.get(id);
  }

  all() {
    return [...this.entities.values()];
  }

  byType(type) {
    return this.all().filter((e) => e.type === type);
  }

  byTag(tag) {
    return this.all().filter((e) => e.hasTag(tag));
  }

  reap() {
    for (const [id, entity] of this.entities) {
      if (!entity.alive) this.entities.delete(id);
    }
  }

  clear() {
    this.entities.clear();
  }

  get size() {
    return this.entities.size;
  }
}
