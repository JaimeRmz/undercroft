/**
 * Procedural vector sprites driven by JSON "sprite specs" (shapes/colors/eyes/
 * outline), per CLAUDE.md §2. computeSpriteDrawOps is pure data-in/data-out so
 * it's headlessly testable; executeDrawOps is the only part touching a canvas
 * context, exercised by the Playwright smoke test instead of unit tests.
 */
import { accessoryOpsFor } from './enemyAccessories.js';
import { designOpsFor } from './enemyDesigns.js';

/** Built-in specs for the P0 vertical slice. Mods can supply their own via the same shape. */
export const SPRITES = {
  player: {
    shape: 'circle',
    radius: 14,
    fill: '#e8d9b0',
    outline: '#4a3a2a',
    outlineWidth: 2,
    // Baked eye offsets assume the head faces "up" (0,-1) by default; computeSpriteDrawOps
    // rotates them to the actual aim direction when a headAngle is supplied.
    eyeDefaultAngle: -Math.PI / 2,
    eyes: [
      { dx: -4, dy: -3, r: 2.2 },
      { dx: 4, dy: -3, r: 2.2 },
    ],
    // A subtle lighter patch toward whichever way the body is currently moving
    // (CLAUDE.md §3: "the body faces the movement direction").
    belly: { distanceFraction: 0.45, radius: 5, fill: '#f5ecd2' },
  },
  'core:chaser': {
    shape: 'circle',
    radius: 14,
    fill: '#8a3a4a',
    outline: '#3a1a22',
    outlineWidth: 2,
    eyes: [
      { dx: -3, dy: -2, r: 1.8 },
      { dx: 3, dy: -2, r: 1.8 },
    ],
  },
  'core:erratic-flier': {
    shape: 'circle',
    radius: 12,
    fill: '#4a6a8a',
    outline: '#1a2a3a',
    outlineWidth: 2,
    eyes: [
      { dx: -3, dy: -2, r: 1.6 },
      { dx: 3, dy: -2, r: 1.6 },
    ],
  },
  'core:turret': {
    shape: 'rect',
    width: 26,
    height: 26,
    fill: '#6a6a4a',
    outline: '#2a2a1a',
    outlineWidth: 2,
    eyes: [{ dx: 0, dy: -2, r: 2.4 }],
  },
  // Tears (player pale-blue, enemy hot red-orange) are drawn by src/render/tears.js,
  // which scales each droplet by its damage and draws an arc-height floor shadow —
  // things a static sprite spec can't express — so there's no 'tear' spec here.
};

