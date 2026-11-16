#!/usr/bin/env node
/**
 * One-off content generator for mods/core/items/*.json — 25 passive + 5 active
 * items with wholly original names (adjective+noun combinations from an
 * original word bank, per CLAUDE.md §0 rule 8) and a deliberate spread of
 * stat effects. A dev tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'items');

const ADJECTIVES = [
  'Cursed', 'Gleaming', 'Withered', 'Ashen', 'Hollow', 'Verdant', 'Molten', 'Frostbitten',
  'Gilded', 'Shattered', 'Feral', 'Sombre', 'Radiant', 'Rusted', 'Petrified', 'Luminous',
  'Charred', 'Thorned', 'Mossy', 'Brittle', 'Weeping', 'Forsaken', 'Jagged', 'Tarnished',
  'Spectral', 'Gnarled', 'Searing', 'Pallid', 'Crumbling', 'Iridescent',
];
const NOUNS = [
  'Tooth', 'Idol', 'Vial', 'Locket', 'Shard', 'Talisman', 'Husk', 'Coil', 'Rune', 'Eye',
  'Thimble', 'Needle', 'Censer', 'Bellows', 'Knucklebone', 'Prism', 'Spur', 'Wick', 'Gourd',
  'Effigy', 'Sigil', 'Marrow', 'Cinder', 'Ledger', 'Antler', 'Spindle', 'Husk', 'Lantern',
  'Chalice', 'Ember',
];

function nameFor(i) {
  const adj = ADJECTIVES[i % ADJECTIVES.length];
  // Stride of 7 is coprime with NOUNS.length (30), so as i sweeps 0..29 the noun
  // index visits all 30 nouns exactly once instead of collapsing to a single one
  // (that collapse — Math.floor(i/30) staying 0 for all i<30 — was a real bug:
  // every generated item ended up named "... Tooth").
  const noun = NOUNS[(i * 7 + 3) % NOUNS.length];
  return `${adj} ${noun}`;
}

// Each passive effect set is a deliberate, named archetype (not randomized noise).
const PASSIVE_ARCHETYPES = [
  { effects: [{ stat: 'damageUps', value: 1 }], flavor: 'Your tears strike harder.' },
  { effects: [{ stat: 'damageUps', value: 2 }], flavor: 'A heavy, cruel weight.' },
  { effects: [{ stat: 'tears', value: 0.7 }], flavor: 'You weep more often.' },
  { effects: [{ stat: 'tears', value: 1.4 }], flavor: 'Your sorrow quickens.' },
  { effects: [{ stat: 'range', value: 1.5 }], flavor: 'Your reach extends.' },
  { effects: [{ stat: 'shotSpeed', value: 0.3 }], flavor: 'Tears fly true and fast.' },
  { effects: [{ stat: 'speed', value: 0.25 }], flavor: 'Your steps quicken.' },
  { effects: [{ stat: 'luck', value: 2 }], flavor: 'Fortune leans your way.' },
  { effects: [{ stat: 'redHeartContainers', value: 2 }], flavor: 'Your body hardens.' },
  { effects: [{ stat: 'soulHearts', value: 2 }], flavor: 'A ghostly ward surrounds you.' },
  { effects: [{ stat: 'blackHearts', value: 2 }], flavor: 'Something dark protects you.' },
  { effects: [{ stat: 'damageUps', value: 0.5 }, { stat: 'tears', value: 0.3 }], flavor: 'A balanced, vicious gift.' },
  { effects: [{ stat: 'speed', value: 0.3 }, { stat: 'luck', value: 1 }], flavor: 'Quick and fortunate.' },
  { effects: [{ stat: 'flatDamage', value: 1 }], flavor: 'A flat, dependable edge.' },
  { effects: [{ stat: 'range', value: 2.5 }, { stat: 'shotSpeed', value: -0.1 }], flavor: 'Far-reaching, but slower to loose.' },
  { effects: [{ stat: 'damageUps', value: 1.5 }, { stat: 'speed', value: -0.1 }], flavor: 'Power at the cost of grace.' },
  { effects: [{ stat: 'tears', value: 1.0 }, { stat: 'luck', value: 1 }], flavor: 'Rapid and lucky.' },
  { effects: [{ stat: 'luck', value: 4 }], flavor: 'Fate itself bends.' },
  { effects: [{ stat: 'shotSpeed', value: 0.5 }], flavor: 'Nothing escapes your aim.' },
  { effects: [{ stat: 'damageUps', value: 3 }], flavor: 'A brutal, singular purpose.' },
  { effects: [{ stat: 'redHeartContainers', value: 4 }], flavor: 'Your constitution swells.' },
  { effects: [{ stat: 'tears', value: 0.5 }, { stat: 'range', value: 1 }], flavor: 'Modest, well-rounded growth.' },
  { effects: [{ stat: 'speed', value: 0.4 }], flavor: 'The ground barely touches you.' },
  { effects: [{ stat: 'damageUps', value: 1 }, { stat: 'luck', value: 1 }], flavor: 'Strength and fortune entwined.' },
  { effects: [{ stat: 'soulHearts', value: 4 }], flavor: 'A deeper, stranger ward.' },
];

const ACTIVE_ARCHETYPES = [
  { activeEffect: { type: 'heal', value: 4 }, maxCharges: 3, flavor: 'Mends your wounds in a burst of warmth.' },
  { activeEffect: { type: 'nova', radius: 140, damage: 15 }, maxCharges: 4, flavor: 'Unleashes a ring of searing force.' },
  { activeEffect: { type: 'speedBoost', multiplier: 1.6, duration: 4 }, maxCharges: 2, flavor: 'Grants a fleeting burst of speed.' },
  { activeEffect: { type: 'teleport' }, maxCharges: 2, flavor: 'Tears a hole through space.' },
  { activeEffect: { type: 'nova', radius: 90, damage: 8 }, maxCharges: 2, flavor: 'A smaller, quicker detonation.' },
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
    id: `core:item-${String(i + 1).padStart(2, '0')}`,
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

ACTIVE_ARCHETYPES.forEach((archetype, i) => {
  const name = nameFor(PASSIVE_ARCHETYPES.length + i);
  writeItem({
    id: `core:item-${String(PASSIVE_ARCHETYPES.length + i + 1).padStart(2, '0')}`,
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

// One item per status-effect tear modifier (P2.3), so poison/burn/slow/freeze/
// charm/fear/confuse are actually reachable in a real run, not just
// exercisable by hand/tests. Named explicitly (not via nameFor's
// adjective/noun cycle, which repeats past index 29) to guarantee uniqueness.
const STATUS_ARCHETYPES = [
  { name: 'Weeping Nettle', modifier: 'poison', flavor: 'Your tears leave a festering wound.' },
  { name: 'Smoldering Brand', modifier: 'burn', flavor: 'Your tears sear whatever they touch.' },
  { name: 'Frost-Veined Idol', modifier: 'slow', flavor: 'Your tears chill your foes\' steps.' },
  { name: 'Glacial Husk', modifier: 'freeze', flavor: 'Your tears can freeze an enemy solid.' },
  { name: 'Bewitched Mirror', modifier: 'charm', flavor: 'Your tears can turn a foe to your side.' },
  { name: 'Dread Effigy', modifier: 'fear', flavor: 'Your tears strike terror into your foes.' },
  { name: 'Addled Coil', modifier: 'confuse', flavor: 'Your tears scramble a foe\'s senses.' },
];

const STATUS_START_INDEX = PASSIVE_ARCHETYPES.length + ACTIVE_ARCHETYPES.length;
STATUS_ARCHETYPES.forEach((archetype, i) => {
  writeItem({
    id: `core:item-${String(STATUS_START_INDEX + i + 1).padStart(2, '0')}`,
    name: archetype.name,
    type: 'passive',
    description: archetype.flavor,
    effects: [],
    grantsTearModifier: archetype.modifier,
    quality: 2,
    weight: 1,
    pools: ['treasure', 'shop'],
  });
  written++;
});

// One item per familiar (P2.4), so every orbital/hover/follower-shooter
// archetype is actually reachable in a real run. Named explicitly, same
// reasoning as STATUS_ARCHETYPES above.
const FAMILIAR_ARCHETYPES = [
  { name: 'Moonlit Locket', familiar: 'core:familiar-01', flavor: 'Something pale now circles you.' },
  { name: 'Corroded Thimble', familiar: 'core:familiar-02', flavor: 'A buzzing weight settles in close.' },
  { name: 'Powdered Wing', familiar: 'core:familiar-03', flavor: 'A moth takes up a slow, wide orbit.' },
  { name: 'Cracked Carapace', familiar: 'core:familiar-04', flavor: 'Something heavy now guards your flank.' },
  { name: 'Guttering Wick', familiar: 'core:familiar-05', flavor: 'An ember settles just behind you.' },
  { name: 'Threadbare Veil', familiar: 'core:familiar-06', flavor: 'A small light drifts at your shoulder.' },
  { name: 'Soot-Stained Collar', familiar: 'core:familiar-07', flavor: 'Something loyal now follows at your heel.' },
  { name: 'Unspooled Thread', familiar: 'core:familiar-08', flavor: 'A thin light learns to aim for you.' },
  { name: 'Blackened Horn', familiar: 'core:familiar-09', flavor: 'A slow, grudging little helper joins you.' },
  { name: 'Fractured Lens', familiar: 'core:familiar-10', flavor: 'A watchful sliver of glass takes your side.' },
];

const FAMILIAR_START_INDEX = STATUS_START_INDEX + STATUS_ARCHETYPES.length;
FAMILIAR_ARCHETYPES.forEach((archetype, i) => {
  writeItem({
    id: `core:item-${String(FAMILIAR_START_INDEX + i + 1).padStart(2, '0')}`,
    name: archetype.name,
    type: 'passive',
    description: archetype.flavor,
    effects: [],
    grantsFamiliar: archetype.familiar,
    quality: 3,
    weight: 1,
    pools: ['treasure', 'shop'],
  });
  written++;
});

console.log(`Wrote ${written} items to ${OUT_DIR}`);
