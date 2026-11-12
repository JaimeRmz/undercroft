/**
 * Pure HUD data model: turns run state into plain values the panels draw.
 * No canvas here, so every number/label on the HUD is unit-testable.
 */
import { pillDisplayName } from '../systems/pills.js';

const fmt = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '0.00');

/** Stats column rows, in display order. `tears` is shots per second as actually fired (1 / cooldown). */
export function computeStatRows(stats) {
  const cooldown = stats.fireCooldownSeconds;
  return [
    { key: 'damage', label: 'DMG', value: fmt(stats.damage) },
    { key: 'tears', label: 'TEARS', value: fmt(cooldown > 0 ? 1 / cooldown : 0) },
    { key: 'speed', label: 'SPEED', value: fmt(stats.clampedSpeed) },
    { key: 'range', label: 'RANGE', value: fmt(stats.range) },
    { key: 'shotSpeed', label: 'SHOT', value: fmt(stats.shotSpeed) },
    { key: 'luck', label: 'LUCK', value: fmt(stats.luck) },
  ];
}

/** Active item slot: null when none is held, else { id, name, charge, maxCharges, ready }. */
export function computeActiveSlot(inventory, getItemDef) {
  const active = inventory?.actives?.[0];
  if (!active) return null;
  return {
    id: active.id,
    name: getItemDef(active.id)?.name ?? active.id,
    charge: active.charge,
    maxCharges: active.maxCharges,
    ready: active.charge >= active.maxCharges,
  };
}

export function computeConsumableName(inventory, { getCardDef, getPillDef, pillIdentity }) {
  const held = inventory?.current;
  if (!held) return null;
  if (held.kind === 'card') return getCardDef(held.cardId)?.name ?? null;
  return pillDisplayName(held.pillColor, pillIdentity, getPillDef);
}

export function computeHudModel({ playerHealth, currency, stats, inventory, trinketInventory, consumableInventory, getItemDef, getCardDef, getPillDef, pillIdentity }) {
  return {
    health: playerHealth,
    counters: [
      { kind: 'coin', value: currency.coins },
      { kind: 'bomb', value: currency.bombs },
      { kind: 'key', value: currency.keys },
    ],
    stats: computeStatRows(stats),
    active: computeActiveSlot(inventory, getItemDef),
    trinket: trinketInventory?.current?.name ?? null,
    consumable: computeConsumableName(consumableInventory, { getCardDef, getPillDef, pillIdentity }),
  };
}

/** Wraps `text` into at most `maxLines` lines of ~`maxChars` chars on word boundaries, ellipsizing overflow. */
export function wrapLabel(text, maxChars = 12, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines).map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
  if (lines.length > maxLines) out[maxLines - 1] = `${out[maxLines - 1].replace(/…$/, '').slice(0, maxChars - 1)}…`;
  return out;
}
