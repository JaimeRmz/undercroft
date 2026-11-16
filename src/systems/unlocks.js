/**
 * Unlocks/achievements (P2.10): data-driven conditions, checked once per
 * finished run (death or victory), that unlock an item or character for
 * every future run. Content lives in mods/core/unlocks/*.json as
 * `{ id, name, description, condition: {type, value?}, reward: {type, id} }`.
 *
 * `summary` is this run's end-of-run facts: `{ kills, floorsCleared, stage,
 * won }`. `meta` is the lifetime (cross-run) counters from
 * save.js's loadMetaStats/saveMetaStats, already updated with this run's
 * contribution before checkUnlocks runs, so a "totalRunsCompleted" condition
 * counts the just-finished run.
 */
export const UNLOCK_CONDITION_CHECKERS = {
  killsInRun: (condition, summary) => summary.kills >= condition.value,
  floorsClearedInRun: (condition, summary) => summary.floorsCleared >= condition.value,
  defeatFinalBoss: (_condition, summary) => !!summary.won,
  totalRunsCompleted: (condition, _summary, meta) => meta.totalRuns >= condition.value,
  totalKillsLifetime: (condition, _summary, meta) => meta.totalKills >= condition.value,
  deepestStageReached: (condition, _summary, meta) => meta.deepestStage >= condition.value,
  victoriesLifetime: (condition, _summary, meta) => meta.victories >= condition.value,
};

export function isConditionMet(condition, summary, meta) {
  return UNLOCK_CONDITION_CHECKERS[condition.type]?.(condition, summary, meta) ?? false;
}

/** Returns the unlock defs whose condition is newly met (reward not already in `unlockedIds`). Pure — does not mutate `unlockedIds`. */
export function checkUnlocks(unlockDefs, summary, meta, unlockedIds) {
  return unlockDefs.filter((def) => !unlockedIds.has(def.reward.id) && isConditionMet(def.condition, summary, meta));
}

/** Ids of every reward of `rewardType` ('item' | 'character') gated behind some unlock def. */
export function gatedRewardIds(unlockDefs, rewardType) {
  return unlockDefs.filter((d) => d.reward.type === rewardType).map((d) => d.reward.id);
}

/** A reward id is available if nothing gates it, or it's already in `unlockedIds`. */
export function isRewardUnlocked(id, unlockDefs, unlockedIds) {
  const isGated = unlockDefs.some((d) => d.reward.id === id);
  return !isGated || unlockedIds.has(id);
}
