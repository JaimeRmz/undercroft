#!/usr/bin/env node
/**
 * P2.8 content generator for mods/core/items/item-48..82.json — 35 more
 * passive/active items (47 existing + 35 = 82, clearing CLAUDE.md §8's
 * 80+ item target) using a second, disjoint adjective/noun bank from
 * tools/gen-items.mjs so no generated name collides with the original 47.
 * A dev tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'items');
const START_INDEX = 48; // continues core:item-01..47

const ADJECTIVES = [
  'Blistered', 'Clotted', 'Dreaming', 'Eroded', 'Flickering', 'Gaunt', 'Hallowed', 'Inverted',
  'Jaundiced', 'Knotted', 'Leaden', 'Mottled', 'Nameless', 'Oily', 'Plagued', 'Quivering',
  'Ruined', 'Scorched', 'Tattered', 'Unmoored', 'Vestigial', 'Warped', 'Yawning', 'Zealous',
  'Bloodless', 'Cindered', 'Draining', 'Embered', 'Fused', 'Grafted', 'Hushed', 'Ink-Stained',
  'Jagged-Edged', 'Keening',
];
const NOUNS = [
  'Hook', 'Mask', 'Urn', 'Fetter', 'Bone', 'Claw', 'Veil', 'Brand', 'Scale', 'Hive',
  'Tusk', 'Pendant', 'Ribcage', 'Stinger', 'Mirror', 'Wisp', 'Seed', 'Fang', 'Grimoire', 'Totem',
  'Shackle', 'Quill', 'Ossuary', 'Cocoon', 'Larva', 'Nest', 'Pupa', 'Carcass', 'Husk-Shell', 'Tallow',
  'Membrane', 'Molar', 'Pincer', 'Gristle', 'Chrysalis',
];

function nameFor(i) {
  const adj = ADJECTIVES[i % ADJECTIVES.length];
  const noun = NOUNS[(i * 11 + 5) % NOUNS.length]; // 11 is coprime with 35
  return `${adj} ${noun}`;
}

const PASSIVE_ARCHETYPES = [
  { effects: [{ stat: 'damageUps', value: 1.2 }], flavor: 'A second, colder kind of anger.' },
  { effects: [{ stat: 'damageUps', value: 0.8 }, { stat: 'range', value: 1 }], flavor: 'Hits harder, and from further away.' },
  { effects: [{ stat: 'tears', value: 0.9 }], flavor: 'You weep without pause.' },
  { effects: [{ stat: 'tears', value: 1.8 }, { stat: 'damageUps', value: -0.5 }], flavor: 'Fast and thin.' },
  { effects: [{ stat: 'range', value: 2 }], flavor: 'Your tears fly further than they should.' },
  { effects: [{ stat: 'shotSpeed', value: 0.4 }], flavor: 'Nothing you fire wavers.' },
  { effects: [{ stat: 'speed', value: 0.35 }], flavor: 'Your feet forget the floor.' },
  { effects: [{ stat: 'luck', value: 3 }], flavor: 'A crooked, favorable star.' },
  { effects: [{ stat: 'redHeartContainers', value: 2 }], flavor: 'A second skin grows beneath the first.' },
  { effects: [{ stat: 'soulHearts', value: 2 }], flavor: 'A pale light clings to your chest.' },
  { effects: [{ stat: 'blackHearts', value: 2 }], flavor: 'Something patient waits inside you.' },
  { effects: [{ stat: 'damageUps', value: 2 }, { stat: 'speed', value: -0.15 }], flavor: 'Heavy enough to slow your stride.' },
  { effects: [{ stat: 'tears', value: 0.6 }, { stat: 'shotSpeed', value: 0.2 }], flavor: 'Quicker in every sense.' },
  { effects: [{ stat: 'luck', value: 1 }, { stat: 'range', value: 1 }], flavor: 'Fortune favors the far-reaching.' },
  { effects: [{ stat: 'flatDamage', value: 1.5 }], flavor: 'A blunt, guaranteed hurt.' },
  { effects: [{ stat: 'damageUps', value: 1 }, { stat: 'tears', value: 0.4 }], flavor: 'Hits harder and more often.' },
  { effects: [{ stat: 'speed', value: 0.2 }, { stat: 'shotSpeed', value: 0.2 }], flavor: 'Everything about you quickens.' },
  { effects: [{ stat: 'luck', value: 5 }], flavor: 'The odds simply stop mattering.' },
  { effects: [{ stat: 'damageUps', value: 2.5 }], flavor: 'A single, terrible purpose.' },
  { effects: [{ stat: 'redHeartContainers', value: 2 }, { stat: 'speed', value: -0.1 }], flavor: 'Sturdier, and slower for it.' },
  { effects: [{ stat: 'range', value: 1.5 }, { stat: 'tears', value: 0.3 }], flavor: 'Reaches further, falls faster.' },
  { effects: [{ stat: 'speed', value: 0.45 }], flavor: 'You are already gone before you move.' },
  { effects: [{ stat: 'damageUps', value: 1 }, { stat: 'luck', value: 2 }], flavor: 'Cruelty rewarded by chance.' },
  { effects: [{ stat: 'soulHearts', value: 4 }], flavor: 'A second, stranger body of light.' },
  { effects: [{ stat: 'tears', value: 1.1 }, { stat: 'luck', value: 1 }], flavor: 'A frantic, lucky rhythm.' },
  { effects: [{ stat: 'damageUps', value: 0.6 }, { stat: 'shotSpeed', value: 0.3 }], flavor: 'Sharper, and loosed without delay.' },
  { effects: [{ stat: 'blackHearts', value: 2 }, { stat: 'damageUps', value: 0.5 }], flavor: 'Something dark lends you its strength.' },
  { effects: [{ stat: 'luck', value: 2 }, { stat: 'speed', value: 0.15 }], flavor: 'Quick, and quick to benefit.' },
  { effects: [{ stat: 'damageUps', value: 1.5 }, { stat: 'range', value: -1 }], flavor: 'Brutal up close, useless at range.' },
  { effects: [{ stat: 'redHeartContainers', value: 4 }], flavor: 'You simply refuse to stop.' },
];

const ACTIVE_ARCHETYPES = [
  { activeEffect: { type: 'heal', value: 6 }, maxCharges: 4, flavor: 'A deep, costly mending.' },
  { activeEffect: { type: 'nova', radius: 170, damage: 20 }, maxCharges: 5, flavor: 'A wide, merciless detonation.' },
  { activeEffect: { type: 'speedBoost', multiplier: 2, duration: 3 }, maxCharges: 3, flavor: 'For a moment, you outrun everything.' },
  { activeEffect: { type: 'teleport' }, maxCharges: 3, flavor: 'A second, shorter tear through space.' },
  { activeEffect: { type: 'nova', radius: 110, damage: 10 }, maxCharges: 2, flavor: 'A tight, bitter burst.' },
];

function writeItem(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const POOL_CYCLE = [
  ['treasure'],
  ['treasure', 'shop'],
  ['treasure', 'boss'],
  ['treasure', 'secret'],
  ['shop'],
  ['treasure', 'devil'],
  ['treasure', 'angel'],
  ['treasure', 'curse'],
];

let written = 0;
PASSIVE_ARCHETYPES.forEach((archetype, i) => {
  const name = nameFor(i);
  const quality = Math.min(4, Math.floor(archetype.effects.reduce((s, e) => s + Math.abs(e.value), 0) / 1.5));
  writeItem({
    id: `core:item-${String(START_INDEX + i).padStart(2, '0')}`,
    name,
    type: 'passive',
    description: archetype.flavor,
    effects: archetype.effects,
    quality,
    weight: 1,
    pools: POOL_CYCLE[i % POOL_CYCLE.length],
  });
  written++;
});

const ACTIVE_START = START_INDEX + PASSIVE_ARCHETYPES.length;
ACTIVE_ARCHETYPES.forEach((archetype, i) => {
  const name = nameFor(PASSIVE_ARCHETYPES.length + i);
  writeItem({
    id: `core:item-${String(ACTIVE_START + i).padStart(2, '0')}`,
    name,
    type: 'active',
    description: archetype.flavor,
    activeEffect: archetype.activeEffect,
    maxCharges: archetype.maxCharges,
    quality: 3,
    weight: 1,
    pools: ['treasure', 'shop'],
  });
  written++;
});

console.log(`Wrote ${written} items (core:item-${START_INDEX}..${ACTIVE_START + ACTIVE_ARCHETYPES.length - 1}) to ${OUT_DIR}`);
