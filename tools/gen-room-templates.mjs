#!/usr/bin/env node
/**
 * One-off content generator for mods/core/rooms/*.json — procedurally produces
 * varied-but-authored interior obstacle layouts (not random noise: each pattern
 * is a deliberate, named shape) so we get 30+ genuinely distinct normal rooms
 * without hand-typing each ASCII grid. Re-run freely to regenerate; the output
 * is what's checked in, this script is a dev tool, not part of the runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'mods', 'core', 'rooms');

const W = 13;
const H = 7;
const IX = [1, 11]; // interior x range inclusive
const IY = [1, 5]; // interior y range inclusive

function blankRows() {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      row += x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

function setChar(rows, x, y, ch) {
  if (x < IX[0] || x > IX[1] || y < IY[0] || y > IY[1]) return; // never touch border
  const row = rows[y].split('');
  row[x] = ch;
  rows[y] = row.join('');
}

const CX = 6; // interior center x
const CY = 3; // interior center y

const PATTERNS = {
  empty: (rows) => {},
  fourCornerRocks: (rows) => {
    for (const [dx, dy] of [[-4, -1], [4, -1], [-4, 1], [4, 1]]) setChar(rows, CX + dx, CY + dy, 'R');
  },
  centerPitCross: (rows) => {
    setChar(rows, CX, CY, 'P');
    setChar(rows, CX - 1, CY, 'P');
    setChar(rows, CX + 1, CY, 'P');
    setChar(rows, CX, CY - 1, 'P');
    setChar(rows, CX, CY + 1, 'P');
  },
  centerPitBlock: (rows) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) setChar(rows, CX + dx, CY + dy, 'P');
  },
  pillarsRow: (rows) => {
    for (const dx of [-3, 0, 3]) {
      setChar(rows, CX + dx, CY - 1, 'R');
      setChar(rows, CX + dx, CY + 1, 'R');
    }
  },
  diagonalScatter: (rows) => {
    for (let i = -2; i <= 2; i++) setChar(rows, CX + i, CY + i > IY[1] - 1 || CY + i < IY[0] + 1 ? CY : CY + i, i % 2 === 0 ? 'R' : 'P');
  },
  verticalPitLine: (rows) => {
    for (let y = IY[0] + 1; y <= IY[1] - 1; y++) setChar(rows, CX, y, 'P');
  },
  horizontalPitLine: (rows) => {
    for (let x = CX - 3; x <= CX + 3; x++) setChar(rows, x, CY, 'P');
  },
  ringOfRocks: (rows) => {
    for (const [dx, dy] of [[-2, -1], [0, -1], [2, -1], [-2, 1], [0, 1], [2, 1], [-2, 0], [2, 0]]) setChar(rows, CX + dx, CY + dy, 'R');
  },
  rockCorridor: (rows) => {
    for (let x = IX[0] + 1; x <= IX[1] - 1; x++) {
      if (x % 2 === 0) continue;
      setChar(rows, x, CY - 1, 'R');
      setChar(rows, x, CY + 1, 'R');
    }
  },
  splitPits: (rows) => {
    for (let y = IY[0]; y <= IY[1]; y++) {
      if (y === CY) continue; // keep the door row passable (CLAUDE.md §2 room templates must stay traversable between doors)
      setChar(rows, CX - 3, y, 'P');
      setChar(rows, CX + 3, y, 'P');
    }
  },
  cornerRockPairs: (rows) => {
    for (const [dx, dy] of [[-4, -1], [-5, -1], [4, -1], [5, -1], [-4, 1], [-5, 1], [4, 1], [5, 1]]) setChar(rows, CX + dx, CY + dy, 'R');
  },
  checkerRocks: (rows) => {
    for (let dx = -3; dx <= 3; dx += 2) {
      setChar(rows, CX + dx, CY - 1, 'R');
      setChar(rows, CX + dx + 1, CY + 1, 'R');
    }
  },
  crossPitRockMix: (rows) => {
    setChar(rows, CX, CY, 'P');
    setChar(rows, CX - 2, CY, 'R');
    setChar(rows, CX + 2, CY, 'R');
    setChar(rows, CX, CY - 1, 'R');
    setChar(rows, CX, CY + 1, 'R');
  },
  sparseRocks: (rows) => {
    setChar(rows, CX - 4, CY, 'R');
    setChar(rows, CX + 4, CY, 'R');
  },
  bigCenterRock: (rows) => {
    setChar(rows, CX, CY, 'R');
    setChar(rows, CX - 1, CY, 'R');
    setChar(rows, CX + 1, CY, 'R');
  },
};

const PATTERN_NAMES = Object.keys(PATTERNS);

function buildNormalTemplates(count) {
  const templates = [];
  for (let i = 0; i < count; i++) {
    const patternName = PATTERN_NAMES[i % PATTERN_NAMES.length];
    const chapter = (i % 2) + 1; // alternate chapter 1 / chapter 2
    const rows = blankRows();
    PATTERNS[patternName](rows);
    templates.push({
      id: `core:normal-${String(i + 1).padStart(2, '0')}`,
      type: 'normal',
      chapter,
      weight: 1,
      difficulty: 1 + (i % 3),
      pattern: patternName,
      rows,
    });
  }
  return templates;
}

function writeTemplate(template) {
  const file = path.join(OUT_DIR, `${template.id.replace('core:', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(template, null, 2) + '\n', 'utf-8');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const normals = buildNormalTemplates(30);
normals.forEach(writeTemplate);

const specials = [
  { id: 'core:start-01', type: 'start', weight: 1, rows: blankRows() },
  { id: 'core:boss-01', type: 'boss', weight: 1, rows: (() => { const r = blankRows(); PATTERNS.fourCornerRocks(r); return r; })() },
  { id: 'core:boss-02', type: 'boss', weight: 1, rows: blankRows() },
  { id: 'core:treasure-01', type: 'treasure', weight: 1, rows: blankRows() },
  { id: 'core:treasure-02', type: 'treasure', weight: 1, rows: (() => { const r = blankRows(); PATTERNS.ringOfRocks(r); return r; })() },
  { id: 'core:shop-01', type: 'shop', weight: 1, rows: blankRows() },
  { id: 'core:shop-02', type: 'shop', weight: 1, rows: (() => { const r = blankRows(); PATTERNS.sparseRocks(r); return r; })() },
  { id: 'core:secret-01', type: 'secret', weight: 1, rows: blankRows() },
  { id: 'core:secret-02', type: 'secret', weight: 1, rows: (() => { const r = blankRows(); PATTERNS.bigCenterRock(r); return r; })() },
  { id: 'core:supersecret-01', type: 'supersecret', weight: 1, rows: blankRows() },
  // P2.6 special rooms — plain layouts; these room types are about a mechanic
  // (waves/spikes/a spiked door/machines/a heart-cost or free deal), not an
  // obstacle course, so one or two simple variants each is enough.
  { id: 'core:challenge-01', type: 'challenge', weight: 1, rows: blankRows() },
  { id: 'core:curse-01', type: 'curse', weight: 1, rows: (() => { const r = blankRows(); PATTERNS.sparseRocks(r); return r; })() },
  { id: 'core:sacrifice-01', type: 'sacrifice', weight: 1, rows: blankRows() },
  { id: 'core:arcade-01', type: 'arcade', weight: 1, rows: blankRows() },
  { id: 'core:devil-01', type: 'devil', weight: 1, rows: blankRows() },
  { id: 'core:angel-01', type: 'angel', weight: 1, rows: blankRows() },
];
specials.forEach(writeTemplate);

console.log(`Wrote ${normals.length + specials.length} room templates to ${OUT_DIR}`);
