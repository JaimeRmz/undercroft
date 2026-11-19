/**
 * Room templates: hand-authored ASCII layouts in JSON (CLAUDE.md §3), loaded
 * through the mod loader as the existing "room" content kind (id + type,
 * plus rows/weight/difficulty/chapter as extra data). A template's `rows`
 * is a 13x7 grid of characters; the border and door tiles are always owned
 * by Room itself, so templates only contribute interior obstacles/markers.
 */
import { TILE } from './room.js';

const CHAR_TO_TILE = {
  R: TILE.ROCK,
  P: TILE.PIT,
  M: TILE.MOUND, // destructible mound (P2.Q Q3a)
  T: TILE.TINTED_ROCK, // reward rock, bomb for a drop (P2.Q Q3a)
  S: TILE.SPIKE, // walkable floor hazard (P2.Q Q3b)
  F: TILE.FIREPLACE, // solid flame hazard (P2.Q Q3b)
};

/** Splits a template's rows into placeable tiles (rocks/pits) and other markers (spawn points, etc). */
export function parseTemplateRows(rows) {
  const tiles = [];
  const markers = [];
  rows.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      if (ch === '#' || ch === '.' || ch === ' ') continue;
      if (CHAR_TO_TILE[ch]) tiles.push({ tx, ty, type: CHAR_TO_TILE[ch] });
      else markers.push({ tx, ty, marker: ch });
    }
  });
  return { tiles, markers };
}

/** Applies a template's rocks/pits onto an already-built Room (border/doors untouched). Returns the template's markers. */
export function applyTemplateToRoom(room, template) {
  const { tiles, markers } = parseTemplateRows(template.rows);
  for (const { tx, ty, type } of tiles) {
    const existing = room.getTileType(tx, ty);
    if (existing === TILE.WALL || existing === TILE.DOOR) continue;
    if (type === TILE.ROCK) room.placeRock(tx, ty);
    else if (type === TILE.PIT) room.placePit(tx, ty);
    else if (type === TILE.MOUND) room.placeMound(tx, ty);
    else if (type === TILE.TINTED_ROCK) room.placeTintedRock(tx, ty);
    else if (type === TILE.SPIKE) room.placeSpike(tx, ty);
    else if (type === TILE.FIREPLACE) room.placeFireplace(tx, ty);
  }
  return markers;
}

/** Weighted-random pick among templates matching `type`, preferring ones tagged for `chapter` over chapter-agnostic ones. */
export function pickTemplate(templates, { type, chapter, rng }) {
  const matching = templates.filter((t) => t.type === type);
  if (matching.length === 0) return null;
  const chapterMatched = chapter == null ? [] : matching.filter((t) => t.chapter === chapter);
  const pool = chapterMatched.length > 0 ? chapterMatched : matching;
  return rng.weighted(pool.map((t) => ({ item: t, weight: t.weight ?? 1 })));
}
