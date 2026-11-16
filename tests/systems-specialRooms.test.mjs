import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { Room } from '../src/systems/room.js';
import { createPlayer } from '../src/systems/player.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { Stats } from '../src/systems/stats.js';
import { Health, tickInvuln } from '../src/systems/health.js';
import { Currency } from '../src/systems/pickups.js';
import { buildItemPools } from '../src/systems/items.js';
import { Rng } from '../src/core/rng.js';
import {
  applyCurseDoorDamage,
  spawnSacrificeSpike,
  resolveSacrificeSpikes,
  isAtFullRedHealth,
  setChallengeWaves,
  updateChallengeRoom,
  spawnSlotMachine,
  spawnFortuneMachine,
  resolveArcadeMachines,
} from '../src/systems/specialRooms.js';
import { ROOM_TYPE } from '../src/systems/floorgen.js';
import { CONFIG } from '../src/core/config.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 0, radius: 14, behavior: 'chase' };

test('isAtFullRedHealth is true only when red === redMax, regardless of soul/black hearts', () => {
  const full = new Health({ redMax: 6 });
  assert.ok(isAtFullRedHealth(full));
  full.red = 4;
  assert.ok(!isAtFullRedHealth(full));
});

test('applyCurseDoorDamage deals damage for a curse room on either side of the crossing, and none for a normal crossing', () => {
  const health = new Health({ redMax: 6 });
  applyCurseDoorDamage(health, { leavingType: ROOM_TYPE.NORMAL, enteringType: ROOM_TYPE.NORMAL }, {});
  assert.equal(health.red, 6);

  applyCurseDoorDamage(health, { leavingType: ROOM_TYPE.NORMAL, enteringType: ROOM_TYPE.CURSE }, {});
  assert.equal(health.red, 5);

  tickInvuln(health, 5); // clear i-frames from the first hit — this is a separate door crossing, not a double-dip on the same one
  applyCurseDoorDamage(health, { leavingType: ROOM_TYPE.CURSE, enteringType: ROOM_TYPE.NORMAL }, {});
  assert.equal(health.red, 4, 'leaving a curse room should also deal damage');
});

test('a sacrifice spike damages the player on touch, on a cooldown, and pays out every SACRIFICE_PAYOUT_HITS hits up to SACRIFICE_MAX_PAYOUTS', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const playerHealth = new Health({ redMax: 12 });
  const spike = spawnSacrificeSpike(world, { x: 0, y: 0 }); // starts overlapping the player
  const rng = new Rng('sacrifice-test');
  // Non-empty trinket/card pools so a payout always spawns something, regardless of which reward category the rng picks.
  const trinketPools = buildItemPools([{ id: 'test:trinket', pools: ['treasure'] }]);
  const cardPools = buildItemPools([{ id: 'test:card', pools: ['treasure'] }]);

  for (let i = 0; i < CONFIG.SACRIFICE_PAYOUT_HITS; i++) {
    resolveSacrificeSpikes(world, player, { playerHealth, rng, trinketPools, cardPools });
    for (let j = 0; j < 31; j++) resolveSacrificeSpikes(world, player, { playerHealth, rng, trinketPools, cardPools }); // burn through the spike's own hit cooldown
    tickInvuln(playerHealth, 2); // also clear the player's post-damage i-frames, same as main.js's per-tick tickInvuln call
  }
  assert.equal(spike.hits, 0, 'hit counter should reset after a payout');
  assert.equal(spike.payouts, 1);
  assert.ok(playerHealth.red < 12, 'the spike should have dealt real damage');
  assert.ok(world.entities.all().some((e) => e.type === 'pickup' || e.type === 'trinketPickup' || e.type === 'consumablePickup'), 'a reward should have spawned');
});

test('a sacrifice spike will not hit the player again within its cooldown window', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const playerHealth = new Health({ redMax: 12 });
  spawnSacrificeSpike(world, { x: 0, y: 0 });
  const rng = new Rng('sacrifice-cooldown');

  resolveSacrificeSpikes(world, player, { playerHealth, rng });
  const afterFirstHit = playerHealth.red;
  resolveSacrificeSpikes(world, player, { playerHealth, rng });
  assert.equal(playerHealth.red, afterFirstHit, 'a second overlap within the cooldown window should not deal more damage');
});

test('setChallengeWaves + updateChallengeRoom spawns the next wave only once the current one is fully cleared', () => {
  const room = new Room();
  const waves = [[CHASER_DEF], [CHASER_DEF, CHASER_DEF]];
  setChallengeWaves(room, waves);
  spawnEnemy(room.world, CHASER_DEF, { x: 100, y: 100 }); // stockRoom already spawned wave[0] itself

  const rng = new Rng('challenge-test');
  updateChallengeRoom(room, 0.1, { rng });
  assert.equal(room.world.entities.byType('enemy').filter((e) => e.alive).length, 1, 'should not spawn wave 2 while wave 1 is still alive');

  room.world.entities.byType('enemy')[0].destroy();
  room.world.reap();
  for (let i = 0; i < 20; i++) updateChallengeRoom(room, 0.1, { rng }); // past CHALLENGE_WAVE_INTERVAL_SECONDS
  assert.equal(room.world.entities.byType('enemy').filter((e) => e.alive).length, 2, 'wave 2 should have spawned once wave 1 cleared');
  assert.equal(room.challengeWaveIndex, 2);
});

test('updateChallengeRoom does nothing once every wave has been spawned', () => {
  const room = new Room();
  setChallengeWaves(room, [[CHASER_DEF]]); // only "wave 0" (spawned by the caller) exists; challengeWaveIndex starts at 1 = already past the end
  for (let i = 0; i < 20; i++) updateChallengeRoom(room, 0.1, { rng: new Rng('x') });
  assert.equal(room.world.entities.byType('enemy').length, 0);
});

test('resolveArcadeMachines: a slot machine pulls once per visit (gated by coins), then re-arms after the player steps off and back on', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  spawnSlotMachine(world, { x: 0, y: 0 }); // starts overlapping
  const currency = new Currency({ coins: CONFIG.ARCADE_SLOT_COST * 3 });
  const rng = new Rng('slot-test');

  resolveArcadeMachines(world, player, { currency, rng });
  assert.equal(currency.coins, CONFIG.ARCADE_SLOT_COST * 2);
  resolveArcadeMachines(world, player, { currency, rng }); // still overlapping, already used this visit
  assert.equal(currency.coins, CONFIG.ARCADE_SLOT_COST * 2, 'should not pull twice in the same visit');

  player.x = 9999; // step off
  resolveArcadeMachines(world, player, { currency, rng });
  player.x = 0; // step back on
  resolveArcadeMachines(world, player, { currency, rng });
  assert.equal(currency.coins, CONFIG.ARCADE_SLOT_COST, 'stepping off and back on should allow another pull');
});

test('resolveArcadeMachines does nothing without enough coins', () => {
  const world = new World();
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  spawnFortuneMachine(world, { x: 0, y: 0 });
  const currency = new Currency({ coins: 0 });
  resolveArcadeMachines(world, player, { currency, rng: new Rng('poor') });
  assert.equal(currency.coins, 0);
  assert.equal(world.entities.byType('consumablePickup').length, 0);
});
