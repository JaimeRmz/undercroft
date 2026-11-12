/** Minimal pub/sub event bus. Systems communicate only through this — never by importing each other's internals. */
export function createEventBus() {
  const listeners = new Map();

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    listeners.get(event)?.delete(handler);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) handler(payload);
  }

  function clear(event) {
    if (event) listeners.delete(event);
    else listeners.clear();
  }

  return { on, off, emit, clear };
}

/** Process-wide default bus. Prefer createEventBus() for isolated test/game instances. */
export const events = createEventBus();
