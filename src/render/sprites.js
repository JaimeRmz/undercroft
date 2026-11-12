/**
 * Procedural vector sprites driven by JSON "sprite specs" (shapes/colors/eyes/
 * outline), per CLAUDE.md §2. computeSpriteDrawOps is pure data-in/data-out so
 * it's headlessly testable; executeDrawOps is the only part touching a canvas
 * context, exercised by the Playwright smoke test instead of unit tests.
 */

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
  tear: {
    shape: 'circle',
    radius: 6,
    fill: '#cfe8ff',
    outline: '#3a6a8a',
    outlineWidth: 1,
  },
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
  return ops;
}

/** Draws precomputed ops at (x, y), optionally tinted white (hit flash) and scaled. Canvas-only. */
export function executeDrawOps(ctx, ops, { x, y, scale = 1, flashWhite = false }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const op of ops) {
    const fill = flashWhite && op.fill ? '#ffffff' : op.fill;
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
    }
  }
  ctx.restore();
}

export function drawSprite(ctx, spec, params) {
  executeDrawOps(ctx, computeSpriteDrawOps(spec), params);
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const generatedSpecCache = new Map();

/**
 * Sprite spec for an enemy/boss entity. Uses a hand-authored SPRITES entry when
 * one exists; otherwise procedurally generates one from the def id (stable hue,
 * the entity's own collision radius, eyes) so EVERY registered enemy is visible.
 * Bosses get a thicker outline and bigger eyes so they read as bosses.
 */
export function resolveEnemySpec(entity) {
  if (SPRITES[entity.defId]) return SPRITES[entity.defId];
  const radius = Math.round(entity.radius ?? 14);
  const key = `${entity.defId}|${radius}|${entity.isBoss ? 'b' : 'e'}`;
  let spec = generatedSpecCache.get(key);
  if (spec) return spec;

  const hash = hashString(String(entity.defId));
  const hue = hash % 360;
  const rectLike = (hash >> 9) % 3 === 0;
  const eyeR = Math.max(1.6, radius * (entity.isBoss ? 0.16 : 0.14));
  const eyeDx = radius * 0.3;
  spec = {
    shape: rectLike ? 'rect' : 'circle',
    radius,
    width: radius * 1.8,
    height: radius * 1.8,
    fill: `hsl(${hue}, 45%, ${entity.isBoss ? 38 : 45}%)`,
    outline: `hsl(${hue}, 50%, 14%)`,
    outlineWidth: entity.isBoss ? 4 : 2,
    eyes: [
      { dx: -eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
      { dx: eyeDx, dy: -radius * 0.15, r: eyeR, fill: '#f5f0e0' },
      { dx: -eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
      { dx: eyeDx, dy: -radius * 0.15, r: eyeR * 0.5 },
    ],
  };
  generatedSpecCache.set(key, spec);
  return spec;
}
