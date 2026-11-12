/**
 * Cards/runes: one-shot effects fired from the consumable slot (CLAUDE.md §3).
 * Unlike pills, a card's name/effect is always known up front — no
 * identification step.
 */
import { applyEffects } from './effects.js';

/** Applies every effect in `def.effects`, in order, and emits 'card:used'. */
export function useCard(def, ctx) {
  applyEffects(def.effects, ctx);
  ctx.events?.emit('card:used', { id: def.id, name: def.name });
}
