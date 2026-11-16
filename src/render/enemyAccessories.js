/**
 * Per-archetype silhouette accessories (P1.G5): small extra shapes layered
 * onto an enemy's base body so every archetype reads as a distinct creature
 * (wings, shell, spikes, ...) instead of a recolored circle. Keyed by defId
 * for the 16 core enemies; anything else (mod content) gets a hash-stable
 * pick from the same set so it's never left bare.
 */
import { hashString } from './sprites.js';

const tri = (points) => ({ op: 'polygon', points });

function wings(r, fill, outline) {
  const mk = (sign) =>
    tri([
      { x: sign * r * 0.3, y: -r * 0.1 },
      { x: sign * r * 1.5, y: -r * 0.5 },
      { x: sign * r * 1.1, y: r * 0.3 },
    ]);
  return [
    { ...mk(-1), fill: 'rgba(255,255,255,0.18)', outline, outlineWidth: 1 },
    { ...mk(1), fill: 'rgba(255,255,255,0.18)', outline, outlineWidth: 1 },
  ];
}

function wisps(r, fill, outline) {
  const ops = [];
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    ops.push({ op: 'circle', x: -r * (0.9 + t * 0.6), y: r * (0.3 - t * 0.5), radius: r * (0.35 - t * 0.08), fill: `rgba(255,255,255,${0.22 - t * 0.06})`, skipFlash: true });
  }
  return ops;
}

function rings(r, fill, outline) {
  return [{ op: 'circle', x: 0, y: 0, radius: r * 1.55, outline, outlineWidth: 2 }];
}

function fangs(r, fill, outline) {
  return [
    { ...tri([{ x: -r * 0.25, y: r * 0.55 }, { x: -r * 0.05, y: r * 0.55 }, { x: -r * 0.15, y: r * 0.85 }]), fill: '#f0ece0', outline, outlineWidth: 1 },
    { ...tri([{ x: r * 0.05, y: r * 0.55 }, { x: r * 0.25, y: r * 0.55 }, { x: r * 0.15, y: r * 0.85 }]), fill: '#f0ece0', outline, outlineWidth: 1 },
  ];
}

function antenna(r, fill, outline) {
  return [
    { op: 'rect', x: -r * 0.06, y: -r * 1.6, width: r * 0.12, height: r * 0.9, fill: outline },
    { op: 'circle', x: 0, y: -r * 1.6, radius: r * 0.16, fill, outline, outlineWidth: 1 },
  ];
}

function bumps(r, fill, outline) {
  const ops = [];
  for (const angle of [0.6, 2.4, 4.2]) {
    ops.push({ op: 'circle', x: Math.cos(angle) * r * 0.85, y: Math.sin(angle) * r * 0.85, radius: r * 0.28, fill, outline, outlineWidth: 1 });
  }
  return ops;
}

function legs(r, fill, outline) {
  return [
    { op: 'polygon', points: [{ x: -r * 0.5, y: r * 0.6 }, { x: -r * 0.2, y: r * 0.6 }, { x: -r * 0.55, y: r * 1.3 }], fill, outline, outlineWidth: 1 },
    { op: 'polygon', points: [{ x: r * 0.2, y: r * 0.6 }, { x: r * 0.5, y: r * 0.6 }, { x: r * 0.55, y: r * 1.3 }], fill, outline, outlineWidth: 1 },
  ];
}

function horn(r, fill, outline) {
  return [{ op: 'polygon', points: [{ x: -r * 0.3, y: -r * 0.6 }, { x: r * 0.3, y: -r * 0.6 }, { x: 0, y: -r * 1.6 }], fill: '#e8e0c8', outline, outlineWidth: 1 }];
}

function spikes(r, fill, outline, count = 6) {
  const ops = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const bx = Math.cos(a) * r * 0.95;
    const by = Math.sin(a) * r * 0.95;
    const tx = Math.cos(a) * r * 1.5;
    const ty = Math.sin(a) * r * 1.5;
    const perpX = -Math.sin(a) * r * 0.18;
    const perpY = Math.cos(a) * r * 0.18;
    ops.push({
      op: 'polygon',
      points: [{ x: bx + perpX, y: by + perpY }, { x: bx - perpX, y: by - perpY }, { x: tx, y: ty }],
      fill,
      outline,
      outlineWidth: 1,
    });
  }
  return ops;
}

function sacs(r, fill, outline) {
  return [
    { op: 'circle', x: -r * 0.6, y: r * 0.9, radius: r * 0.35, fill: '#d8c888', outline, outlineWidth: 1 },
    { op: 'circle', x: r * 0.6, y: r * 0.9, radius: r * 0.35, fill: '#d8c888', outline, outlineWidth: 1 },
  ];
}

function shell(r, fill, outline) {
  return [{ op: 'circle', x: 0, y: -r * 0.15, radius: r * 1.05, outline, outlineWidth: 3 }];
}

function mound(r, fill, outline) {
  return [
    { op: 'circle', x: -r * 0.3, y: r * 0.95, radius: r * 0.3, fill: 'rgba(0,0,0,0.25)', skipFlash: true },
    { op: 'circle', x: r * 0.35, y: r * 1.0, radius: r * 0.24, fill: 'rgba(0,0,0,0.25)', skipFlash: true },
  ];
}

function plate(r, fill, outline) {
  return [{ op: 'rect', x: -r * 0.75, y: -r * 1.05, width: r * 1.5, height: r * 0.55, fill: outline, outline, outlineWidth: 1 }];
}

function lobes(r, fill, outline) {
  return [
    { op: 'circle', x: -r * 0.55, y: r * 0.25, radius: r * 0.6, fill, outline, outlineWidth: 1 },
    { op: 'circle', x: r * 0.55, y: r * 0.25, radius: r * 0.6, fill, outline, outlineWidth: 1 },
  ];
}

function echo(r, fill, outline) {
  return [{ op: 'circle', x: r * 0.35, y: r * 0.25, radius: r, outline: 'rgba(255,255,255,0.35)', outlineWidth: 1 }];
}

const ACCESSORIES = {
  wings, wisps, rings, fangs, antenna, bumps, legs, horn, spikes, sacs, shell, mound, plate, lobes, echo,
};

const ENEMY_ACCESSORY = {
  'core:erratic-flier': 'wings',
  'core:wraith': 'wisps',
  'core:satellite': 'rings',
  'core:chaser': 'fangs',
  'core:turret': 'antenna',
  'core:drifter': 'bumps',
  'core:hopper': 'legs',
  'core:charger': 'horn',
  'core:rattler': 'spikes',
  'core:broodmother': 'sacs',
  'core:peeker': 'shell',
  'core:grubber': 'mound',
  'core:shellback': 'plate',
  'core:grudge': 'spikes',
  'core:globule': 'lobes',
  'core:doppel': 'echo',
};

const FALLBACK_NAMES = Object.keys(ACCESSORIES);

/** Extra local-space draw ops layered on top of an enemy's base body, keyed by defId (falls back to a stable hash pick). */
export function accessoryOpsFor(defId, { radius, fill, outline }) {
  const name = ENEMY_ACCESSORY[defId] ?? FALLBACK_NAMES[hashString(String(defId)) % FALLBACK_NAMES.length];
  const fn = ACCESSORIES[name];
  return fn ? fn(radius, fill, outline) : [];
}
