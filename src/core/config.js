/**
 * Central tunables. Magic numbers belong here or in content data, never scattered
 * in system code (CLAUDE.md §6). Formulas come from §3 of CLAUDE.md.
 */
export const CONFIG = {
  // Simulation
  TICK_RATE: 60,
  TICK_STEP: 1 / 60,
  MAX_FRAME_TIME: 0.25, // clamp to avoid spiral-of-death on tab-resume

  // Room geometry
  ROOM_TILES_W: 13,
  ROOM_TILES_H: 7,
  TILE_SIZE: 40, // px per tile at 1x camera zoom

  // Health
  MAX_HEART_CONTAINERS: 12, // in halves: 24
  INVULN_FRAMES: 60, // [assumed] ~1s at 60Hz, with blinking
  CONTACT_DAMAGE_HALF_HEARTS: 1, // most enemy contact/projectile damage
  CHAPTER4_CONTACT_DAMAGE_HALF_HEARTS: 2, // chapter 4+ enemies deal a full heart

  // Stats formulas
  BASE_DAMAGE: 3.5,
  BASE_TEAR_DELAY_AT_ZERO: 10,
  MIN_TEAR_DELAY: 1,
  SOFT_CAP_TEAR_DELAY_FLOOR: 5,
  BASE_RANGE_TILES: 6.5, // [assumed]
  BASE_SHOT_SPEED: 1.0,
  BASE_SPEED: 1.0,
  MAX_SPEED: 2.0,
  MIN_SPEED: 0.1,
  BASE_LUCK: 0,
  SHOT_INHERITS_PLAYER_VELOCITY: 0.3, // [assumed]

  // Movement feel
  PLAYER_ACCEL_FRAMES: 3.5, // frames to reach full speed [assumed within 3-4 frame spec]
  PLAYER_FRICTION_FRAMES: 2.5,
  PLAYER_RADIUS: 12, // px
  PLAYER_BASE_SPEED_PX_PER_SEC: 180, // [assumed] px/s at speed stat = 1.0 (4.5 tiles/s at TILE_SIZE 40)

  // Tears / projectiles
  TEAR_RADIUS: 6, // px
  TEAR_BASE_SPEED_PX_PER_SEC: 300, // [assumed] px/s at shotSpeed stat = 1.0
  TEAR_ARC_HEIGHT: 20, // [assumed] px, visual arc amplitude over the shot's travel

  // Room clear reward roll (§3)
  ROOM_REWARD_NOTHING_THRESHOLD: 0.22,
  ROOM_REWARD_CARD_PILL_TRINKET_THRESHOLD: 0.3,
  ROOM_REWARD_CHEST_THRESHOLD: 0.95,

  // Floor gen
  SECRET_ROOM_LOOSEN_ATTEMPTS_1: 300,
  SECRET_ROOM_LOOSEN_ATTEMPTS_2: 600,
  SACRIFICE_ROOM_CHANCE: 1 / 7,
  SACRIFICE_ROOM_CHANCE_FULL_HEALTH: 1 / 3,
  CHALLENGE_ROOM_CHANCE_FLOOR2: 0.5,

  // Champions
  CHAMPION_CHANCE: 0.05,
  CHAMPION_HP_MULT: 2.6,

  // Boss status immunity
  BOSS_STATUS_IMMUNITY_SECONDS: 8,
};
