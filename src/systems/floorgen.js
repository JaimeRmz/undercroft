/**
 * Isaac-style floor generation, implemented exactly per CLAUDE.md §3 (sourced
 * from BorisTheBrave's write-up): a 9x8 grid (column 0 kept empty), BFS growth
 * from a fixed start cell, farthest-dead-end boss room, remaining dead ends for
 * treasure/shop, secret/super-secret rooms found by adjacency afterward.
 * Pure data (no rendering) — this only produces the room-type graph; P1.2 maps
 * each cell onto an actual room template.
 */
import { CONFIG } from '../core/config.js';

export const FLOOR_GRID_WIDTH = 9; // column 0 kept empty, so usable columns are 1..8
export const FLOOR_GRID_HEIGHT = 8;
export const START_CELL = { x: 4, y: 4 }; // fixed central cell

export const ROOM_TYPE = {
  START: 'start',
  NORMAL: 'normal',
  BOSS: 'boss',
  TREASURE: 'treasure',
  SHOP: 'shop',
  SECRET: 'secret',
  SUPER_SECRET: 'supersecret',
  CHALLENGE: 'challenge',
  CURSE: 'curse',
  SACRIFICE: 'sacrifice',
  ARCADE: 'arcade',
  DEVIL: 'devil',
  ANGEL: 'angel',
};

export function cellKey(x, y) {
  return `${x},${y}`;
}

export function inFloorBounds(x, y) {
  return x >= 1 && x < FLOOR_GRID_WIDTH && y >= 0 && y < FLOOR_GRID_HEIGHT;
}

