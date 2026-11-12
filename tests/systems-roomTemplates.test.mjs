import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplateRows, applyTemplateToRoom, pickTemplate } from '../src/systems/roomTemplates.js';
import { Room, TILE } from '../src/systems/room.js';
import { Rng } from '../src/core/rng.js';

const SAMPLE_ROWS = [
  '#############',
  '#...........#',
  '#...R.....P.#',
  '#...........#',
  '#.....E.....#',
  '#...........#',
  '#############',
];

test('parseTemplateRows extracts rock/pit tiles and leaves other symbols as markers', () => {
  const { tiles, markers } = parseTemplateRows(SAMPLE_ROWS);
  assert.ok(tiles.some((t) => t.tx === 4 && t.ty === 2 && t.type === TILE.ROCK));
  assert.ok(tiles.some((t) => t.tx === 10 && t.ty === 2 && t.type === TILE.PIT));
  assert.ok(markers.some((m) => m.tx === 6 && m.ty === 4 && m.marker === 'E'));
});

test('applyTemplateToRoom places rocks/pits and returns markers, without touching doors or border', () => {
  const room = new Room();
  const markers = applyTemplateToRoom(room, { rows: SAMPLE_ROWS });
  assert.equal(room.getTileType(4, 2), TILE.ROCK);
  assert.equal(room.getTileType(10, 2), TILE.PIT);
  assert.equal(markers.length, 1);
  // doors remain whatever Room itself set them to, template never overwrites a door tile
  const northDoor = room.doors.get('north');
  assert.equal(room.getTileType(northDoor.tx, northDoor.ty), TILE.DOOR);
});

test('applyTemplateToRoom never overwrites a door even if the template marks that cell as a rock', () => {
  const room = new Room();
  const northDoor = room.doors.get('north');
  const rows = SAMPLE_ROWS.slice();
  // Put a rock character directly on top of the north door's column in row 0 is border anyway;
  // instead simulate a conflicting template by rock-marking the door's own tile position.
  const rowChars = rows[northDoor.ty].split('');
  rowChars[northDoor.tx] = 'R';
  rows[northDoor.ty] = rowChars.join('');
  applyTemplateToRoom(room, { rows });
  assert.equal(room.getTileType(northDoor.tx, northDoor.ty), TILE.DOOR);
});

test('pickTemplate filters by type and prefers chapter-matching templates over chapter-agnostic ones', () => {
  const templates = [
    { id: 'a', type: 'normal', chapter: 1, weight: 1 },
    { id: 'b', type: 'normal', chapter: 2, weight: 1 },
    { id: 'c', type: 'treasure', chapter: 1, weight: 1 },
  ];
  const rng = new Rng('pick-test');
  for (let i = 0; i < 20; i++) {
    const picked = pickTemplate(templates, { type: 'normal', chapter: 1, rng });
    assert.equal(picked.id, 'a');
  }
});

test('pickTemplate falls back to chapter-agnostic templates when none match the chapter', () => {
  const templates = [{ id: 'a', type: 'normal', weight: 1 }];
  const rng = new Rng('pick-fallback');
  const picked = pickTemplate(templates, { type: 'normal', chapter: 5, rng });
  assert.equal(picked.id, 'a');
});

test('pickTemplate returns null when nothing matches the requested type', () => {
  const rng = new Rng('pick-none');
  assert.equal(pickTemplate([{ id: 'a', type: 'boss' }], { type: 'shop', rng }), null);
});

test('pickTemplate respects weight (heavier templates chosen far more often)', () => {
  const templates = [
    { id: 'common', type: 'normal', weight: 9 },
    { id: 'rare', type: 'normal', weight: 1 },
  ];
  const rng = new Rng('pick-weight');
  const counts = { common: 0, rare: 0 };
  for (let i = 0; i < 1000; i++) counts[pickTemplate(templates, { type: 'normal', rng }).id]++;
  assert.ok(counts.common > counts.rare * 4);
});
