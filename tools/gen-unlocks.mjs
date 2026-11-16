#!/usr/bin/env node
/**
 * P2.10 content generator for mods/core/unlocks/*.json — 6 unlock defs
 * (4 characters + 2 items) gated behind data-driven conditions checked once
 * per finished run by src/systems/unlocks.js. `core:character-01` (the
 * default starter) and every other item/trinket/card/pill carry no
 * condition at all, so they stay available from the very first run — only
 * these 6 rewards are actually gated. A dev tool, not part of the runtime;
 * re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'unlocks');

const UNLOCKS = [
  {
    id: 'core:unlock-character-02', name: 'A Quieter Light',
    description: 'Clear 2 floors in a single run.',
    condition: { type: 'floorsClearedInRun', value: 2 },
    reward: { type: 'character', id: 'core:character-02' },
  },
  {
    id: 'core:unlock-character-03', name: 'Steady Aim',
    description: 'Defeat 15 enemies in a single run.',
    condition: { type: 'killsInRun', value: 15 },
    reward: { type: 'character', id: 'core:character-03' },
  },
  {
    id: 'core:unlock-character-04', name: 'A Familiar Face',
    description: 'Finish 3 runs (win or lose).',
    condition: { type: 'totalRunsCompleted', value: 3 },
    reward: { type: 'character', id: 'core:character-04' },
  },
  {
    id: 'core:unlock-character-05', name: 'Not Alone',
    description: 'Defeat the final boss.',
    condition: { type: 'defeatFinalBoss' },
    reward: { type: 'character', id: 'core:character-05' },
  },
  {
    id: 'core:unlock-item-20', name: 'Deeper Still',
    description: 'Clear 4 floors in a single run.',
    condition: { type: 'floorsClearedInRun', value: 4 },
    reward: { type: 'item', id: 'core:item-20' },
  },
  {
    id: 'core:unlock-item-65', name: 'A Long Career',
    description: 'Defeat 50 enemies over your lifetime.',
    condition: { type: 'totalKillsLifetime', value: 50 },
    reward: { type: 'item', id: 'core:item-65' },
  },
];

function writeUnlock(def) {
  fs.writeFileSync(path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`), JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
UNLOCKS.forEach(writeUnlock);
console.log(`Wrote ${UNLOCKS.length} unlocks to ${OUT_DIR}`);
