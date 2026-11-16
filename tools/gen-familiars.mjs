#!/usr/bin/env node
/**
 * One-off content generator for mods/core/familiars/*.json — 10 familiars
 * (P2.4) covering all three CLAUDE.md §3 archetypes: orbitals, blue-fly style
 * hovering helpers, and followers that shoot. Hand-named (not via an
 * adjective/noun cycle) since there are only 10 of them; a dev tool, not
 * part of the runtime; re-run to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'familiars');

const FAMILIARS = [
  { name: 'Drifting Will', behavior: 'orbit', radius: 8, damage: 1, orbitRadius: 55, orbitSpeed: 2.4, flavor: 'A pale light that circles you, slow and steady.' },
  { name: 'Rusted Gnat', behavior: 'orbit', radius: 7, damage: 2, orbitRadius: 40, orbitSpeed: 3.2, flavor: 'A tight, buzzing little orbit.' },
  { name: 'Hollow Moth', behavior: 'orbit', radius: 9, damage: 1.5, orbitRadius: 70, orbitSpeed: 1.6, flavor: 'It keeps a wide, unhurried distance.' },
  { name: 'Grave Beetle', behavior: 'orbit', radius: 10, damage: 3, orbitRadius: 45, orbitSpeed: 2, flavor: 'Slow, heavy, and mean on contact.' },
  { name: 'Tethered Cinder', behavior: 'hover', radius: 8, damage: 2, followOffsetX: -22, followOffsetY: -26, flavor: 'A smoldering ember that never leaves your side.' },
  { name: 'Weeping Sprite', behavior: 'hover', radius: 7, damage: 1, followOffsetX: 24, followOffsetY: -20, flavor: 'It drifts just behind your right shoulder.' },
  { name: 'Ashen Pup', behavior: 'hover', radius: 9, damage: 2.5, followOffsetX: -26, followOffsetY: 10, flavor: 'Loyal, low to the ground, and quick to bite.' },
  { name: 'Spindle Wisp', behavior: 'follow', radius: 7, damage: 1.5, followOffsetX: 20, followOffsetY: -24, fireCooldownSeconds: 1.2, range: 5, flavor: 'A thin light that fires wherever you can\'t.' },
  { name: 'Charred Imp', behavior: 'follow', radius: 9, damage: 2.5, followOffsetX: -20, followOffsetY: -24, fireCooldownSeconds: 1.8, range: 4, flavor: 'Slow to fire, but it hits like a grudge.' },
  { name: 'Glass Sentinel', behavior: 'follow', radius: 8, damage: 1, followOffsetX: 0, followOffsetY: -30, fireCooldownSeconds: 0.8, range: 6.5, flavor: 'Brittle, watchful, and quick on the trigger.' },
];

function writeFamiliar(def) {
  const file = path.join(OUT_DIR, `${def.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
FAMILIARS.forEach((f, i) => {
  const { flavor, ...rest } = f;
  writeFamiliar({
    id: `core:familiar-${String(i + 1).padStart(2, '0')}`,
    description: flavor,
    ...rest,
  });
  written++;
});

console.log(`Wrote ${written} familiars to ${OUT_DIR}`);
