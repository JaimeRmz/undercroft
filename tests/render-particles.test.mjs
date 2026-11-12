import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParticlePool } from '../src/render/particles.js';
import { Rng } from '../src/core/rng.js';

test('spawn adds a particle with life === maxLife and alive true', () => {
  const pool = new ParticlePool();
  const p = pool.spawn({ x: 1, y: 2, life: 0.5, color: '#fff' });
  assert.equal(p.life, 0.5);
  assert.equal(p.maxLife, 0.5);
  assert.ok(p.alive);
  assert.equal(pool.particles.length, 1);
});

test('pool drops the oldest particle once at max capacity', () => {
  const pool = new ParticlePool(2);
  const a = pool.spawn({ x: 0, y: 0, life: 1 });
  pool.spawn({ x: 0, y: 0, life: 1 });
  pool.spawn({ x: 0, y: 0, life: 1 }); // should evict `a`
  assert.equal(pool.particles.length, 2);
  assert.ok(!pool.particles.includes(a));
});

test('update moves particles and expires them once life reaches 0', () => {
  const pool = new ParticlePool();
  const p = pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: 0.1 });
  pool.update(0.05);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9);
  assert.ok(p.alive);
  pool.update(0.1);
  assert.equal(pool.particles.length, 0);
});

test('burst spawns `count` particles radiating outward using the injected rng (deterministic)', () => {
  const poolA = new ParticlePool();
  const poolB = new ParticlePool();
  poolA.burst(0, 0, 10, { rng: new Rng(7) });
  poolB.burst(0, 0, 10, { rng: new Rng(7) });
  assert.equal(poolA.particles.length, 10);
  assert.deepEqual(poolA.particles, poolB.particles);
});

test('clear empties the pool', () => {
  const pool = new ParticlePool();
  pool.spawn({ x: 0, y: 0, life: 1 });
  pool.clear();
  assert.equal(pool.particles.length, 0);
});
