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
  INVULN_BLINK_FRAMES: 4, // the player sprite toggles faint/solid every this many frames while invulnerable
  ROOM_ENTRY_GRACE_SECONDS: 0.5, // enemies neither move nor attack for this long after the player enters a room
  ROOM_SOFTLOCK_TIMEOUT_SECONDS: 20, // [assumed] failsafe: force doors open if a room stays enemy-locked this long straight
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
  CHARGE_SHOT_MAX_SECONDS: 1.2, // [assumed] holding the charge-shot weapon type this long auto-fires at max power
  CHARGE_SHOT_MAX_DAMAGE_MULT: 3, // [assumed] damage multiplier at full charge (linear from 1x at 0 charge)
  CHARGE_SHOT_MAX_RADIUS_MULT: 1.5, // [assumed] visual/hitbox growth at full charge

  // Room clear reward roll (§3)
  ROOM_REWARD_NOTHING_THRESHOLD: 0.22,
  ROOM_REWARD_CARD_PILL_TRINKET_THRESHOLD: 0.3,
  ROOM_REWARD_CHEST_THRESHOLD: 0.95,

  // Floor gen
  SECRET_ROOM_LOOSEN_ATTEMPTS_1: 300,
  SECRET_ROOM_LOOSEN_ATTEMPTS_2: 600,
  SACRIFICE_ROOM_CHANCE: 1 / 7,
  SACRIFICE_ROOM_CHANCE_FULL_HEALTH: 1 / 3,
  CHALLENGE_ROOM_CHANCE_FLOOR2: 0.5, // [assumed] also used for every floor from 2 on, since CLAUDE.md only gives floor 2's rate
  CURSE_ROOM_CHANCE: 1 / 6, // [assumed] no canonical rate given
  ARCADE_ROOM_CHANCE: 1 / 8, // [assumed] no canonical rate given

  // Champions (CLAUDE.md §3: base ~5% chance, x2.6 HP always, one random secondary effect)
  CHAMPION_CHANCE: 0.05,
  CHAMPION_HP_MULT: 2.6,
  CHAMPION_SPEED_MULT: 1.3, // [assumed] the "faster" secondary effect
  CHAMPION_COINS_ON_HIT_VALUE: 1, // [assumed]

  // AI behavior archetypes (§3) — tunables shared by every enemy using that archetype;
  // per-enemy overrides come from the enemy's own JSON def, not here.
  WANDER_MIN_SECONDS: 1,
  WANDER_MAX_SECONDS: 2.5, // [assumed] slower direction changes than erratic_flier
  HOP_IDLE_SECONDS: 0.8, // [assumed]
  HOP_LEAP_SECONDS: 0.35,
  HOP_LEAP_SPEED_MULT: 3.5,
  DASH_ALIGN_TOLERANCE_PX: 16, // [assumed] how close to the player's row/column counts as "aligned"
  DASH_SPEED_MULT: 3.5,
  DASH_MIN_INTERVAL_SECONDS: 1.2, // [assumed] cooldown between dashes so it isn't a permanent beeline
  ENEMY_ATTACK_TELEGRAPH_SECONDS: 0.4, // P1.G6: minimum wind-up before any dangerous enemy attack (dash, turret shot, hop leap)
  FLEEING_SPAWNER_INTERVAL_SECONDS: 3, // [assumed]
  FLEEING_SPAWNER_MINION_HP: 1,
  FLEEING_SPAWNER_MAX_MINIONS: 3, // [assumed] caps total spawns per spawner so a room can't fill up forever
  HIDE_SECONDS: 1.2, // [assumed] hide-and-pop: time spent hidden/invulnerable
  POP_SECONDS: 0.8, // time spent popped up and shooting
  BURROW_SECONDS: 1.5, // [assumed] burrower: time spent underground (invulnerable, fast approach)
  SURFACE_SECONDS: 1, // time spent surfaced (vulnerable, still)
  FRONT_ARMOR_DAMAGE_MULT: 0.1, // [assumed] damage taken when hit from the armored-facing side
  BOUNCER_SPEED: 110, // [assumed]
  ORBITER_RADIUS: 90, // [assumed]
  ORBITER_ANGULAR_SPEED: 1.6, // rad/s [assumed]
  EXPLODER_RADIUS: 70, // [assumed]
  EXPLODER_DAMAGE_HALF_HEARTS: 2, // [assumed]
  SPLITTER_CHILD_COUNT: 2,
  SPLITTER_HP_FRACTION: 0.5,
  SPLITTER_RADIUS_FRACTION: 0.65,
  MIRROR_HOMING_FRACTION: 0.3, // [assumed] a pure velocity-copy would keep the relative offset constant forever (uncatchable); this blends in a slow pull toward the player

  // Boss status immunity
  BOSS_STATUS_IMMUNITY_SECONDS: 8,

  // Boss framework (§3 Bosses) — attack pattern tunables. [assumed] no canonical values exist for
  // this original engine; picked to read clearly as distinct, dodgeable attacks at 60 Hz.
  BOSS_HP_PER_STAGE_MULT: 0.5, // [assumed] +50% HP per floor stage beyond the first
  BOSS_PATTERN_DEFAULT_COOLDOWN_SECONDS: 1,
  BOSS_AIMED_BURST_SHOTS: 4,
  BOSS_AIMED_BURST_INTERVAL_SECONDS: 0.15,
  BOSS_RING_SHOT_COUNT: 12,
  BOSS_SPREAD_SHOT_COUNT: 5,
  BOSS_SPREAD_ARC_RADIANS: Math.PI / 3,
  BOSS_SPIRAL_DURATION_SECONDS: 1.5,
  BOSS_SPIRAL_INTERVAL_SECONDS: 0.08,
  BOSS_SPIRAL_TURN_RADIANS: 0.5,
  BOSS_CHARGE_SPEED_MULT: 4,
  BOSS_SLAM_RADIUS: 110,
  BOSS_SLAM_DAMAGE_HALF_HEARTS: 2,
  BOSS_SUMMON_COUNT: 2,
  BOSS_LASER_WIDTH_PX: 30,
  BOSS_LASER_DAMAGE_HALF_HEARTS: 2,
  BOSS_RAIN_DURATION_SECONDS: 1.5,
  BOSS_RAIN_INTERVAL_SECONDS: 0.2,

  // Game feel / VFX
  HIT_FLASH_SECONDS: 2 / 60, // enemies flash white for 2 frames on a heavy hit
  KNOCKBACK_DISTANCE_PX: 8, // [assumed] instant push-back applied to an enemy's position on a hit
  HITSTOP_FRAMES: 2, // [assumed] ~2-frame full-sim freeze on a killing blow
  PLAYER_KNOCKBACK_DISTANCE_PX: 14, // [assumed] instant push-back applied to the player when hurt (P2.Q Q2a)
  PLAYER_HURT_TINT_SECONDS: 0.35, // [assumed] brief red tint overlaid on the player on taking damage (P2.Q Q2a)
  ITEM_HOLD_SECONDS: 1, // the player holds a picked-up item overhead for this long (P2.Q Q2b)

  // Status effects on enemies (CLAUDE.md §3) — all [assumed], no canonical values given
  POISON_DURATION_SECONDS: 5,
  POISON_DPS: 2,
  BURN_DURATION_SECONDS: 3,
  BURN_DPS: 4,
  SLOW_DURATION_SECONDS: 4,
  SLOW_SPEED_MULT: 0.5,
  FREEZE_DURATION_SECONDS: 2.5,
  CHARM_DURATION_SECONDS: 6,
  FEAR_DURATION_SECONDS: 3,
  CONFUSE_DURATION_SECONDS: 4,
  CONFUSE_REDIRECT_SECONDS: 0.5, // how often a confused enemy picks a new random direction
  BOSS_STATUS_IMMUNITY_SECONDS: 8, // CLAUDE.md §3: "~8 seconds of status immunity after being afflicted"
  CHARM_ATTACK_COOLDOWN_TICKS: 30, // [assumed] half a second at 60Hz between a charmed enemy's attacks on others

  // Devil/angel deal rooms (§3: "chance builds from +35% for no red-heart damage during
  // the boss fight and +99% for none on the whole floor, drops after seeing one recently
  // (x0.25). Never on floor 1.") — base rate and the "recently" window are [assumed],
  // since CLAUDE.md doesn't give them; the two bonuses are given and used as written.
  DEAL_ROOM_BASE_CHANCE: 0.1,
  DEAL_ROOM_NO_BOSS_DAMAGE_BONUS: 0.35,
  DEAL_ROOM_NO_FLOOR_DAMAGE_CHANCE: 0.99,
  DEAL_ROOM_RECENT_MULT: 0.25,
  DEAL_ROOM_RECENT_FLOORS: 1, // "recently" = the immediately preceding floor
  SACRIFICE_PAYOUT_HITS: 3, // [assumed] spike touches needed per reward
  SACRIFICE_MAX_PAYOUTS: 3, // [assumed] caps farming a single sacrifice room visit
  CURSE_DOOR_DAMAGE_HALF_HEARTS: 1, // [assumed] "spiked door" damage, both entering and leaving
  HAZARD_CONTACT_DAMAGE_HALF_HEARTS: 1, // [assumed] spike/fire tile contact damage, gated by i-frames
  FIREPLACE_DROP_CHANCE: 0.4, // [assumed] chance an extinguished fireplace drops a pickup
  CHALLENGE_WAVE_INTERVAL_SECONDS: 0.5, // [assumed] pause between a wave clearing and the next one spawning
  ARCADE_SLOT_COST: 5, // [assumed] coins per pull

  // Familiars (§3: orbitals, followers that shoot, blue-fly style helpers) — all [assumed], no canonical values
  FAMILIAR_FOLLOW_EASE: 6, // per-second ease-toward-target rate for 'follow'/'hover' behaviors
  FAMILIAR_CONTACT_COOLDOWN_TICKS: 30, // half a second at 60Hz between an orbiting/hovering familiar's contact-damage hits
  FAMILIAR_DEFAULT_ORBIT_RADIUS_PX: 50,
  FAMILIAR_DEFAULT_ORBIT_SPEED_RAD_PER_SEC: 2,
  FAMILIAR_DEFAULT_FOLLOW_OFFSET_PX: -24, // hover/follow sit this far up-and-left of the player by default
};
