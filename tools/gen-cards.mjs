#!/usr/bin/env node
/**
 * One-off content generator for mods/core/cards/*.json — 15 cards/runes with
 * wholly original names. CLAUDE.md §0 rule 8 forbids reusing Isaac's actual
 * item names, which rules out the real tarot-deck names (The Fool, The
 * Magician, The Devil, ...) Isaac's cards use — so these are named
 * "Rune of <original word>" instead, a different and original naming scheme.
 * A dev tool, not part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'cards');

const CARDS = [
  { word: 'Mending', description: 'Heals you to full red hearts.', effects: [{ type: 'healFull' }] },
  { word: 'Mourning', description: 'Grants a soul heart.', effects: [{ type: 'soulHeart', value: 2 }] },
  { word: 'Shadow', description: 'Grants a black heart.', effects: [{ type: 'blackHeart', value: 2 }] },
  { word: 'Wrath', description: 'Permanently strengthens your tears.', effects: [{ type: 'statPermanent', stat: 'damageUps', value: 1 }] },
  { word: 'Haste', description: 'Permanently quickens your tears.', effects: [{ type: 'statPermanent', stat: 'tears', value: 0.8 }] },
  { word: 'Fortune', description: 'Permanently bends luck your way.', effects: [{ type: 'statPermanent', stat: 'luck', value: 2 }] },
  { word: 'Fury', description: 'A brief, furious surge of damage.', effects: [{ type: 'statTemporary', stat: 'damageUps', value: 1.5, duration: 10 }] },
  { word: 'Swiftness', description: 'A brief burst of speed.', effects: [{ type: 'statTemporary', stat: 'speed', value: 0.4, duration: 8 }] },
  { word: 'Greed', description: 'Conjures a handful of coins.', effects: [{ type: 'coins', value: 10 }] },
  { word: 'Ruin', description: 'Conjures a satchel of bombs.', effects: [{ type: 'bombs', value: 3 }] },
  { word: 'Passage', description: 'Conjures a ring of keys.', effects: [{ type: 'keys', value: 3 }] },
  { word: 'Sight', description: 'Reveals the floor\'s map.', effects: [{ type: 'mapReveal' }] },
  { word: 'Distance', description: 'Tears a hole through space.', effects: [{ type: 'teleport' }] },
  { word: 'the Storm', description: 'Unleashes a ring of force around you.', effects: [{ type: 'nova', radius: 150, damage: 25 }] },
  { word: 'Sacrifice', description: 'Costs a heart container; grants lasting power.', effects: [{ type: 'devilTrade', heartsCost: 2, stat: 'damageUps', value: 2 }] },
];

function writeCard(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
CARDS.forEach((card, i) => {
  writeCard({
    id: `core:card-${String(i + 1).padStart(2, '0')}`,
    name: `Rune of ${card.word}`,
    description: card.description,
    effects: card.effects,
  });
  written++;
});

console.log(`Wrote ${written} cards to ${OUT_DIR}`);
