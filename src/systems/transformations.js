/**
 * Transformations (CLAUDE.md §3): collecting 3 different items that share a
 * set tag grants a transformation (flight, a costume tint, and a special
 * effect). Multiple transformations stack, and once granted a transformation
 * never turns off (duplicates of the same item still only count once toward
 * the 3, since `heldItemIds` is already a de-duplicated set — the reference
 * game's own rule). Mirrors synergies.js's "condition over held items -> a
 * one-shot effect" shape exactly, down to reusing its held-items helper and
 * effect-bundle applier, since both are the same kind of rule.
 */
import { heldItemIds, applyEffectBundle } from './synergies.js';

const SET_TAG_THRESHOLD = 3;

/**
 * Checks every transformation not yet active; if 3+ distinct held items carry
 * its `setTag` (via `getItemDef(id).sets`), applies its effect bundle, grants
 * flight and/or a costume tint onto the player, and marks it active so it
 * never re-checks (and never turns back off, even if an item is later lost).
 * Returns the list of transformation ids that just activated.
 */
export function checkTransformations(inventory, stats, playerHealth, player, transformationDefs, getItemDef, activeIds) {
  const held = heldItemIds(inventory);
  const justActivated = [];

  for (const def of transformationDefs) {
    if (activeIds.has(def.id)) continue;

    let taggedCount = 0;
    for (const id of held) {
      if (getItemDef(id)?.sets?.includes(def.setTag)) taggedCount++;
      if (taggedCount >= SET_TAG_THRESHOLD) break;
    }
    if (taggedCount < SET_TAG_THRESHOLD) continue;

    applyEffectBundle(stats, playerHealth, player, def.effect);
    if (player) {
      if (def.grantsFlight) player.flying = true;
      if (def.costumeColor) player.transformCostumes = [...(player.transformCostumes ?? []), def.costumeColor];
    }

    activeIds.add(def.id);
    justActivated.push(def.id);
  }

  return justActivated;
}
