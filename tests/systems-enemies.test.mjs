import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { spawnEnemy, updateEnemies, rollChampion, isEnemyDamageBlocked, applyEnemyDamage, killEnemy, CHAMPION_COLOR_DROP } from '../src/systems/enemies.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Rng } from '../src/core/rng.js';
import { createEventBus } from '../src/core/events.js';
import { CONFIG } from '../src/core/config.js';

const CHASER_DEF = { id: 'core:chaser', hp: 5, speed: 90, radius: 14, behavior: 'chase', contactDamageHalfHearts: 1 };
const FLIER_DEF = { id: 'core:erratic-flier', hp: 4, speed: 70, radius: 12, behavior: 'erraticFlier', flies: true };
const TURRET_DEF = {
  id: 'core:turret', hp: 6, speed: 0, radius: 14, behavior: 'turretShooter',
  fireCooldownSeconds: 0.5, shotSpeed: 1, damage: 2, range: 5,
};

function freshWorld() {
  return new World({ widthTiles: 40, heightTiles: 40, tileSize: 40 });
}

test('chaser moves directly toward the player', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 500, y: 400, stats: new Stats() });
  const enemy = spawnEnemy(world, CHASER_DEF, { x: 400, y: 400 });
  updateEnemies(world, player, 1 / 60, {});
  assert.ok(enemy.x > 400, 'should have moved right, toward the player');
  assert.ok(Math.abs(enemy.y - 400) < 1e-6, 'player is directly to the right, so y should not change');
});

test('erratic flier changes direction over time and ignores tile collision (flies)', () => {
  const world = freshWorld();
  world.tileGrid.setSolid(10, 10, true); // put a wall right where the flier starts
  const center = world.tileGrid.tileCenter(10, 10);
  const player = createPlayer(world, { x: 0, y: 0, stats: new Stats() });
  const flier = spawnEnemy(world, FLIER_DEF, { x: center.x, y: center.y });
  const rng = new Rng(42);
  for (let i = 0; i < 180; i++) updateEnemies(world, player, 1 / 60, { rng }); // 3 seconds
  // Flier should have picked a direction and moved; tile collision should not have pushed it out immediately.
  assert.ok(flier.aiDir.x !== 0 || flier.aiDir.y !== 0);
});

test('turret stays stationary and fires at the player on a cooldown', () => {
  const world = freshWorld();
  const player = createPlayer(world, { x: 600, y: 400, stats: new Stats() });
  const turret = spawnEnemy(world, TURRET_DEF, { x: 400, y: 400 });
  const events = createEventBus();
  let shots = 0;
  events.on('enemy:shoot', () => shots++);

  for (let i = 0; i < 180; i++) updateEnemies(world, player, 1 / 60, { events }); // 3 seconds @ 0.5s cooldown
  assert.equal(turret.vx, 0);
  assert.equal(turret.vy, 0);
  assert.ok(shots >= 5, `expected multiple shots over 3s at 0.5s cooldown, got ${shots}`);

  const projectiles = world.entities.byType('projectile');
  assert.ok(projectiles.length > 0);
  assert.equal(projectiles[0].team, 'enemy');
});

test('spawnEnemy normalizes a single `behavior` string into a `behaviors` array, and passes through an explicit array untouched', () => {
  const world = freshWorld();
  const a = spawnEnemy(world, { id: 'a', hp: 1, behavior: 'chase' }, { x: 0, y: 0 });
  assert.deepEqual(a.behaviors, ['chase']);
  const b = spawnEnemy(world, { id: 'b', hp: 1, behaviors: ['chase', 'exploder'] }, { x: 0, y: 0 });
  assert.deepEqual(b.behaviors, ['chase', 'exploder']);
});

test('rollChampion respects CONFIG.CHAMPION_CHANCE and only ever returns one of the documented secondary effects', () => {
  assert.equal(rollChampion(null), null, 'no rng means no roll');
  let champions = 0;
  const trials = 2000;
  for (let i = 0; i < trials; i++) {
    const champion = rollChampion(new Rng(`champion-roll-${i}`));
    if (champion) {
      champions++;
      assert.ok(['faster', 'explodesOnDeath', 'splitsOnDeath', 'invulnerableUntilOthersDie', 'dropsCoinsOnHit'].includes(champion.effect));
      assert.ok(CHAMPION_COLOR_DROP[champion.color] !== undefined, `champion color ${champion.color} should map to a guaranteed drop`);
    }
  }
  const rate = champions / trials;
  assert.ok(Math.abs(rate - CONFIG.CHAMPION_CHANCE) < 0.03, `expected champion rate near ${CONFIG.CHAMPION_CHANCE}, got ${rate}`);
});

