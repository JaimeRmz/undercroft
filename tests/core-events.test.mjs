import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/core/events.js';

test('on/emit delivers payload to handler', () => {
  const bus = createEventBus();
  let received;
  bus.on('hit', (payload) => (received = payload));
  bus.emit('hit', { dmg: 5 });
  assert.deepEqual(received, { dmg: 5 });
});

test('emit with no listeners does not throw', () => {
  const bus = createEventBus();
  assert.doesNotThrow(() => bus.emit('nothing', {}));
});

test('off removes a specific handler', () => {
  const bus = createEventBus();
  let calls = 0;
  const handler = () => calls++;
  bus.on('x', handler);
  bus.off('x', handler);
  bus.emit('x');
  assert.equal(calls, 0);
});

test('on returns an unsubscribe function', () => {
  const bus = createEventBus();
  let calls = 0;
  const unsubscribe = bus.on('x', () => calls++);
  unsubscribe();
  bus.emit('x');
  assert.equal(calls, 0);
});

test('a handler that unsubscribes itself mid-emit does not break other handlers', () => {
  const bus = createEventBus();
  let secondCalls = 0;
  const unsubscribeFirst = bus.on('x', () => unsubscribeFirst());
  bus.on('x', () => secondCalls++);
  bus.emit('x');
  assert.equal(secondCalls, 1);
});

test('clear(event) removes only that event, clear() removes all', () => {
  const bus = createEventBus();
  let aCalls = 0;
  let bCalls = 0;
  bus.on('a', () => aCalls++);
  bus.on('b', () => bCalls++);
  bus.clear('a');
  bus.emit('a');
  bus.emit('b');
  assert.equal(aCalls, 0);
  assert.equal(bCalls, 1);
  bus.clear();
  bus.emit('b');
  assert.equal(bCalls, 1);
});
