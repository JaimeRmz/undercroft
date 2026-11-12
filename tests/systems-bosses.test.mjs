import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { updateEnemies, killEnemy } from '../src/systems/enemies.js';
import { spawnBoss, resolvePhaseIndex, scaledBossHp, spawnTrapdoor, resolveTrapdoor } from '../src/systems/bosses.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

const DT = 1 / 60;

const TWO_PHASE_DEF = {
  id: 'test:boss',
  name: 'Test Boss',
  hp: 20,
  radius: 20,
  phases: [
    { hpThreshold: 1.0, patterns: [{ id: 'aimedBurst', weight: 1 }] },
    { hpThreshold: 0.5, patterns: [{ id: 'ring', weight: 1 }] },
  ],
};

function freshWorld() {
  return new World({ widthTiles: 60, heightTiles: 60, tileSize: 40 });
}

test('scaledBossHp applies CONFIG.BOSS_HP_PER_STAGE_MULT per stage beyond the first', () => {
  assert.equal(scaledBossHp(40, 1), 40);
  assert.equal(scaledBossHp(40, 3), Math.round(40 * (1 + CONFIG.BOSS_HP_PER_STAGE_MULT * 2)));
});

test('resolvePhaseIndex picks the deepest phase whose threshold the current hp fraction has dropped to or below', () => {
  const phases = [{ hpThreshold: 1.0 }, { hpThreshold: 0.6 }, { hpThreshold: 0.3 }];
  assert.equal(resolvePhaseIndex(phases, 1.0), 0);
  assert.equal(resolvePhaseIndex(phases, 0.9), 0);
  assert.equal(resolvePhaseIndex(phases, 0.6), 1);
  assert.equal(resolvePhaseIndex(phases, 0.45), 1);
  assert.equal(resolvePhaseIndex(phases, 0.3), 2);
  assert.equal(resolvePhaseIndex(phases, 0.01), 2);
});

test('spawnBoss builds an enemy entity tagged isBoss with the bossAI behavior and scaled HP', () => {
  const world = freshWorld();
  const boss = spawnBoss(world, TWO_PHASE_DEF, { x: 100, y: 100, stage: 2 });
  assert.ok(boss.isBoss);
  assert.deepEqual(boss.behaviors, ['bossAI']);
  assert.equal(boss.hp, scaledBossHp(20, 2));
  assert.equal(boss.currentPhaseIndex, 0);
  assert.equal(boss.patternState, 'cooldown');
});

test('a boss progresses from cooldown -> telegraph -> executing -> cooldown, firing its pattern', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 300, y: 100, stats: new Stats() });
  const boss = spawnBoss(world, TWO_PHASE_DEF, { x: 100, y: 100 });
  boss.patternTimer = 0; // skip initial cooldown
  const rng = new Rng('boss-pattern');
  const events = createEventBus();
  let telegraphed = false;
  let attacked = false;
  events.on('boss:telegraph', () => (telegraphed = true));
  events.on('boss:attack', () => (attacked = true));

  // Run well past telegraph + full execution duration: onStart alone doesn't fire anything for
  // aimedBurst (it fires over several onTick calls), so stopping right at "attacked" would miss them.
  for (let i = 0; i < 180; i++) updateEnemies(world, player, DT, { events, rng });

  assert.ok(telegraphed, 'should have entered a telegraph window');
  assert.ok(attacked, 'should have executed a pattern after telegraphing');
  const tears = world.entities.byType('projectile').filter((p) => p.team === 'enemy');
  assert.ok(tears.length > 0, 'aimedBurst should have fired at least one enemy tear');
});

test('a boss moves through every phase as it takes damage, emitting boss:phase each time', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 300, y: 100, stats: new Stats() });
  const boss = spawnBoss(world, TWO_PHASE_DEF, { x: 100, y: 100 });
  const events = createEventBus();
  const phaseChanges = [];
  events.on('boss:phase', ({ phaseIndex }) => phaseChanges.push(phaseIndex));

  updateEnemies(world, player, DT, { events }); // phase 0, no change event (already at 0)
  assert.equal(phaseChanges.length, 0);

  boss.hp = boss.maxHp * 0.4; // drop below the phase-1 threshold (0.5)
  updateEnemies(world, player, DT, { events });
  assert.deepEqual(phaseChanges, [1]);
  assert.equal(boss.currentPhaseIndex, 1);
});

test('spawnTrapdoor + resolveTrapdoor: the trapdoor only "activates" once the player actually steps on it', () => {
  const world = freshWorld();
  const trapdoor = spawnTrapdoor(world, { x: 500, y: 500 });
  const far = { x: 0, y: 0, radius: 12 };
  const near = { x: trapdoor.x, y: trapdoor.y, radius: 12 };
  assert.equal(resolveTrapdoor(world, far), false);
  assert.equal(resolveTrapdoor(world, near), true);
});

test('killEnemy works on a boss exactly like any other enemy (emits enemy:death, no special-casing needed)', () => {
  const world = freshWorld();
  const boss = spawnBoss(world, TWO_PHASE_DEF, { x: 100, y: 100 });
  const events = createEventBus();
  let died = false;
  events.on('enemy:death', ({ enemy }) => (died = enemy.isBoss));
  killEnemy(world, boss, { events });
  assert.ok(!boss.alive);
  assert.ok(died);
});