export function neighborsOf(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

export function areAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function targetRoomCount(stage, rng) {
  return Math.min(20, rng.int(0, 1) + 5 + Math.floor((stage * 10) / 3));
}

function countFilledNeighbors(cells, x, y) {
  let count = 0;
  for (const nb of neighborsOf(x, y)) {
    if (cells.has(cellKey(nb.x, nb.y))) count++;
  }
  return count;
}

/** One BFS growth pass. Returns the cell map plus how many rooms it actually placed vs. the target. */
function buildGraph(rng, stage) {
  const target = targetRoomCount(stage, rng);
  const startCell = { x: START_CELL.x, y: START_CELL.y, type: ROOM_TYPE.START, depth: 0 };
  const cells = new Map([[cellKey(startCell.x, startCell.y), startCell]]);
  let filled = 1;
  const deadEnds = [];
  const queue = [startCell];

  // Hard cap on queue-pop steps: once every cell near the start is boxed in,
  // re-queueing the start room (the ">16 rooms" rule below) can otherwise spin
  // forever reprocessing a start cell that can never add a new neighbor again.
  // Capped at a generous multiple of the grid size; generateFloor's caller
  // just retries with a fresh RNG draw if `filled` falls short of `target`.
  const maxSteps = FLOOR_GRID_WIDTH * FLOOR_GRID_HEIGHT * 50;
  let steps = 0;

  while (queue.length > 0 && filled < target && steps < maxSteps) {
    steps++;
    const current = queue.shift();
    const candidates = rng.shuffle(neighborsOf(current.x, current.y));
    let addedAny = false;

    for (const nb of candidates) {
      if (filled >= target) break;
      if (!inFloorBounds(nb.x, nb.y)) continue;
      if (cells.has(cellKey(nb.x, nb.y))) continue;
      if (countFilledNeighbors(cells, nb.x, nb.y) > 1) continue;
      if (rng.chance(0.5)) continue;

      const cell = { x: nb.x, y: nb.y, type: ROOM_TYPE.NORMAL, depth: current.depth + 1 };
      cells.set(cellKey(cell.x, cell.y), cell);
      queue.push(cell);
      filled++;
      addedAny = true;
    }

    if (!addedAny && current !== startCell) deadEnds.push(current);
    if (queue.length === 0 && filled < target && filled > 16) queue.push(startCell);
  }

  // Cells still sitting in the queue when the loop exits (target reached, or
  // the step cap tripped) never had their own neighbor expansion attempted,
  // but since generation has stopped they will never gain children either —
  // so they're dead ends too, just never evaluated by the loop above.
  for (const leftover of queue) {
    if (leftover !== startCell) deadEnds.push(leftover);
  }

  return { cells, filled, target, deadEnds, startCell };
}

function findSecretRoomCandidate(cells, deadEnds, rng, threshold) {
  const deadEndKeys = new Set(deadEnds.map((d) => cellKey(d.x, d.y)));
  const candidates = [];
  for (let y = 0; y < FLOOR_GRID_HEIGHT; y++) {
    for (let x = 1; x < FLOOR_GRID_WIDTH; x++) {
      if (cells.has(cellKey(x, y))) continue;
      const filledNeighbors = neighborsOf(x, y).filter((nb) => inFloorBounds(nb.x, nb.y) && cells.has(cellKey(nb.x, nb.y)));
      if (filledNeighbors.length < threshold) continue;
      // [assumed] "no dead ends": none of its touching rooms should themselves be a dead end.
      if (filledNeighbors.some((nb) => deadEndKeys.has(cellKey(nb.x, nb.y)))) continue;
      candidates.push({ x, y });
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

function findSuperSecretCandidate(cells, rng) {
  const candidates = [];
  for (let y = 0; y < FLOOR_GRID_HEIGHT; y++) {
    for (let x = 1; x < FLOOR_GRID_WIDTH; x++) {
      if (cells.has(cellKey(x, y))) continue;
      const filledNeighbors = neighborsOf(x, y)
        .filter((nb) => inFloorBounds(nb.x, nb.y))
        .map((nb) => cells.get(cellKey(nb.x, nb.y)))
        .filter(Boolean);
      if (filledNeighbors.length !== 1) continue;
      if (filledNeighbors[0].type !== ROOM_TYPE.NORMAL) continue; // [assumed] "next to one normal room"
      candidates.push({ x, y });
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

/** Rolls `chance`; if it hits and the pool has a spare dead end, pulls one out and types it. Mutates `pool`. */
function maybeAssignSpecialType(pool, rng, chance, type) {
  if (pool.length === 0 || !rng.chance(chance)) return null;
  const idx = rng.int(0, pool.length - 1);
  const [cell] = pool.splice(idx, 1);
  cell.type = type;
  return cell;
}

/**
 * Generates one floor's room graph. Rejects and regenerates (per CLAUDE.md §3)
 * when the room count is wrong, the boss room touches the start room, or
 * there aren't enough dead ends left for treasure + shop. `isPlayerFullHealth`
 * picks the sacrifice room's higher at-full-health chance (§3).
 */
export function generateFloor(stage, rng, { maxAttempts = 5000, isPlayerFullHealth = true } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { cells, filled, target, deadEnds, startCell } = buildGraph(rng, stage);
    if (filled !== target) continue;
    if (deadEnds.length === 0) continue;

    const maxDepth = Math.max(...deadEnds.map((d) => d.depth));
    const bossCandidates = deadEnds.filter((d) => d.depth === maxDepth);
    const boss = rng.pick(bossCandidates);
    boss.type = ROOM_TYPE.BOSS;

    if (areAdjacent(boss, startCell)) continue;

    const remaining = rng.shuffle(deadEnds.filter((d) => d !== boss));
    if (remaining.length < 2) continue;

    const treasure = remaining[0];
    treasure.type = ROOM_TYPE.TREASURE;
    const shop = remaining[1];
    shop.type = ROOM_TYPE.SHOP;

    // Remaining dead ends not already claimed by treasure/shop: independent chance rolls
    // for each optional special room type (§2/§3), each consuming at most one dead end.
    const specialPool = remaining.slice(2);
    const sacrificeChance = isPlayerFullHealth ? CONFIG.SACRIFICE_ROOM_CHANCE_FULL_HEALTH : CONFIG.SACRIFICE_ROOM_CHANCE;
    const sacrifice = maybeAssignSpecialType(specialPool, rng, sacrificeChance, ROOM_TYPE.SACRIFICE);
    const challenge = stage > 1 ? maybeAssignSpecialType(specialPool, rng, CONFIG.CHALLENGE_ROOM_CHANCE_FLOOR2, ROOM_TYPE.CHALLENGE) : null;
    const curse = maybeAssignSpecialType(specialPool, rng, CONFIG.CURSE_ROOM_CHANCE, ROOM_TYPE.CURSE);
    const arcade = maybeAssignSpecialType(specialPool, rng, CONFIG.ARCADE_ROOM_CHANCE, ROOM_TYPE.ARCADE);

    const secretThreshold = attempt < 300 ? 3 : attempt < 600 ? 2 : 1;
    const secretPos = findSecretRoomCandidate(cells, deadEnds, rng, secretThreshold);
    let secret = null;
    if (secretPos) {
      secret = { x: secretPos.x, y: secretPos.y, type: ROOM_TYPE.SECRET, depth: null };
      cells.set(cellKey(secret.x, secret.y), secret);
    }

    const superSecretPos = findSuperSecretCandidate(cells, rng);
    let superSecret = null;
    if (superSecretPos) {
      superSecret = { x: superSecretPos.x, y: superSecretPos.y, type: ROOM_TYPE.SUPER_SECRET, depth: null };
      cells.set(cellKey(superSecret.x, superSecret.y), superSecret);
    }

    return {
      stage,
      cells,
      startCell,
      boss,
      treasure,
      shop,
      secret,
      superSecret,
      sacrifice,
      challenge,
      curse,
      arcade,
      target,
      roomCount: filled,
      attempts: attempt + 1,
    };
  }
  throw new Error(`generateFloor: failed to produce a valid floor for stage ${stage} after ${maxAttempts} attempts`);
}

export function getCell(floor, x, y) {
  return floor.cells.get(cellKey(x, y));
}
