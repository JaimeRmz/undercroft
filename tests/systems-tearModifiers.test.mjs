import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { Room } from '../src/systems/room.js';
import { spawnTear, updateProjectiles } from '../src/systems/projectiles.js';
import { resolveCombat } from '../src/systems/combat.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { createEventBus } from '../src/core/events.js';

function freshWorld() {
  return new World({ widthTiles: 60, heightTiles: 60, tileSize: 40 });
}

function statsWith(overrides) {
  return new Stats(overrides);
}

test('piercing: a tear survives an enemy hit and keeps flying, destroyed only after pierceCount hits exhausted', () => {
  const world = freshWorld();
  const e1 = spawnEnemy(world, { id: 'e1', hp: 1, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const e2 = spawnEnemy(world, { id: 'e2', hp: 1, radius: 10, behavior: 'chase' }, { x: 260, y: 100 });
  const e3 = spawnEnemy(world, { id: 'e3', hp: 1, radius: 10, behavior: 'chase' }, { x: 320, y: 100 });
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 20 }),
    modifiers: [{ id: 'piercing', config: { pierceCount: 1 } }],
  });
  const events = createEventBus();

  // Move the tear onto e1 and resolve: pierceCount=1 means it survives the FIRST hit.
  tear.x = e1.x; tear.y = e1.y;
  resolveCombat(world, { events });
  assert.ok(tear.alive, 'should survive its first hit (1 pierce charge)');
  assert.ok(!e1.alive);

  // Now onto e2: pierce charge is exhausted, so this hit destroys it.
  tear.x = e2.x; tear.y = e2.y;
  resolveCombat(world, { events });
  assert.ok(!tear.alive);
  assert.ok(!e2.alive);
  assert.ok(e3.alive, 'never reached, should be untouched');
});

test('bouncing: a tear reverses direction and survives bounceCount wall hits, then is destroyed', () => {
  const world = new World({ widthTiles: 10, heightTiles: 10, tileSize: 40 });
  world.tileGrid.setSolid(5, 2, true);
  const tear = spawnTear(world, {
    x: 40, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 100 }),
    modifiers: [{ id: 'bouncing', config: { bounceCount: 1 } }],
  });
  const events = createEventBus();

  for (let i = 0; i < 100 && tear.alive && tear.vx > 0; i++) updateProjectiles(world, 1 / 60, events);
  assert.ok(tear.alive, 'first wall hit should bounce, not destroy');
  assert.ok(tear.vx < 0, 'velocity should have reversed');

  world.tileGrid.setSolid(0, 2, true); // put a wall in its new (reversed) path too
  for (let i = 0; i < 100 && tear.alive; i++) updateProjectiles(world, 1 / 60, events);
  assert.ok(!tear.alive, 'second wall hit should destroy it (bounceCount exhausted)');
});

test('spectral: a tear ignores walls entirely and only expires at max range', () => {
  const world = new World({ widthTiles: 60, heightTiles: 10, tileSize: 40 });
  for (let tx = 2; tx < 50; tx++) world.tileGrid.setSolid(tx, 2, true); // a long wall directly in its path
  const tear = spawnTear(world, {
    x: 40, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 2 }),
    modifiers: ['spectral'],
  });
  const events = createEventBus();
  let hitWallEver = false;
  events.on('projectile:splash', (p) => {
    if (p.reason === 'wall') hitWallEver = true;
  });
  for (let i = 0; i < 300 && tear.alive; i++) updateProjectiles(world, 1 / 60, events);
  assert.ok(!tear.alive);
  assert.ok(!hitWallEver, 'spectral tear should never register a wall splash');
});

test('splitting: on expiring at max range, spawns two child tears that fly outward at an angle', () => {
  const world = freshWorld();
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 1 }),
    modifiers: ['splitting'],
  });
  const events = createEventBus();
  for (let i = 0; i < 2000 && tear.alive; i++) updateProjectiles(world, 1 / 240, events);
  assert.ok(!tear.alive);
  const children = world.entities.byType('projectile').filter((p) => p !== tear);
  assert.equal(children.length, 2);
  assert.notEqual(children[0].vy, 0); // angled away from the original straight path
  assert.notEqual(children[1].vy, 0);
});

test('splitting composed with homing: child tears inherit the homing modifier and steer toward enemies', () => {
  const world = freshWorld();
  spawnEnemy(world, { id: 'target', hp: 100, radius: 10, behavior: 'chase' }, { x: 100, y: 500 }); // far below the flight path
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 1 }),
    modifiers: ['splitting', 'homing'],
  });
  const events = createEventBus();
  for (let i = 0; i < 2000 && tear.alive; i++) updateProjectiles(world, 1 / 240, events);
  const children = world.entities.byType('projectile').filter((p) => p !== tear);
  assert.equal(children.length, 2);
  for (const child of children) assert.ok(child.modifierIds.includes('homing'));

  // Run the children forward and confirm they steer toward the enemy (vy should trend positive, toward y=500).
  for (let i = 0; i < 30; i++) updateProjectiles(world, 1 / 60, events);
  for (const child of children) assert.ok(child.vy > 0, 'homing child should steer toward the enemy below');
});

