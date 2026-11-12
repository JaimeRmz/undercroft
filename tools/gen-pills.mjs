#!/usr/bin/env node
/**
 * One-off content generator for mods/core/pills/*.json — 15 pill effects
 * (CLAUDE.md §3: a mix of good and bad, identified by name only after first
 * use; the color->effect mapping itself is randomized per run by
 * src/systems/pills.js, not here). A dev tool, not part of the runtime;
 * re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'pills');

const PILLS = [
  { name: 'Speed Up', description: 'Permanently quickens your step.', effects: [{ type: 'statPermanent', stat: 'speed', value: 0.3 }] },
  { name: 'Speed Down', description: 'Permanently slows your step.', effects: [{ type: 'statPermanent', stat: 'speed', value: -0.3 }] },
  { name: 'Tears Up', description: 'Permanently quickens your tears.', effects: [{ type: 'statPermanent', stat: 'tears', value: 0.6 }] },
  { name: 'Tears Down', description: 'Permanently slows your tears.', effects: [{ type: 'statPermanent', stat: 'tears', value: -0.6 }] },
  { name: 'Damage Up', description: 'Permanently strengthens your tears.', effects: [{ type: 'statPermanent', stat: 'damageUps', value: 1 }] },
  { name: 'Damage Down', description: 'Permanently weakens your tears.', effects: [{ type: 'statPermanent', stat: 'damageUps', value: -1 }] },
  { name: 'Range Up', description: 'Permanently extends your reach.', effects: [{ type: 'statPermanent', stat: 'range', value: 1.5 }] },
  { name: 'Range Down', description: 'Permanently shortens your reach.', effects: [{ type: 'statPermanent', stat: 'range', value: -1.5 }] },
  { name: 'Luck Up', description: 'Permanently bends luck your way.', effects: [{ type: 'statPermanent', stat: 'luck', value: 2 }] },
  { name: 'Full Health', description: 'Heals you to full red hearts.', effects: [{ type: 'healFull' }] },
  { name: 'Health Down', description: 'Costs you a heart.', effects: [{ type: 'damage', value: 2 }] },
  { name: 'Wealth', description: 'Conjures a handful of coins.', effects: [{ type: 'coins', value: 10 }] },
  { name: 'Haste', description: 'A long burst of speed.', effects: [{ type: 'statTemporary', stat: 'speed', value: 0.5, duration: 15 }] },
  { name: 'Weakness', description: 'A long spell of weaker tears.', effects: [{ type: 'statTemporary', stat: 'damageUps', value: -1, duration: 15 }] },
  { name: 'Lucky Foot', description: 'Permanently bends luck strongly your way.', effects: [{ type: 'statPermanent', stat: 'luck', value: 4 }] },
];

function writePill(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
PILLS.forEach((pill, i) => {
  writePill({
    id: `core:pill-${String(i + 1).padStart(2, '0')}`,
    name: pill.name,
    description: pill.description,
    effects: pill.effects,
  });
  written++;
});

console.log(`Wrote ${written} pills to ${OUT_DIR}`);
