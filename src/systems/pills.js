/**
 * Pills: per-run random color->effect mapping + identification (CLAUDE.md
 * §3). Colors are purely cosmetic container ids — which effect a color
 * produces is shuffled fresh at the start of every run and stays unknown
 * ("???") until that color is used for the first time, after which its real
 * effect name is revealed for the rest of the run.
 */
import { applyEffects } from './effects.js';

/** [assumed] CLAUDE.md says "about 13 colors"; 15 here to pair 1:1 with the 15 pill effects below. */
export const PILL_COLORS = [
  'red', 'blue', 'yellow', 'white', 'gray', 'black', 'purple', 'orange',
  'pink', 'teal', 'green', 'maroon', 'navy', 'gold', 'silver',
];

/** Shuffles the given effect ids onto PILL_COLORS for one run, and tracks which colors have been identified. */
export class PillIdentity {
  constructor(effectIds, rng) {
    const shuffled = rng.shuffle([...effectIds]);
    this.colorToEffectId = new Map(PILL_COLORS.map((color, i) => [color, shuffled[i % shuffled.length]]));
    this.identifiedColors = new Set();
  }

  effectIdForColor(color) {
    return this.colorToEffectId.get(color);
  }

  isIdentified(color) {
    return this.identifiedColors.has(color);
  }

  identify(color) {
    this.identifiedColors.add(color);
  }
}

/** Display label for a pill pickup/banner: real name once identified, otherwise "??? Pill (color)". */
export function pillDisplayName(color, identity, getPillDef) {
  if (identity.isIdentified(color)) {
    const def = getPillDef(identity.effectIdForColor(color));
    return def?.name ?? '??? Pill';
  }
  return `??? Pill (${color})`;
}

/** Resolves a color to its effect def, applies it, and identifies the color. Returns the def used (or null if unknown). */
export function usePill(color, identity, getPillDef, ctx) {
  const effectId = identity.effectIdForColor(color);
  const def = effectId ? getPillDef(effectId) : null;
  identity.identify(color);
  if (!def) return null;
  applyEffects(def.effects, ctx);
  ctx.events?.emit('pill:used', { color, id: def.id, name: def.name });
  return def;
}
