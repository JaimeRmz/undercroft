import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, RngStreams, hashStringToSeed } from '../src/core/rng.js';

test('same numeric seed produces identical sequences', () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('same string seed produces identical sequences', () => {
  const a = new Rng('floor-seed-1');
  const b = new Rng('floor-seed-1');
  assert.equal(a.next(), b.next());
  assert.equal(a.next(), b.next());
});

test('different seeds produce different sequences', () => {
  const a = new Rng(1);
  const b = new Rng(2);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('next() stays within [0, 1)', () => {
  const rng = new Rng(999);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('int(min, max) is inclusive on both ends and never goes outside', () => {
  const rng = new Rng(42);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 500; i++) {
    const v = rng.int(0, 2);
    assert.ok(v >= 0 && v <= 2);
    if (v === 0) sawMin = true;
    if (v === 2) sawMax = true;
  }
  assert.ok(sawMin && sawMax, 'expected to see both boundary values over 500 draws');
});

test('shuffle does not mutate input and contains the same elements', () => {
  const rng = new Rng(7);
  const input = [1, 2, 3, 4, 5];
  const out = rng.shuffle(input);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});

test('weighted favors higher-weight entries over many draws', () => {
  const rng = new Rng(55);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 2000; i++) {
    const pick = rng.weighted([
      { item: 'a', weight: 9 },
      { item: 'b', weight: 1 },
    ]);
    counts[pick]++;
  }
  assert.ok(counts.a > counts.b * 4, `expected a >> b, got ${JSON.stringify(counts)}`);
});

test('hashStringToSeed is deterministic', () => {
  assert.equal(hashStringToSeed('seed-abc'), hashStringToSeed('seed-abc'));
  assert.notEqual(hashStringToSeed('seed-abc'), hashStringToSeed('seed-abd'));
});

test('RngStreams gives independent, deterministic named streams', () => {
  const streamsA = new RngStreams('run-1');
  const streamsB = new RngStreams('run-1');
  const floorA = streamsA.stream('floorgen');
  const floorB = streamsB.stream('floorgen');
  assert.equal(floorA.next(), floorB.next());

  const dropsA = streamsA.stream('drops');
  // Consuming floorgen must not perturb drops' independent sequence.
  const dropsB = new RngStreams('run-1').stream('drops');
  assert.equal(dropsA.next(), dropsB.next());
});

test('RngStreams different names diverge', () => {
  const streams = new RngStreams('run-1');
  const a = streams.stream('floorgen').next();
  const b = streams.stream('drops').next();
  assert.notEqual(a, b);
});
