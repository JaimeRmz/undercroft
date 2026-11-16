#!/usr/bin/env node
/**
 * One-off content generator for mods/core/characters/*.json — 5 original
 * characters (P2.7), each with a distinct mechanic per CLAUDE.md §3: a
 * baseline, soul-hearts-only, a unique starting weapon, devil deals paid in
 * coins instead of hearts, and a starting familiar. Hand-named (only 5 of
 * them); a dev tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'characters');

const CHARACTERS = [
  {
    id: 'core:character-01',
    name: 'Mira the Warden',
    description: 'A steady hand and an old grudge. No tricks, just grit.',
    redMax: 6,
    startingItems: ['core:item-01'],
  },
  {
    id: 'core:character-02',
    name: 'Vex the Hollow',
    description: 'Something took her red hearts long ago. What is left is quieter, and luckier.',
    redMax: 0,
    soulHearts: 4,
    statDeltas: [{ stat: 'luck', value: 1 }],
  },
  {
    id: 'core:character-03',
    name: 'Orin the Lanced',
    description: 'Fires a single unbroken lance of light instead of tears. Fragile, but it never misses.',
    redMax: 4,
    weaponType: 'laser',
  },
  {
    id: 'core:character-04',
    name: 'Dask the Broker',
    description: 'Never gives up a heart for a deal — pays every devil in coin instead.',
    redMax: 6,
    paysDealsWithCoins: true,
    startingCoins: 15,
  },
  {
    id: 'core:character-05',
    name: 'Fenn the Tethered',
    description: 'Never travels alone — a small ember has followed her since the day she arrived.',
    redMax: 6,
    startingFamiliar: 'core:familiar-05',
  },
];

function writeCharacter(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
CHARACTERS.forEach(writeCharacter);
console.log(`Wrote ${CHARACTERS.length} characters to ${OUT_DIR}`);
