/**
 * Save system (P2.9): a pure data transform between a live `run` (the plain
 * object main.js builds in createRun — real class instances, Maps, Sets)
 * and a JSON-safe plain object, plus a tiny storage-adapter interface
 * (getItem/setItem/removeItem) so the actual persistence medium
 * (window.localStorage in the browser, an in-memory map in tests) stays
 * behind an interface, per CLAUDE.md's "rendering, audio and input are
 * adapters behind interfaces" rule applied to storage.
 *
 * Save granularity is "room entry": the save always restores the player to
 * the start of whatever room they were in, freshly re-stocked (same as any
 * other room entry) rather than mid-fight. Every *other* already-stocked
 * room on the floor keeps its resolved state (no enemy/item respawns) by
 * carrying `stockedRooms` across the save, minus the current room's key.
 */

const RUN_KEY = 'undercroft:save:run';
const SETTINGS_KEY = 'undercroft:save:settings';
const UNLOCKS_KEY = 'undercroft:save:unlocks';

/** In-memory storage adapter for headless tests and non-browser callers. */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

/** `run`: the live object built by main.js's createRun. Returns a JSON-safe plain object. */
export function serializeRun(run) {
  const floor = run.floor;
  return {
    version: 1,
    characterId: run.characterId ?? null,
    stage: run.stage,
    player: {
      weaponType: run.player.weaponType,
      paysDealsWithCoins: !!run.player.paysDealsWithCoins,
      flying: !!run.player.flying,
      transformCostumes: [...(run.player.transformCostumes ?? [])],
      tearModifiers: [...(run.player.tearModifiers ?? [])],
      stats: { ...run.player.stats },
    },
    health: {
      redMax: run.playerHealth.redMax,
      red: run.playerHealth.red,
      extra: run.playerHealth.extra.map((h) => ({ ...h })),
    },
    currency: { ...run.currency },
    inventory: {
      passives: [...run.inventory.passives],
      actives: run.inventory.actives.map((a) => ({ ...a })),
      seenIds: [...run.inventory.seenIds],
    },
    trinketId: run.trinketInventory.current?.id ?? null,
    consumable: run.consumableInventory.current ? { ...run.consumableInventory.current } : null,
    pillIdentity: {
      colorToEffectId: [...run.pillIdentity.colorToEffectId.entries()],
      identifiedColors: [...run.pillIdentity.identifiedColors],
    },
    appliedSynergyIds: [...run.appliedSynergyIds],
    activeTransformationIds: [...run.activeTransformationIds],
    floorRedDamageTaken: !!run.floorRedDamageTaken,
    bossFightRedDamageTaken: !!run.bossFightRedDamageTaken,
    finalBossDefeated: !!run.finalBossDefeated,
    lastDealRoomStage: run.lastDealRoomStage,
    progress: {
      kills: run.stats.kills,
      floorsCleared: run.stats.floorsCleared,
      elapsedSeconds: run.stats.elapsedSeconds,
    },
    floor: {
      stage: floor.stage,
      startCell: { x: floor.startCell.x, y: floor.startCell.y },
      cells: [...floor.cells.values()],
    },
    currentKey: run.floorRuntime.currentKey,
    visited: [...run.floorRuntime.visited],
    // The room just entered is deliberately excluded: its live enemy/item state was
    // never captured, so it must re-stock fresh on restore (see module doc above).
    stockedRooms: [...run.stockedRooms].filter((key) => key !== run.floorRuntime.currentKey),
  };
}

/** Inverse of serializeRun. Returns a plain descriptor; main.js's restoreRun() plugs it into real engine objects (it alone has World/registries access). */
export function deserializeRunData(data) {
  return {
    version: data.version,
    characterId: data.characterId,
    stage: data.stage,
    player: {
      weaponType: data.player.weaponType,
      paysDealsWithCoins: !!data.player.paysDealsWithCoins,
      flying: !!data.player.flying,
      transformCostumes: [...data.player.transformCostumes],
      tearModifiers: [...data.player.tearModifiers],
      stats: { ...data.player.stats },
    },
    health: { redMax: data.health.redMax, red: data.health.red, extra: data.health.extra.map((h) => ({ ...h })) },
    currency: { ...data.currency },
    inventory: {
      passives: [...data.inventory.passives],
      actives: data.inventory.actives.map((a) => ({ ...a })),
      seenIds: [...data.inventory.seenIds],
    },
    trinketId: data.trinketId,
    consumable: data.consumable ? { ...data.consumable } : null,
    pillIdentity: {
      colorToEffectId: new Map(data.pillIdentity.colorToEffectId),
      identifiedColors: new Set(data.pillIdentity.identifiedColors),
    },
    appliedSynergyIds: new Set(data.appliedSynergyIds),
    activeTransformationIds: new Set(data.activeTransformationIds),
    floorRedDamageTaken: !!data.floorRedDamageTaken,
    bossFightRedDamageTaken: !!data.bossFightRedDamageTaken,
    finalBossDefeated: !!data.finalBossDefeated,
    lastDealRoomStage: data.lastDealRoomStage,
    progress: { ...data.progress },
    floor: {
      stage: data.floor.stage,
      startCell: { ...data.floor.startCell },
      cells: data.floor.cells.map((c) => ({ ...c })),
    },
    currentKey: data.currentKey,
    visited: new Set(data.visited),
    stockedRooms: new Set(data.stockedRooms),
  };
}

export function saveRunToStorage(storage, run) {
  storage.setItem(RUN_KEY, JSON.stringify(serializeRun(run)));
}

/** Returns the saved run descriptor (already deserialized), or null if there's no save or it fails to parse. */
export function loadRunFromStorage(storage) {
  const raw = storage.getItem(RUN_KEY);
  if (!raw) return null;
  try {
    return deserializeRunData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function hasSavedRun(storage) {
  return !!storage.getItem(RUN_KEY);
}

export function clearSavedRun(storage) {
  storage.removeItem(RUN_KEY);
}

/** Settings: a free-form plain object, round-tripped verbatim. No fields are defined yet (no settings menu exists until P3) — this just gives P3 a real, working place to persist them. */
export function saveSettings(storage, settings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSettings(storage) {
  const raw = storage.getItem(SETTINGS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Persistent unlocks: a flat set of unlocked ids (achievement/unlock condition ids, P2.10). */
export function saveUnlocks(storage, unlockedIds) {
  storage.setItem(UNLOCKS_KEY, JSON.stringify([...unlockedIds]));
}

export function loadUnlocks(storage) {
  const raw = storage.getItem(UNLOCKS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}
