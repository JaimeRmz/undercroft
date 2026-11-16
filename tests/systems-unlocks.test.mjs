import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConditionMet, checkUnlocks, gatedRewardIds, isRewardUnlocked } from '../src/systems/unlocks.js';
import { createMemoryStorage, loadMetaStats, saveMetaStats } from '../src/systems/save.js';

const DEFAULT_META = { totalRuns: 0, totalKills: 0, totalFloorsCleared: 0, deepestStage: 0, victories: 0 };

const UNLOCKS = [
  { id: 'u-kills', name: 'Killer', condition: { type: 'killsInRun', value: 15 }, reward: { type: 'character', id: 'char-a' } },
  { id: 'u-floors', name: 'Delver', condition: { type: 'floorsClearedInRun', value: 2 }, reward: { type: 'item', id: 'item-a' } },
  { id: 'u-final', name: 'Victor', condition: { type: 'defeatFinalBoss' }, reward: { type: 'character', id: 'char-b' } },
  { id: 'u-runs', name: 'Veteran', condition: { type: 'totalRunsCompleted', value: 3 }, reward: { type: 'character', id: 'char-c' } },
  { id: 'u-lifetime-kills', name: 'Legend', condition: { type: 'totalKillsLifetime', value: 50 }, reward: { type: 'item', id: 'item-b' } },
  { id: 'u-deepest', name: 'Spelunker', condition: { type: 'deepestStageReached', value: 9 }, reward: { type: 'item', id: 'item-c' } },
  { id: 'u-victories', name: 'Champion', condition: { type: 'victoriesLifetime', value: 2 }, reward: { type: 'item', id: 'item-d' } },
];

test('isConditionMet checks each condition type against the right source (run summary vs. lifetime meta)', () => {
  const summary = { kills: 20, floorsCleared: 1, stage: 3, won: false };
  const meta = { ...DEFAULT_META, totalRuns: 5, totalKills: 60, deepestStage: 9, victories: 2 };

  assert.equal(isConditionMet({ type: 'killsInRun', value: 15 }, summary, meta), true);
  assert.equal(isConditionMet({ type: 'killsInRun', value: 25 }, summary, meta), false);
  assert.equal(isConditionMet({ type: 'floorsClearedInRun', value: 2 }, summary, meta), false);
  assert.equal(isConditionMet({ type: 'defeatFinalBoss' }, summary, meta), false);
  assert.equal(isConditionMet({ type: 'defeatFinalBoss' }, { ...summary, won: true }, meta), true);
  assert.equal(isConditionMet({ type: 'totalRunsCompleted', value: 3 }, summary, meta), true);
  assert.equal(isConditionMet({ type: 'totalKillsLifetime', value: 50 }, summary, meta), true);
  assert.equal(isConditionMet({ type: 'deepestStageReached', value: 9 }, summary, meta), true);
  assert.equal(isConditionMet({ type: 'victoriesLifetime', value: 2 }, summary, meta), true);
});

test('isConditionMet returns false for an unknown condition type instead of throwing', () => {
  assert.equal(isConditionMet({ type: 'notARealCondition', value: 1 }, {}, DEFAULT_META), false);
});

test('checkUnlocks returns only the defs whose condition is newly met, and never mutates unlockedIds', () => {
  const summary = { kills: 20, floorsCleared: 3, stage: 4, won: false };
  const meta = { ...DEFAULT_META };
  const unlockedIds = new Set();

  const newly = checkUnlocks(UNLOCKS, summary, meta, unlockedIds);
  const newlyIds = newly.map((u) => u.id).sort();
  assert.deepEqual(newlyIds, ['u-floors', 'u-kills'].sort());
  assert.equal(unlockedIds.size, 0, 'checkUnlocks must be pure and not mutate unlockedIds itself');
});

test('checkUnlocks never re-returns an unlock already in unlockedIds, even if its condition is still met', () => {
  const summary = { kills: 20, floorsCleared: 0, stage: 1, won: false };
  const unlockedIds = new Set(['char-a']); // reward of u-kills already unlocked
  const newly = checkUnlocks(UNLOCKS, summary, DEFAULT_META, unlockedIds);
  assert.ok(!newly.some((u) => u.id === 'u-kills'));
});

test('gatedRewardIds returns only reward ids of the requested type', () => {
  assert.deepEqual(gatedRewardIds(UNLOCKS, 'character').sort(), ['char-a', 'char-b', 'char-c'].sort());
  assert.deepEqual(gatedRewardIds(UNLOCKS, 'item').sort(), ['item-a', 'item-b', 'item-c', 'item-d'].sort());
});

test('isRewardUnlocked: an id with no gating unlock def is always available; a gated one needs unlockedIds to contain it', () => {
  assert.equal(isRewardUnlocked('ungated-item', UNLOCKS, new Set()), true);
  assert.equal(isRewardUnlocked('char-a', UNLOCKS, new Set()), false);
  assert.equal(isRewardUnlocked('char-a', UNLOCKS, new Set(['char-a'])), true);
});

test('loadMetaStats/saveMetaStats round trip through a storage adapter, defaulting to zeros when nothing is saved', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadMetaStats(storage), DEFAULT_META);
  const updated = { totalRuns: 4, totalKills: 83, totalFloorsCleared: 10, deepestStage: 7, victories: 1 };
  saveMetaStats(storage, updated);
  assert.deepEqual(loadMetaStats(storage), updated);
});

test('loadMetaStats fills in any missing fields from a partial/older save with defaults', () => {
  const storage = createMemoryStorage();
  storage.setItem('undercroft:save:metaStats', JSON.stringify({ totalRuns: 2 }));
  assert.deepEqual(loadMetaStats(storage), { ...DEFAULT_META, totalRuns: 2 });
});
