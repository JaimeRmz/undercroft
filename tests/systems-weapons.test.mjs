import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { fireWeapon, setWeaponType, WEAPON_TYPES } from '../src/systems/weapons.js';
import { createEventBus } from '../src/core/events.js';

function freshPlayer() {
  const world = new World({ widthTiles: 60, heightTiles: 60, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  return { world, player };
}

test('normal weapon fires a single tear with the player\'s attached tear modifiers', () => {
  const { world, player } = freshPlayer();
  player.tearModifiers = ['piercing'];
  const tears = fireWeapon(world, player, { x: 1, y: 0 }, {});
  assert.equal(tears.length, 1);
  assert.ok(tears[0].modifierIds.includes('piercing'));
});

test('multishot fires multiple tears spread around the aim direction', () => {
  const { world, player } = freshPlayer();
  player.multishotCount = 3;
  setWeaponType(player, 'multishot');
  const tears = fireWeapon(world, player, { x: 1, y: 0 }, {});
  assert.equal(tears.length, 3);
  const middle = tears[1];
  assert.ok(Math.abs(middle.vy) < 1e-6, 'middle shot stays on the aim line');
  assert.notEqual(tears[0].vy, tears[2].vy, 'outer shots diverge from each other');
});

test('laser weapon fires one tear that pierces infinitely', () => {
  const { world, player } = freshPlayer();
  setWeaponType(player, 'laser');
  const tears = fireWeapon(world, player, { x: 1, y: 0 }, {});
  assert.equal(tears.length, 1);
  assert.equal(tears[0].pierceRemaining, Infinity);
  assert.ok(tears[0].modifierIds.includes('piercing'));
});

test('melee weapon hits an adjacent enemy directly without spawning a projectile', () => {
  const { world, player } = freshPlayer();
  setWeaponType(player, 'melee');
  const enemy = spawnEnemy(world, { id: 'e', hp: 10, radius: 10, behavior: 'chaser' }, { x: 130, y: 100 });
  const events = createEventBus();
  let hit = false;
  events.on('enemy:hit', () => (hit = true));
  const tears = fireWeapon(world, player, { x: 1, y: 0 }, { events });
  assert.equal(tears.length, 0, 'melee spawns no projectiles');
  assert.ok(hit);
  assert.ok(enemy.hp < 10);
});

test('chargeShot weapon scales tear damage and radius by ctx.chargeFraction', () => {
  const { world, player } = freshPlayer();
  setWeaponType(player, 'chargeShot');
  const baseDamage = player.stats.damage;

  const half = fireWeapon(world, player, { x: 1, y: 0 }, { chargeFraction: 0.5 })[0];
  const full = fireWeapon(world, player, { x: 1, y: 0 }, { chargeFraction: 1 })[0];

  assert.ok(half.damage > baseDamage && half.damage < full.damage);
  assert.ok(full.radius > half.radius, 'a fuller charge should also grow the tear');
});

test('bombShot weapon fires a tear tagged with the exploding modifier', () => {
  const { world, player } = freshPlayer();
  setWeaponType(player, 'bombShot');
  const tears = fireWeapon(world, player, { x: 1, y: 0 }, {});
  assert.equal(tears.length, 1);
  assert.ok(tears[0].modifierIds.includes('exploding'));
});

test('setWeaponType only overrides when the new type has equal or higher priority', () => {
  const { player } = freshPlayer();
  assert.ok(setWeaponType(player, 'laser'));
  assert.equal(player.weaponType, 'laser');
  assert.ok(!setWeaponType(player, 'multishot'), 'lower-priority weapon should not override a higher one');
  assert.equal(player.weaponType, 'laser', 'still laser after a rejected downgrade');
});

test('WEAPON_TYPES registers exactly the weapon types from CLAUDE.md §3', () => {
  for (const name of ['normal', 'multishot', 'laser', 'melee', 'bombShot', 'chargeShot']) {
    assert.ok(WEAPON_TYPES[name], `expected a registered weapon type "${name}"`);
  }
});
