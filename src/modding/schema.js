/**
 * Minimal declarative schema validation for content definitions. Every mod
 * definition is checked against the schema for its kind before it's registered;
 * failures are collected as { field, problem } so the loader can report
 * file + field + problem, never a stack trace (CLAUDE.md §4).
 */

/** A schema is { fieldName: { required, type, oneOf } }. Unknown extra fields are allowed. */
export const SCHEMAS = {
  item: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
    type: { required: true, oneOf: ['passive', 'active'] },
  },
  character: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
  },
  enemy: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
    hp: { required: true, type: 'number' },
  },
  boss: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
    hp: { required: true, type: 'number' },
    phases: { required: true, isArray: true },
  },
  room: {
    id: { required: true, type: 'string' },
    type: {
      required: true,
      oneOf: [
        'start', 'normal', 'treasure', 'shop', 'boss', 'secret', 'supersecret',
        'challenge', 'curse', 'sacrifice', 'arcade', 'vault', 'library', 'devil', 'angel',
      ],
    },
  },
  floor: {
    id: { required: true, type: 'string' },
    chapter: { required: true, type: 'number' },
  },
  pickup: {
    id: { required: true, type: 'string' },
    type: { required: true, type: 'string' },
  },
  card: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
  },
  pill: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
  },
  trinket: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
  },
  transformation: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
    setTag: { required: true, type: 'string' },
  },
  gamemode: {
    id: { required: true, type: 'string' },
    name: { required: true, type: 'string' },
  },
  synergy: {
    id: { required: true, type: 'string' },
    requires: { required: true, isArray: true },
  },
};

/** Validates `def` against `schema`; returns an array of { field, problem } (empty = valid). */
export function validateDefinition(def, schema) {
  const errors = [];
  if (def === null || typeof def !== 'object' || Array.isArray(def)) {
    return [{ field: '(root)', problem: 'definition must be a JSON object' }];
  }
  for (const [field, rule] of Object.entries(schema)) {
    const value = def[field];
    if (value === undefined || value === null) {
      if (rule.required) errors.push({ field, problem: `missing required field "${field}"` });
      continue;
    }
    if (rule.isArray && !Array.isArray(value)) {
      errors.push({ field, problem: `expected an array, got ${typeof value}` });
      continue;
    }
    if (rule.type && typeof value !== rule.type) {
      errors.push({ field, problem: `expected type ${rule.type}, got ${typeof value}` });
      continue;
    }
    if (rule.oneOf && !rule.oneOf.includes(value)) {
      errors.push({ field, problem: `expected one of [${rule.oneOf.join(', ')}], got "${value}"` });
    }
  }
  return errors;
}
