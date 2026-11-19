/**
 * Decorative floor props (P2.Q Q3c): purely cosmetic dressing scattered across
 * plain floor tiles so a room reads as a lived-in place, not a bare grid. Props
 * never collide, never hurt, and aren't part of the Room model at all — they're
 * derived deterministically from a hash of the tile position, so the same tile
 * always shows the same prop (stable across frames and saves) without storing
 * anything. Each chapter has its own small prop set for a distinct identity.
 */

// A tiny deterministic hash of a tile coordinate → [0, 1).
function tileHash(tx, ty, salt) {
  let h = (tx * 73856093) ^ (ty * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 10000) / 10000;
}

/** One prop drawer per chapter "style". Each draws a small, subtle mark centered at (cx, cy). */
const PROP_STYLES = {
  // Chapter 1 — old cellars: pale cracks and loose pebbles.
  1: [
    (ctx, cx, cy, s) => { // crack
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.2);
      ctx.lineTo(cx, cy + s * 0.05);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.1);
      ctx.stroke();
    },
    (ctx, cx, cy, s) => { // pebble
      ctx.fillStyle = 'rgba(120,112,100,0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    },
  ],
  // Chapter 2 — overgrown: moss tufts and little mushrooms.
  2: [
    (ctx, cx, cy, s) => { // moss
      ctx.fillStyle = 'rgba(90,150,90,0.35)';
      for (const dx of [-0.2, 0, 0.2]) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    (ctx, cx, cy, s) => { // mushroom
      ctx.fillStyle = 'rgba(200,180,160,0.5)';
      ctx.fillRect(cx - s * 0.03, cy, s * 0.06, s * 0.15);
      ctx.fillStyle = 'rgba(180,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.12, Math.PI, 0);
      ctx.fill();
    },
  ],
  // Chapter 3 — scorched: embers and ash smudges.
  3: [
    (ctx, cx, cy, s) => { // ember glow
      ctx.fillStyle = 'rgba(220,120,60,0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    },
    (ctx, cx, cy, s) => { // ash smudge
      ctx.fillStyle = 'rgba(20,16,16,0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    },
  ],
  // Chapter 4 — frozen depths: frost stars and crystal flecks.
  4: [
    (ctx, cx, cy, s) => { // frost star
      ctx.strokeStyle = 'rgba(170,200,230,0.5)';
      ctx.lineWidth = 1;
      for (let a = 0; a < Math.PI; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * s * 0.2, cy - Math.sin(a) * s * 0.2);
        ctx.lineTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2);
        ctx.stroke();
      }
    },
    (ctx, cx, cy, s) => { // crystal fleck
      ctx.fillStyle = 'rgba(150,190,220,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.15);
      ctx.lineTo(cx + s * 0.08, cy);
      ctx.lineTo(cx, cy + s * 0.15);
      ctx.lineTo(cx - s * 0.08, cy);
      ctx.closePath();
      ctx.fill();
    },
  ],
  // Chapter 5 — the unmade: faint runes and void motes.
  5: [
    (ctx, cx, cy, s) => { // rune ring
      ctx.strokeStyle = 'rgba(180,120,210,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2);
      ctx.stroke();
    },
    (ctx, cx, cy, s) => { // void mote
      ctx.fillStyle = 'rgba(90,40,120,0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
    },
  ],
};

const PROP_DENSITY = 0.14; // fraction of plain floor tiles that get a prop

/**
 * Draws decorative props on the plain floor tiles of `room`. `isFloorTile(tx,ty)`
 * reports whether a tile should be dressed (a plain floor, not an obstacle/door).
 * `toScreen(worldX, worldY)` maps world to screen, `size` is the on-screen tile size.
 */
export function drawFloorProps(ctx, room, { isFloorTile, toScreen, size, chapter = 1 }) {
  const styles = PROP_STYLES[chapter] ?? PROP_STYLES[1];
  const tileSize = room.world.tileGrid.tileSize;
  for (let ty = 1; ty < room.heightTiles - 1; ty++) {
    for (let tx = 1; tx < room.widthTiles - 1; tx++) {
      if (!isFloorTile(tx, ty)) continue;
      if (tileHash(tx, ty, 1) >= PROP_DENSITY) continue;
      const style = styles[Math.floor(tileHash(tx, ty, 2) * styles.length)];
      // Jitter the prop off tile-center so the dressing doesn't look grid-locked.
      const jx = (tileHash(tx, ty, 3) - 0.5) * tileSize * 0.5;
      const jy = (tileHash(tx, ty, 4) - 0.5) * tileSize * 0.5;
      const screen = toScreen((tx + 0.5) * tileSize + jx, (ty + 0.5) * tileSize + jy);
      style(ctx, screen.x, screen.y, size);
    }
  }
}