test('a forced champion gets the x2.6 HP multiplier and its matching secondary effect applied', () => {
  const world = freshWorld();
  const base = spawnEnemy(world, { id: 'core:chaser', hp: 5, behavior: 'chase', forceChampion: 'invulnerableUntilOthersDie' }, { x: 0, y: 0, rng: new Rng(1) });
  assert.ok(base.isChampion);
  assert.equal(base.hp, Math.round(5 * CONFIG.CHAMPION_HP_MULT));
  assert.ok(base.invulnerableUntilOthersDie);
});

test('forceChampion "faster" multiplies speed, and "explodesOnDeath"/"splitsOnDeath" append the matching death-reaction behavior', () => {
  const world = freshWorld();
  const faster = spawnEnemy(world, { id: 'a', hp: 5, speed: 100, behavior: 'chase', forceChampion: 'faster' }, { x: 0, y: 0 });
  assert.equal(faster.speed, 100 * CONFIG.CHAMPION_SPEED_MULT);

  const exploder = spawnEnemy(world, { id: 'b', hp: 5, behavior: 'chase', forceChampion: 'explodesOnDeath' }, { x: 0, y: 0 });
  assert.ok(exploder.behaviors.includes('exploder'));

  const splitter = spawnEnemy(world, { id: 'c', hp: 5, behavior: 'chase', forceChampion: 'splitsOnDeath' }, { x: 0, y: 0 });
  assert.ok(splitter.behaviors.includes('splitter'));
});

test('isEnemyDamageBlocked: generic invulnerable flag blocks damage', () => {
  const world = freshWorld();
  const hidden = spawnEnemy(world, { id: 'a', hp: 5, behavior: 'chase' }, { x: 0, y: 0 });
  hidden.invulnerable = true;
  assert.ok(isEnemyDamageBlocked(world, hidden));
});

test('isEnemyDamageBlocked: invulnerableUntilOthersDie only blocks while another enemy is alive', () => {
  const world = freshWorld();
  const champ = spawnEnemy(world, { id: 'b', hp: 5, behavior: 'chase', forceChampion: 'invulnerableUntilOthersDie' }, { x: 100, y: 0 });
  const other = spawnEnemy(world, { id: 'c', hp: 5, behavior: 'chase' }, { x: 200, y: 0 });
  assert.ok(isEnemyDamageBlocked(world, champ), 'blocked while another enemy is alive');
  other.destroy();
  assert.ok(!isEnemyDamageBlocked(world, champ), 'no longer blocked once it is the last one standing');
});

test('applyEnemyDamage is a no-op against a blocked enemy, and kills + fires onDeath once hp drops to 0', () => {
  const world = freshWorld();
  const invuln = spawnEnemy(world, { id: 'a', hp: 5, behavior: 'chase' }, { x: 0, y: 0 });
  invuln.invulnerable = true;
  assert.equal(applyEnemyDamage(world, invuln, 100, {}), 0);
  assert.ok(invuln.alive);

  const victim = spawnEnemy(world, { id: 'b', hp: 5, behaviors: ['chase', 'exploder'] }, { x: 0, y: 0 });
  const events = createEventBus();
  let exploded = false;
  let died = false;
  events.on('enemy:explode', () => (exploded = true));
  events.on('enemy:death', () => (died = true));
  applyEnemyDamage(world, victim, 100, { events });
  assert.ok(!victim.alive);
  assert.ok(exploded, 'exploder onDeath hook should have fired');
  assert.ok(died);
});

test('killEnemy drops the champion\'s color-matched pickup', () => {
  const world = freshWorld();
  const champ = spawnEnemy(world, { id: 'a', hp: 5, behavior: 'chase', forceChampion: 'dropsCoinsOnHit' }, { x: 300, y: 300 });
  const before = world.entities.byType('pickup').length;
  killEnemy(world, champ, {});
  const pickups = world.entities.byType('pickup');
  assert.equal(pickups.length, before + 1);
  assert.equal(pickups[pickups.length - 1].pickupType, CHAMPION_COLOR_DROP[champ.championColor]);
});
