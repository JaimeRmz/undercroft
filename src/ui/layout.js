/**
 * Screen layout in LOGICAL pixels (the canvas is drawn at 640x360 and then
 * integer-scaled to the window). The 13x7-tile room sits dead center; the HUD
 * lives only in the margins around it, so it can never cover the play area:
 *
 *   +--------------------------------------------------+  top band (40px):   hearts, floor info
 *   | left |                                   | right |  left (60px):       counters, stats
 *   | 60px |            ROOM 520x280           | 60px  |  right (60px):      minimap, active/trinket/consumable
 *   +--------------------------------------------------+  bottom band (40px): boss HP bar
 */
import { CONFIG } from '../core/config.js';

export const VIEW_W = 640;
export const VIEW_H = 360;

const roomW = CONFIG.ROOM_TILES_W * CONFIG.TILE_SIZE;
const roomH = CONFIG.ROOM_TILES_H * CONFIG.TILE_SIZE;

/** The play area in logical pixels. World (0,0) maps to (ROOM_RECT.x, ROOM_RECT.y). */
export const ROOM_RECT = {
  x: Math.floor((VIEW_W - roomW) / 2),
  y: Math.floor((VIEW_H - roomH) / 2),
  w: roomW,
  h: roomH,
};

/** HUD zones (all outside ROOM_RECT). */
export const ZONES = {
  top: { x: 0, y: 0, w: VIEW_W, h: ROOM_RECT.y },
  bottom: { x: 0, y: ROOM_RECT.y + ROOM_RECT.h, w: VIEW_W, h: VIEW_H - (ROOM_RECT.y + ROOM_RECT.h) },
  left: { x: 0, y: ROOM_RECT.y, w: ROOM_RECT.x, h: ROOM_RECT.h },
  right: { x: ROOM_RECT.x + ROOM_RECT.w, y: ROOM_RECT.y, w: VIEW_W - (ROOM_RECT.x + ROOM_RECT.w), h: ROOM_RECT.h },
};

/** True if the logical-space rect lies entirely outside the play area. */
export function isOutsideRoom(x, y, w, h) {
  return x + w <= ROOM_RECT.x || x >= ROOM_RECT.x + ROOM_RECT.w || y + h <= ROOM_RECT.y || y >= ROOM_RECT.y + ROOM_RECT.h;
}
