#!/usr/bin/env node
/**
 * P2.8 content generator for mods/core/bosses/ — 8 more bosses (4 existing +
 * 8 = 12 total): 3 for chapter 3, 4 for chapter 4, and the single capstone
 * final boss for chapter 5 (`isFinalBoss: true`, a custom field read only by
 * src/main.js's victory check — harmless extra data to every other system,
 * per schema.js's "unknown extra fields are allowed" rule). Reuses the 10
 * registered attack patterns from src/systems/ai/bossPatterns.js; no new
 * pattern code needed. A dev tool, not part of the runtime; re-run to
 * regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'bosses');

const BOSSES = [
  {
    id: 'core:rotgall', name: 'Rotgall', chapter: 3, hp: 100, radius: 28, speed: 70,
    contactDamageHalfHearts: 2, shotSpeed: 1.2, damage: 2, range: 8,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'aimedBurst', weight: 2 }, { id: 'charge', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'spread', weight: 2 }, { id: 'projectileRain', weight: 1 }, { id: 'charge', weight: 1 }] },
    ],
    description: 'A bloated, charging brute that showers the room in a final desperate spread.',
  },
  {
    id: 'core:cindermaw', name: 'Cindermaw', chapter: 3, hp: 110, radius: 30, speed: 55,
    contactDamageHalfHearts: 2, shotSpeed: 1.2, damage: 2, range: 9,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'ring', weight: 2 }, { id: 'spiral', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'spiral', weight: 2 }, { id: 'summonMinions', weight: 1 }, { id: 'ring', weight: 1 }] },
    ],
    description: 'Fills the room with slow, spiraling fire and calls in help once it is hurting.',
  },
  {
    id: 'core:thesorrow', name: 'The Sorrow', chapter: 3, hp: 120, radius: 29, speed: 0,
    contactDamageHalfHearts: 2, shotSpeed: 1.3, damage: 2, range: 9,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'teleport', weight: 2 }, { id: 'aimedBurst', weight: 1 }] },
      { hpThreshold: 0.45, patterns: [{ id: 'telegraphedLaser', weight: 2 }, { id: 'teleport', weight: 1 }, { id: 'aimedBurst', weight: 1 }] },
    ],
    description: 'Blinks from corner to corner, lining up a beam the moment it settles.',
  },
  {
    id: 'core:hollowgiant', name: 'The Hollow Giant', chapter: 4, hp: 150, radius: 34, speed: 50,
    contactDamageHalfHearts: 2, shotSpeed: 1.2, damage: 2, range: 8,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'slam', weight: 2 }, { id: 'charge', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'slam', weight: 2 }, { id: 'summonMinions', weight: 1 }, { id: 'charge', weight: 2 }] },
    ],
    description: 'Every footfall ends in a shockwave; every slam calls more of its brood.',
  },
  {
    id: 'core:greylung', name: 'Greylung', chapter: 4, hp: 160, radius: 30, speed: 60,
    contactDamageHalfHearts: 2, shotSpeed: 1.3, damage: 2, range: 9,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'projectileRain', weight: 2 }, { id: 'spread', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'projectileRain', weight: 2 }, { id: 'ring', weight: 1 }, { id: 'spread', weight: 2 }] },
    ],
    description: 'Chokes the room in a near-constant rain of fire from above.',
  },
  {
    id: 'core:thebrokenchoir', name: 'The Broken Choir', chapter: 4, hp: 170, radius: 32, speed: 0,
    contactDamageHalfHearts: 2, shotSpeed: 1.3, damage: 2, range: 10,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'telegraphedLaser', weight: 2 }, { id: 'ring', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'telegraphedLaser', weight: 2 }, { id: 'spiral', weight: 1 }, { id: 'summonMinions', weight: 1 }] },
    ],
    description: 'Several locked beams sweep the room in a pattern that only looks random.',
  },
  {
    id: 'core:vultross', name: 'Vultross', chapter: 4, hp: 180, radius: 33, speed: 75,
    contactDamageHalfHearts: 2, shotSpeed: 1.4, damage: 2, range: 9,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'charge', weight: 2 }, { id: 'teleport', weight: 1 }] },
      { hpThreshold: 0.5, patterns: [{ id: 'charge', weight: 2 }, { id: 'teleport', weight: 2 }, { id: 'aimedBurst', weight: 1 }] },
    ],
    description: 'Blinks into line with you and closes the gap before you can finish turning.',
  },
  {
    id: 'core:theunmadeking', name: 'The Unmade King', chapter: 5, hp: 260, radius: 36, speed: 55,
    contactDamageHalfHearts: 2, shotSpeed: 1.4, damage: 2, range: 10,
    isFinalBoss: true,
    phases: [
      { hpThreshold: 1.0, patterns: [{ id: 'ring', weight: 2 }, { id: 'aimedBurst', weight: 1 }, { id: 'charge', weight: 1 }] },
      { hpThreshold: 0.65, patterns: [{ id: 'spiral', weight: 2 }, { id: 'telegraphedLaser', weight: 2 }, { id: 'summonMinions', weight: 1 }, { id: 'charge', weight: 1 }] },
      { hpThreshold: 0.35, patterns: [{ id: 'projectileRain', weight: 2 }, { id: 'telegraphedLaser', weight: 2 }, { id: 'slam', weight: 2 }, { id: 'summonMinions', weight: 1 }] },
      { hpThreshold: 0.15, patterns: [{ id: 'teleport', weight: 1 }, { id: 'telegraphedLaser', weight: 3 }, { id: 'slam', weight: 2 }, { id: 'spiral', weight: 2 }] },
    ],
    description: 'The final chapter\'s capstone: composed at first, then every pattern at once.',
  },
];

function writeBoss(def) {
  fs.writeFileSync(path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`), JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
BOSSES.forEach(writeBoss);
console.log(`Wrote ${BOSSES.length} bosses to ${OUT_DIR}`);
