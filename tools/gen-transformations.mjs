#!/usr/bin/env node
/**
 * One-off content generator for mods/core/transformations/*.json — 5
 * transformations (P2.5), each tied to a set tag carried by 3 real items
 * (tools/gen-items.mjs's PASSIVE_SET_TAGS). Hand-named (only 5 of them); a
 * dev tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'transformations');

const TRANSFORMATIONS = [
  {
    name: 'Mothwing',
    setTag: 'core:set-mothwing',
    grantsFlight: true,
    costumeColor: '#7fd4e0',
    effect: { statBonus: [{ stat: 'tears', value: 0.3 }] },
    flavor: 'Pale wings unfurl — you drift just above the floor.',
  },
  {
    name: 'Cinderkin',
    setTag: 'core:set-cinderkin',
    grantsFlight: false,
    costumeColor: '#ff6a2a',
    effect: { tearModifiers: ['burn'] },
    flavor: 'Your tears now smolder on contact.',
  },
  {
    name: 'Hollowed',
    setTag: 'core:set-hollowed',
    grantsFlight: false,
    costumeColor: '#c9b8e8',
    effect: { statBonus: [{ stat: 'soulHearts', value: 2 }] },
    flavor: 'Something leaves you, and something else stays.',
  },
  {
    name: 'Ironclad',
    setTag: 'core:set-ironclad',
    grantsFlight: false,
    costumeColor: '#8a97a8',
    effect: { statBonus: [{ stat: 'damageUps', value: 1.5 }] },
    flavor: 'Your skin takes on a dull, metal sheen.',
  },
  {
    name: 'Quicksilver',
    setTag: 'core:set-quicksilver',
    grantsFlight: false,
    costumeColor: '#e8eef5',
    effect: { statBonus: [{ stat: 'speed', value: 0.3 }, { stat: 'shotSpeed', value: 0.2 }] },
    flavor: 'Everything about you moves a half-step ahead.',
  },
];

function writeTransformation(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
TRANSFORMATIONS.forEach((t, i) => {
  const { flavor, ...rest } = t;
  writeTransformation({
    id: `core:transformation-${String(i + 1).padStart(2, '0')}`,
    description: flavor,
    ...rest,
  });
  written++;
});

console.log(`Wrote ${written} transformations to ${OUT_DIR}`);