test('exploding: destroys the tear on enemy hit and damages other enemies within the blast radius', () => {
  const world = freshWorld();
  const direct = spawnEnemy(world, { id: 'direct', hp: 3, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const splashVictim = spawnEnemy(world, { id: 'splash', hp: 3, radius: 10, behavior: 'chase' }, { x: 230, y: 100 });
  const farAway = spawnEnemy(world, { id: 'far', hp: 3, radius: 10, behavior: 'chase' }, { x: 2000, y: 2000 });
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 20, damageUps: 10 }),
    modifiers: [{ id: 'exploding', config: { radius: 60 } }],
  });
  tear.x = direct.x; tear.y = direct.y;
  resolveCombat(world, { events: createEventBus() });
  assert.ok(!tear.alive);
  assert.ok(!direct.alive);
  assert.ok(!splashVictim.alive, 'should take splash damage from the explosion');
  assert.ok(farAway.alive, 'too far from the blast to be hit');
});

test('chainLightning: damages a second nearby enemy in addition to the one directly hit', () => {
  const world = freshWorld();
  const direct = spawnEnemy(world, { id: 'direct', hp: 100, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const chained = spawnEnemy(world, { id: 'chained', hp: 100, radius: 10, behavior: 'chase' }, { x: 230, y: 100 });
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 20 }),
    modifiers: [{ id: 'chainLightning', config: { chainRange: 100 } }],
  });
  tear.x = direct.x; tear.y = direct.y;
  resolveCombat(world, { events: createEventBus() });
  assert.ok(direct.hp < direct.maxHp);
  assert.ok(chained.hp < chained.maxHp, 'the chained enemy should also have taken damage');
});

test('status modifiers (poison/burn/etc.) tag the hit enemy without affecting whether the tear is destroyed', () => {
  const world = freshWorld();
  const enemy = spawnEnemy(world, { id: 'e', hp: 100, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 20 }),
    modifiers: ['poison'],
  });
  tear.x = enemy.x; tear.y = enemy.y;
  resolveCombat(world, { events: createEventBus() });
  assert.ok(!tear.alive, 'a plain status modifier alone should not keep the tear alive');
  assert.ok(enemy.status?.poison);
});

test('boomerang: reverses to fly back toward the owner once it reaches max range', () => {
  const world = freshWorld();
  const owner = { x: 100, y: 100 };
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 1 }),
    modifiers: ['boomerang'],
  });
  const events = createEventBus();
  for (let i = 0; i < 500 && !tear.boomerangReturning; i++) updateProjectiles(world, 1 / 120, events, { owner });
  assert.ok(tear.boomerangReturning);
  assert.ok(tear.vx < 0, 'should now be heading back toward the owner at x=100 from further right');
});

test('orbit: tear position tracks a circle around the owner rather than flying away', () => {
  const world = freshWorld();
  const owner = { x: 300, y: 300 };
  const tear = spawnTear(world, {
    x: 300, y: 300, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 1000 }),
    modifiers: [{ id: 'orbit', config: { orbitRadius: 50, orbitSpeed: 4 } }],
  });
  const events = createEventBus();
  for (let i = 0; i < 30; i++) updateProjectiles(world, 1 / 60, events, { owner });
  const dist = Math.hypot(tear.x - owner.x, tear.y - owner.y);
  assert.ok(Math.abs(dist - 50) < 1, `expected tear to stay ~50px from owner, got ${dist}`);
});

test('wiggle: lateral velocity oscillates over time instead of flying perfectly straight', () => {
  const world = freshWorld();
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 1000 }),
    modifiers: ['wiggle'],
  });
  const events = createEventBus();
  const vySamples = [];
  for (let i = 0; i < 60; i++) {
    updateProjectiles(world, 1 / 60, events);
    vySamples.push(tear.vy);
  }
  assert.ok(vySamples.some((v) => v > 0.1) && vySamples.some((v) => v < -0.1), 'vy should oscillate both positive and negative');
});

test('a tear with no modifiers behaves exactly as before: destroyed on its first enemy hit', () => {
  const world = freshWorld();
  const enemy = spawnEnemy(world, { id: 'e', hp: 1, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const tear = spawnTear(world, { x: 100, y: 100, dir: { x: 1, y: 0 }, stats: statsWith({ range: 20 }) });
  tear.x = enemy.x; tear.y = enemy.y;
  resolveCombat(world, { events: createEventBus() });
  assert.ok(!tear.alive);
  assert.ok(!enemy.alive);
});

test('a piercing tear does not deal repeated damage to the same enemy across multiple resolveCombat calls while overlapping', () => {
  const world = freshWorld();
  const enemy = spawnEnemy(world, { id: 'e', hp: 100, radius: 10, behavior: 'chase' }, { x: 200, y: 100 });
  const tear = spawnTear(world, {
    x: 100, y: 100, dir: { x: 1, y: 0 },
    stats: statsWith({ range: 20 }),
    modifiers: [{ id: 'piercing', config: { pierceCount: 10 } }],
  });
  tear.x = enemy.x; tear.y = enemy.y;
  const events = createEventBus();
  resolveCombat(world, { events });
  const hpAfterFirst = enemy.hp;
  resolveCombat(world, { events }); // still overlapping, same tick-equivalent
  assert.equal(enemy.hp, hpAfterFirst, 'should not be hit twice by the same tear while still overlapping');
});
