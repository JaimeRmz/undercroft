#!/usr/bin/env node
/**
 * One-off content generator for mods/core/trinkets/*.json — 15 trinkets with
 * wholly original names (CLAUDE.md §0 rule 8) and small, deliberately modest
 * stat-effect archetypes (a trinket is one always-on slot, not a stacking
 * permanent pickup like an item, so its bonuses are kept smaller). A dev
 * tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'trinkets');

const ADJECTIVES = [
  'Tarnished', 'Lucky', 'Chipped', 'Faded', 'Odd', 'Trembling', 'Quiet', 'Stray',
  'Bent', 'Worn', 'Pale', 'Humming', 'Small', 'Curious', 'Loose',
];
const NOUNS = [
  'Charm', 'Pendant', 'Bead', 'Clasp', 'Button', 'Feather', 'Claw', 'Bauble',
  'Medallion', 'Brooch', 'Pebble', 'Whistle', 'Ring', 'Fang', 'Scale',
];

function nameFor(i) {
  const adj = ADJECTIVES[i % ADJECTIVES.length];
  // Stride of 7 is coprime with NOUNS.length (15), so i=0..14 visits every noun once.
  const noun = NOUNS[(i * 7 + 3) % NOUNS.length];
  return `${adj} ${noun}`;
}

const TRINKET_ARCHETYPES = [
  { effects: [{ stat: 'luck', value: 1 }], flavor: 'A faint, favorable pull.' },
  { effects: [{ stat: 'speed', value: 0.15 }], flavor: 'Light as a held breath.' },
  { effects: [{ stat: 'tears', value: 0.4 }], flavor: 'A nervous, quickening tic.' },
  { effects: [{ stat: 'damageUps', value: 0.5 }], flavor: 'A small, mean edge.' },
  { effects: [{ stat: 'range', value: 1 }], flavor: 'Your aim drifts further.' },
  { effects: [{ stat: 'shotSpeed', value: 0.2 }], flavor: 'A subtle urgency to every shot.' },
  { effects: [{ stat: 'flatDamage', value: 0.5 }], flavor: 'A dependable, minor sting.' },
  { effects: [{ stat: 'luck', value: 2 }, { stat: 'speed', value: -0.05 }], flavor: 'Fortune favors the unhurried.' },
  { effects: [{ stat: 'damageUps', value: 0.3 }, { stat: 'tears', value: 0.2 }], flavor: 'A quiet, twofold meanness.' },
  { effects: [{ stat: 'speed', value: 0.1 }, { stat: 'shotSpeed', value: 0.1 }], flavor: 'Everything about you moves a little faster.' },
  { effects: [{ stat: 'range', value: 0.5 }, { stat: 'luck', value: 1 }], flavor: 'Reach, and a little fortune besides.' },
  { effects: [{ stat: 'tears', value: 0.6 }, { stat: 'damageUps', value: -0.3 }], flavor: 'Quick but glancing.' },
  { effects: [{ stat: 'luck', value: 3 }], flavor: 'An unmistakable, lucky weight.' },
  { effects: [{ stat: 'damageUps', value: 0.8 }], flavor: 'Not much, but it adds up.' },
  { effects: [{ stat: 'speed', value: 0.2 }], flavor: 'You barely feel the floor.' },
];

function writeTrinket(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
TRINKET_ARCHETYPES.forEach((archetype, i) => {
  const name = nameFor(i);
  const quality = Math.min(2, Math.floor(archetype.effects.reduce((s, e) => s + Math.abs(e.value), 0)));
  writeTrinket({
    id: `core:trinket-${String(i + 1).padStart(2, '0')}`,
    name,
    description: archetype.flavor,
    effects: archetype.effects,
    quality,
    weight: 1,
    pools: ['treasure'],
  });
  written++;
});

console.log(`Wrote ${written} trinkets to ${OUT_DIR}`);
