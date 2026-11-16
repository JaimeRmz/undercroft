#!/usr/bin/env node
/**
 * P2.8 content generator for mods/core/enemies/ — 25 more enemies across
 * chapters 3, 4 and 5 (the final chapter), reusing the 16 composable AI
 * behaviors from src/systems/ai/behaviors.js (per-chapter re-skins and
 * harder stat rolls, same as CLAUDE.md's own champion system reusing base
 * archetypes) rather than inventing new behavior code. A dev tool, not part
 * of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'enemies');

// Each entry: [name, slug, chapter, behavior(s), hp, speed, radius, extra fields, description]
const ENEMIES = [
  // Chapter 3 (stage 5-6) — 8 enemies, a step up from chapter 1/2's rolls.
  ['Gravepicker', 'gravepicker', 3, 'chase', 9, 95, 14, {}, 'A heavier, faster cousin of the things that merely shuffle toward you.'],
  ['Tideling', 'tideling', 3, 'erraticFlier', 7, 85, 13, { flies: true }, 'Skims over every pit in the room, veering unpredictably as it closes in.'],
  ['Lurchpike', 'lurchpike', 3, 'hopLeap', 8, 65, 14, {}, 'Coils tighter and leaps further than anything seen on the upper floors.'],
  ['Ratchetjaw', 'ratchetjaw', 3, 'dashCharger', 10, 85, 15, {}, 'Lines up with brutal patience before rocketing down the row.'],
  ['Wickwarden', 'wickwarden', 3, 'turretShooter', 9, 0, 15, { fireCooldownSeconds: 0.9, shotSpeed: 1.2, damage: 2, range: 6 }, 'A fortified gun emplacement that never moves and rarely misses.'],
  ['Bilewretch', 'bilewretch', 3, 'hideAndPopShooter', 7, 0, 13, { fireCooldownSeconds: 0.55, shotSpeed: 1.3, damage: 2, range: 6 }, 'Surfaces from the muck to spit before vanishing again.'],
  ['Cragback', 'cragback', 3, 'frontArmoredKnight', 11, 60, 16, {}, 'A thicker plate, a harder charge — flanking it still works.'],
  ['Ashenmaw', 'ashenmaw', 3, ['chase', 'exploder'], 6, 65, 13, {}, 'Closes the distance and detonates violently the instant it dies.'],
  // Chapter 4 (stage 7-8) — 9 enemies, harder still.
  ['Hollowgale', 'hollowgale', 4, 'wallPhasingGhost', 8, 75, 13, { flies: true }, 'Drifts through every wall in the room as if it isn\'t there.'],
  ['Fetterling', 'fetterling', 4, 'fourDirectionBouncer', 8, 130, 14, {}, 'Ricochets at a punishing speed, impossible to predict after the first wall.'],
  ['Grimspawner', 'grimspawner', 4, 'fleeingSpawner', 9, 60, 15, {}, 'Flees relentlessly while a steady trickle of minions chase in its place.'],
  ['Marrowcoil', 'marrowcoil', 4, ['chase', 'splitter'], 8, 60, 15, {}, 'Breaks into two smaller horrors the moment it is finally put down.'],
  ['Needlewraith', 'needlewraith', 4, 'mirrorOfPlayer', 9, 200, 14, {}, 'A sharper shadow, closing the gap a little faster than Doppel ever did.'],
  ['Pallbearer', 'pallbearer', 4, 'orbiter', 8, 100, 13, { flies: true }, 'Sweeps a wide, punishing patrol with real weight behind every pass.'],
  ['Scuttlekin', 'scuttlekin', 4, 'burrower', 9, 75, 14, {}, 'Surfaces only long enough to strike, then dives back out of reach.'],
  ['Vantablight', 'vantablight', 4, 'turretShooter', 12, 0, 16, { fireCooldownSeconds: 0.7, shotSpeed: 1.4, damage: 2, range: 7 }, 'A merciless emplacement with almost no downtime between shots.'],
  ['Wraithgrip', 'wraithgrip', 4, 'dashCharger', 13, 100, 16, {}, 'Charges nearly twice as fast as anything from the upper chapters.'],
  // Chapter 5 (final, stage 9) — 8 enemies, the hardest regular enemies in the game.
  ['Direlatch', 'direlatch', 5, 'frontArmoredKnight', 15, 70, 17, {}, 'An armored horror that has learned to keep its plated side toward you.'],
  ['Emberthrall', 'emberthrall', 5, ['chase', 'exploder'], 9, 80, 14, {}, 'Burns with a hunger that ends in a final, violent release.'],
  ['Faminecoil', 'faminecoil', 5, ['chase', 'splitter'], 11, 70, 16, {}, 'Divides again and again until there is nothing left worth splitting.'],
  ['Gloamstalker', 'gloamstalker', 5, 'wallPhasingGhost', 11, 90, 14, { flies: true }, 'No wall in the final halls can keep this thing out.'],
  ['Hexwarden', 'hexwarden', 5, 'turretShooter', 14, 0, 17, { fireCooldownSeconds: 0.6, shotSpeed: 1.5, damage: 2, range: 8 }, 'The last and worst of the gun emplacements.'],
  ['Ironveil', 'ironveil', 5, 'fourDirectionBouncer', 10, 150, 15, {}, 'A blur across the room, too fast to track by eye alone.'],
  ['Judasfly', 'judasfly', 5, 'orbiter', 10, 120, 14, { flies: true }, 'Patrols its circle with a speed that makes cornering it a gamble.'],
  ['Knellwing', 'knellwing', 5, 'erraticFlier', 10, 110, 14, { flies: true }, 'Swoops without warning, fast enough to close any gap in an instant.'],
];

function writeEnemy([name, slug, chapter, behavior, hp, speed, radius, extra, description]) {
  const def = {
    id: `core:${slug}`,
    name,
    chapter,
    hp,
    speed,
    radius,
    ...(Array.isArray(behavior) ? { behaviors: behavior } : { behavior }),
    ...extra,
    contactDamageHalfHearts: chapter >= 4 ? 2 : 1, // CLAUDE.md §3: "Chapter 4+ enemies deal a full heart"
    description,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
ENEMIES.forEach(writeEnemy);
console.log(`Wrote ${ENEMIES.length} enemies to ${OUT_DIR}`);
