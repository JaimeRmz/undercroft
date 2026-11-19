/**
 * Per-enemy facial/design ops (P2.Q Q4a): mouths and small signature details
 * layered onto the chapter-1 enemies so each reads as an original, distinct
 * creature — a body + eyes + a mouth with its own personality (a grin, a
 * snarl, a wail), on top of the archetype silhouette accessory (wings, spikes,
 * ...) from enemyAccessories.js. Returns local-space ops in the same format as
 * accessories. Only chapter-1 enemies are tailored here; Q4b/Q4c cover the rest,
 * and any other id gets no extra facial op (unchanged from before).
 *
 * All designs are original art — generic monster shapes, no referenced IP.
 */

// Mouth builders, each centered near the lower face (eyes sit at ~ -r*0.15).
const MOUTHS = {
  // A wide jagged grin of teeth — aggressive chasers.
  grin: (r) => [
    { op: 'polygon', points: zig(-r * 0.45, r * 0.3, r * 0.9, r * 0.22, 4), fill: '#f4efe2', outline: '#1a1a1a', outlineWidth: 1 },
  ],
  // A down-turned snarl.
  snarl: (r) => [
    { op: 'polygon', points: [{ x: -r * 0.4, y: r * 0.45 }, { x: 0, y: r * 0.22 }, { x: r * 0.4, y: r * 0.45 }, { x: 0, y: r * 0.33 }], fill: '#2a1012', outline: '#1a1a1a', outlineWidth: 1 },
  ],
  // A small neutral round maw.
  maw: (r) => [
    { op: 'circle', x: 0, y: r * 0.35, radius: r * 0.18, fill: '#2a1012', outline: '#1a1a1a', outlineWidth: 1 },
  ],
  // A hollow vertical wail (ghosts).
  wail: (r) => [
    { op: 'circle', x: 0, y: r * 0.32, radius: r * 0.16, fill: 'rgba(10,10,20,0.75)', skipFlash: true },
  ],
  // A set, gritted bar of clenched teeth (chargers).
  grit: (r) => [
    { op: 'rect', x: -r * 0.4, y: r * 0.28, width: r * 0.8, height: r * 0.2, fill: '#f4efe2', outline: '#1a1a1a', outlineWidth: 1 },
    { op: 'rect', x: -r * 0.12, y: r * 0.28, width: r * 0.04, height: r * 0.2, fill: '#1a1a1a' },
    { op: 'rect', x: r * 0.1, y: r * 0.28, width: r * 0.04, height: r * 0.2, fill: '#1a1a1a' },
  ],
  // A thin firing slit (turrets).
  slit: (r) => [
    { op: 'rect', x: -r * 0.3, y: r * 0.3, width: r * 0.6, height: r * 0.08, fill: '#1a1a1a' },
  ],
  // A wide gaping mouth (hoppers mid-leap feel).
  gape: (r) => [
    { op: 'circle', x: 0, y: r * 0.32, radius: r * 0.26, fill: '#2a1012', outline: '#1a1a1a', outlineWidth: 1 },
    { op: 'polygon', points: zig(-r * 0.2, r * 0.18, r * 0.4, r * 0.12, 3), fill: '#f4efe2' },
  ],
  // A flat, expressionless line (mimics/doppelganger — unsettlingly neutral).
  flatline: (r) => [
    { op: 'rect', x: -r * 0.35, y: r * 0.34, width: r * 0.7, height: r * 0.06, fill: '#1a1a1a' },
  ],
  // Side pincer mandibles meeting at the middle (burrowers).
  mandibles: (r) => [
    { op: 'polygon', points: [{ x: -r * 0.5, y: r * 0.22 }, { x: -r * 0.05, y: r * 0.4 }, { x: -r * 0.45, y: r * 0.5 }], fill: '#d8c7a8', outline: '#1a1a1a', outlineWidth: 1 },
    { op: 'polygon', points: [{ x: r * 0.5, y: r * 0.22 }, { x: r * 0.05, y: r * 0.4 }, { x: r * 0.45, y: r * 0.5 }], fill: '#d8c7a8', outline: '#1a1a1a', outlineWidth: 1 },
  ],
  // An asymmetric sly smirk (ambushers that hide and pop out).
  smirk: (r) => [
    { op: 'polygon', points: [{ x: -r * 0.35, y: r * 0.3 }, { x: r * 0.35, y: r * 0.22 }, { x: r * 0.3, y: r * 0.36 }, { x: -r * 0.32, y: r * 0.4 }], fill: '#2a1012', outline: '#1a1a1a', outlineWidth: 1 },
  ],
  // A drooping, drooling maw (spawners/brooders).
  drool: (r) => [
    { op: 'circle', x: 0, y: r * 0.3, radius: r * 0.2, fill: '#2a1012', outline: '#1a1a1a', outlineWidth: 1 },
    { op: 'circle', x: r * 0.08, y: r * 0.52, radius: r * 0.07, fill: 'rgba(150,200,120,0.7)' },
  ],
  // Two tiny splitting maws (blobs that divide).
  split: (r) => [
    { op: 'circle', x: -r * 0.2, y: r * 0.34, radius: r * 0.11, fill: '#2a1012' },
    { op: 'circle', x: r * 0.2, y: r * 0.34, radius: r * 0.11, fill: '#2a1012' },
  ],
};

/** Builds a jagged zig-zag strip of `teeth` points spanning width `w` from x0, baseline y, depth d. */
function zig(x0, y, w, d, teeth) {
  const pts = [];
  const step = w / teeth;
  for (let i = 0; i <= teeth; i++) pts.push({ x: x0 + i * step, y });
  for (let i = teeth - 1; i >= 0; i--) pts.push({ x: x0 + (i + 0.5) * step, y: y + d });
  return pts;
}

const ENEMY_MOUTH = {
  // Chapter 1 (P2.Q Q4a)
  'core:chaser': 'grin',
  'core:drifter': 'maw',
  'core:charger': 'grit',
  'core:erratic-flier': 'maw',
  'core:hopper': 'gape',
  'core:rattler': 'snarl',
  'core:turret': 'slit',
  'core:wraith': 'wail',
  // Chapter 2 (P2.Q Q4b)
  'core:broodmother': 'drool',
  'core:doppel': 'flatline',
  'core:globule': 'split',
  'core:grubber': 'mandibles',
  'core:grudge': 'snarl',
  'core:peeker': 'smirk',
  'core:satellite': 'maw',
  'core:shellback': 'grit',
};

/** Extra facial design ops for `defId` (mouth + personality), or [] if this enemy has no tailored design yet. */
export function designOpsFor(defId, { radius }) {
  const mouth = ENEMY_MOUTH[defId];
  if (!mouth || !MOUTHS[mouth]) return [];
  return MOUTHS[mouth](radius);
}

/** True if this enemy has a hand-tuned Q4a design (used by tests to assert chapter-1 coverage). */
export function hasTailoredDesign(defId) {
  return defId in ENEMY_MOUTH;
}
