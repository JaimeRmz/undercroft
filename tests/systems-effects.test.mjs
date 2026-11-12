import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { spawnEnemy } from '../src/systems/enemies.js';
import { Currency } from '../src/systems/pickups.js';
import { Rng } from '../src/core/rng.js';
import { applyEffect, applyEffects, updateTempStatBoosts } from '../src/systems/effects.js';

function freshCtx(overrides = {}) {
  const world = new World({ widthTiles: 20, heightTiles: 20, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  return {
    world,
    player,
    playerHealth: new Health({ redMax: 6 }),
    stats: player.stats,
    currency: new Currency(),
    rng: new Rng('effects-test'),
    ...overrides,
  };
}

test('heal/healFull apply via Health', () => {
  const ctx = freshCtx();
  ctx.playerHealth.red = 2;
  applyEffect({ type: 'heal', value: 1 }, ctx);
  assert.equal(ctx.playerHealth.red, 3);
  applyEffect({ type: 'healFull' }, ctx);
  assert.equal(ctx.playerHealth.red, ctx.playerHealth.redMax);
});

test('damage reduces current red hearts, floored at 0', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'damage', value: 2 }, ctx);
  assert.equal(ctx.playerHealth.red, ctx.playerHealth.redMax - 2);
  applyEffect({ type: 'damage', value: 99 }, ctx);
  assert.equal(ctx.playerHealth.red, 0);
});

test('soulHeart/blackHeart grant extra hearts', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'soulHeart', value: 2 }, ctx);
  applyEffect({ type: 'blackHeart', value: 2 }, ctx);
  assert.equal(ctx.playerHealth.extra.length, 4);
});

test('statPermanent applies a one-way Stats delta', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'statPermanent', stat: 'damageUps', value: 1.5 }, ctx);
  assert.equal(ctx.stats.damageUps, 1.5);
});

test('statTemporary applies immediately and queues an expiry reversal on the player', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'statTemporary', stat: 'speed', value: 0.5, duration: 2 }, ctx);
  assert.ok(Math.abs(ctx.stats.speed - 1.5) < 1e-9);
  assert.equal(ctx.player.tempStatBoosts.length, 1);

  updateTempStatBoosts(ctx.player, 1);
  assert.ok(Math.abs(ctx.stats.speed - 1.5) < 1e-9, 'still active before the duration elapses');

  updateTempStatBoosts(ctx.player, 1.5);
  assert.ok(Math.abs(ctx.stats.speed - 1) < 1e-9, 'reversed once the duration elapses');
  assert.equal(ctx.player.tempStatBoosts.length, 0);
});

test('coins/bombs/keys adjust Currency, floored at 0', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'coins', value: 10 }, ctx);
  applyEffect({ type: 'bombs', value: 3 }, ctx);
  applyEffect({ type: 'keys', value: 2 }, ctx);
  assert.equal(ctx.currency.coins, 10);
  assert.equal(ctx.currency.bombs, 1 + 3); // Currency defaults to 1 starting bomb
  assert.equal(ctx.currency.keys, 2);

  applyEffect({ type: 'coins', value: -999 }, ctx);
  assert.equal(ctx.currency.coins, 0);
});

test('mapReveal marks every floor cell as visited', () => {
  const floor = { cells: new Map([['0,0', {}], ['1,0', {}], ['1,1', {}]]) };
  const floorRuntime = { visited: new Set(['0,0']) };
  const ctx = freshCtx({ floor, floorRuntime });
  applyEffect({ type: 'mapReveal' }, ctx);
  assert.equal(floorRuntime.visited.size, 3);
});

test('teleport moves the player to a valid in-bounds tile', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'teleport' }, ctx);
  assert.ok(ctx.player.x >= 0 && ctx.player.x <= 20 * 40);
});

test('nova damages enemies within radius', () => {
  const ctx = freshCtx();
  const enemy = spawnEnemy(ctx.world, { id: 'e', hp: 10, behavior: 'chase' }, { x: 130, y: 100 });
  applyEffect({ type: 'nova', radius: 100, damage: 50 }, ctx);
  assert.ok(!enemy.alive);
});

test('devilTrade removes a heart container and grants a permanent stat', () => {
  const ctx = freshCtx();
  applyEffect({ type: 'devilTrade', heartsCost: 2, stat: 'damageUps', value: 2 }, ctx);
  assert.equal(ctx.playerHealth.redMax, 4);
  assert.equal(ctx.stats.damageUps, 2);
});

test('applyEffects runs a whole list in order', () => {
  const ctx = freshCtx();
  applyEffects([{ type: 'coins', value: 5 }, { type: 'statPermanent', stat: 'luck', value: 1 }], ctx);
  assert.equal(ctx.currency.coins, 5);
  assert.equal(ctx.stats.luck, 1);
});