function rotateVec(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Converts a sprite spec into a list of draw ops centered on the entity's local origin. Pure.
 * `headAngle` rotates the eyes away from the spec's baked `eyeDefaultAngle` (head aim direction);
 * `bodyAngle` places the optional `belly` patch toward the current movement direction.
 */
export function computeSpriteDrawOps(spec, { headAngle, bodyAngle } = {}) {
  const ops = [];
  // Shadow (P1.G5 "shadows on everything"): drawn first, beneath the body; opt out with spec.shadow = false.
  if (spec.shadow !== false && spec.radius) {
    ops.push({ op: 'circle', x: 0, y: spec.radius * 0.65, radius: spec.radius * 0.8, fill: 'rgba(0, 0, 0, 0.32)', skipFlash: true });
  }
  if (spec.glow) ops.push({ op: 'circle', x: 0, y: 0, radius: spec.radius + spec.glow.extra, fill: spec.glow.fill });
  if (spec.shape === 'circle') {
    ops.push({ op: 'circle', x: 0, y: 0, radius: spec.radius, fill: spec.fill, outline: spec.outline, outlineWidth: spec.outlineWidth });
  } else if (spec.shape === 'rect') {
    ops.push({
      op: 'rect',
      x: -spec.width / 2,
      y: -spec.height / 2,
      width: spec.width,
      height: spec.height,
      fill: spec.fill,
      outline: spec.outline,
      outlineWidth: spec.outlineWidth,
    });
  }

  if (spec.core) ops.push({ op: 'circle', x: 0, y: 0, radius: spec.radius * spec.core.radiusFraction, fill: spec.core.fill });

  if (spec.belly && bodyAngle !== undefined) {
    const dist = spec.radius * (spec.belly.distanceFraction ?? 0.4);
    ops.push({
      op: 'circle',
      x: Math.cos(bodyAngle) * dist,
      y: Math.sin(bodyAngle) * dist,
      radius: spec.belly.radius,
      fill: spec.belly.fill,
    });
  }

  const eyeRotation = headAngle !== undefined && spec.eyeDefaultAngle !== undefined ? headAngle - spec.eyeDefaultAngle : 0;
  for (const eye of spec.eyes ?? []) {
    const pos = eyeRotation ? rotateVec(eye.dx, eye.dy, eyeRotation) : { x: eye.dx, y: eye.dy };
    ops.push({ op: 'circle', x: pos.x, y: pos.y, radius: eye.r, fill: eye.fill ?? '#1a1a1a' });
  }

  // Archetype silhouette accessories (P1.G5), precomputed onto the spec by resolveEnemySpec:
  // wings/spikes/shell/etc. layered on top of the body so every archetype reads as distinct.
  if (spec.accessories) ops.push(...spec.accessories);

  return ops;
}

/**
 * Draws precomputed ops at (x, y), optionally tinted white (hit flash, skippable per-op via
 * `op.skipFlash` for things like shadows that shouldn't flash) and scaled — `scaleX`/`scaleY`
 * let a squash effect stretch/compress independently of the camera zoom (`scale`), which both
 * default to when not given. Canvas-only.
 */
export function executeDrawOps(ctx, ops, { x, y, scale = 1, scaleX, scaleY, flashWhite = false }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX ?? scale, scaleY ?? scale);
  for (const op of ops) {
    const fill = flashWhite && op.fill && !op.skipFlash ? '#ffffff' : op.fill;
    if (op.op === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (op.outline && !flashWhite) {
        ctx.lineWidth = op.outlineWidth ?? 1;
        ctx.strokeStyle = op.outline;
        ctx.stroke();
      }
    } else if (op.op === 'rect') {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(op.x, op.y, op.width, op.height);
      }
      if (op.outline && !flashWhite) {
        ctx.lineWidth = op.outlineWidth ?? 1;
        ctx.strokeStyle = op.outline;
        ctx.strokeRect(op.x, op.y, op.width, op.height);
      }
    } else if (op.op === 'polygon') {
      ctx.beginPath();
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (op.outline && !flashWhite) {
        ctx.lineWidth = op.outlineWidth ?? 1;
        ctx.strokeStyle = op.outline;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawSprite(ctx, spec, params) {
  executeDrawOps(ctx, computeSpriteDrawOps(spec), params);
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The body color an enemy renders with, used to tint its death burst/splat so
 * each enemy dies in its own color (P2.Q Q4a). Mirrors resolveEnemySpec: a
 * hand-authored spec's fill, else the generated hsl() derived from the defId hash.
 */
export function enemyBodyColor(entity) {
  const base = SPRITES[entity?.defId];
  if (base?.fill) return base.fill;
  const hue = hashString(String(entity?.defId)) % 360;
  return `hsl(${hue}, 45%, 45%)`;
}

const generatedSpecCache = new Map();

/** Small satellite circles around a boss's main body, one per phase it has left — "bosses large and multi-part" (P1.G5), and a readable cue of how many phases remain. */
function bossPartOps(radius, fill, outline, remainingPhases) {
  const count = Math.max(0, Math.min(3, remainingPhases - 1));
  const ops = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4;
    ops.push({ op: 'circle', x: Math.cos(angle) * radius * 1.2, y: Math.sin(angle) * radius * 1.2, radius: radius * 0.4, fill, outline, outlineWidth: 2 });
  }
  return ops;
}

/**
 * Sprite spec for an enemy/boss entity. Uses a hand-authored SPRITES entry when
 * one exists; otherwise procedurally generates one from the def id (stable hue,
 * the entity's own collision radius, eyes) so EVERY registered enemy is visible.
 * Bosses get a thicker outline, bigger eyes and multi-part satellite accessories
 * (P1.G5) so they read as large and composite. A hand-authored or generated
 * base always gets an archetype silhouette accessory layered on top (wings,
 * spikes, shell, ...) so no enemy reads as a plain recolored circle.
 */
export function resolveEnemySpec(entity) {
  const radius = Math.round(entity.radius ?? 14);

  if (SPRITES[entity.defId]) {
    const base = SPRITES[entity.defId];
    const baseRadius = base.radius ?? radius;
    const key = `hand|${entity.defId}`;
    let spec = generatedSpecCache.get(key);
    if (!spec) {
      spec = {
        ...base,
        radius: baseRadius,
        // Q4a mouth/design ops drawn under the archetype accessory so facial features read first.
        accessories: [
          ...designOpsFor(entity.defId, { radius: baseRadius }),
          ...accessoryOpsFor(entity.defId, { radius: baseRadius, fill: base.fill, outline: base.outline }),
        ],
      };
      generatedSpecCache.set(key, spec);
    }
    return spec;
  }

  const hash = hashString(String(entity.defId));
  const hue = hash % 360;
  const rectLike = (hash >> 9) % 3 === 0;
  const eyeR = Math.max(1.6, radius * (entity.isBoss ? 0.16 : 0.14));
  const eyeDx = radius * 0.3;
  const fill = `hsl(${hue}, 45%, ${entity.isBoss ? 38 : 45}%)`;
  const outline = `hsl(${hue}, 50%, 14%)`;
  const designOps = designOpsFor(entity.defId, { radius });
  const accessories = [...designOps, ...accessoryOpsFor(entity.defId, { radius, fill, outline })];

  if (entity.isBoss) {
    // Bosses vary by current phase, so they're recomputed fresh rather than cached by defId.
    const remainingPhases = Math.max(1, (entity.phases?.length ?? 1) - (entity.currentPhaseIndex ?? 0));
    return {
      shape: rectLike ? 'rect' : 'circle',
      radius,
      width: radius * 1.8,
      height: radius * 1.8,
      fill,
      outline,
      outlineWidth: 4,
      eyes: [
        { dx: -eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
        { dx: eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
        { dx: -eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
        { dx: eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
      ],
      accessories: [...accessories, ...bossPartOps(radius, fill, outline, remainingPhases)],
    };
  }

  const key = `${entity.defId}|${radius}|e`;
  let spec = generatedSpecCache.get(key);
  if (spec) return spec;

  spec = {
    shape: rectLike ? 'rect' : 'circle',
    radius,
    width: radius * 1.8,
    height: radius * 1.8,
    fill,
    outline,
    outlineWidth: 2,
    eyes: [
      { dx: -eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
      { dx: eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
      { dx: -eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
      { dx: eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
    ],
    accessories,
  };
  generatedSpecCache.set(key, spec);
  return spec;
}

/**
 * Sprite spec for a familiar (P2.4). Procedurally generated the same way an
 * unauthored enemy is, but biased into a blue-green hue band (rather than the
 * full 0-360 range enemies use) so a familiar reads as "on your side" at a
 * glance, never coinciding with an enemy's color.
 */
export function resolveFamiliarSpec(entity) {
  const radius = Math.round(entity.radius ?? 8);
  const key = `familiar|${entity.defId}|${radius}`;
  let spec = generatedSpecCache.get(key);
  if (spec) return spec;

  const hash = hashString(String(entity.defId));
  const hue = 180 + (hash % 80); // [180, 260): cyan through blue-violet, distinct from the enemy hue range
  const eyeR = Math.max(1.2, radius * 0.22);
  spec = {
    shape: 'circle',
    radius,
    fill: `hsl(${hue}, 55%, 60%)`,
    outline: `hsl(${hue}, 50%, 25%)`,
    outlineWidth: 1.5,
    eyes: [
      { dx: -radius * 0.35, dy: -radius * 0.1, r: eyeR },
      { dx: radius * 0.35, dy: -radius * 0.1, r: eyeR },
    ],
  };
  generatedSpecCache.set(key, spec);
  return spec;
}
