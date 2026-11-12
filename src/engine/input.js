/**
 * Input adapter. The action mapping and state machine are pure data/functions
 * so they run headless and are unit-testable; only createKeyboardAdapter and
 * pollGamepads touch browser globals (window/navigator), per CLAUDE.md's
 * "rendering, audio and input are adapters behind interfaces" rule.
 */

export const KEYBOARD_MAP = {
  KeyW: 'moveUp',
  KeyS: 'moveDown',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  ArrowUp: 'shootUp',
  ArrowDown: 'shootDown',
  ArrowLeft: 'shootLeft',
  ArrowRight: 'shootRight',
  KeyE: 'bomb',
  Space: 'useActive',
  KeyQ: 'useConsumable',
  ControlLeft: 'dropTrinket',
  ControlRight: 'dropTrinket',
  Tab: 'toggleMap',
  Escape: 'pause',
  Backquote: 'toggleConsole',
};

const GAMEPAD_BUTTON_MAP = {
  0: 'useActive', // A / Cross
  1: 'bomb', // B / Circle
  2: 'useConsumable', // X / Square
  3: 'dropTrinket', // Y / Triangle
  9: 'pause', // Start / Options
};

const GAMEPAD_DEADZONE = 0.2;

export function createInputState() {
  return {
    held: new Set(),
    justPressed: new Set(),
    justReleased: new Set(),
    moveX: 0,
    moveY: 0,
    shootX: 0,
    shootY: 0,
  };
}

export function press(state, action) {
  if (!state.held.has(action)) {
    state.held.add(action);
    state.justPressed.add(action);
  }
}

export function release(state, action) {
  if (state.held.has(action)) {
    state.held.delete(action);
    state.justReleased.add(action);
  }
}

export function handleKeyDown(state, code) {
  const action = KEYBOARD_MAP[code];
  if (action) press(state, action);
}

export function handleKeyUp(state, code) {
  const action = KEYBOARD_MAP[code];
  if (action) release(state, action);
}

/** Recomputes digital move/shoot axes from currently-held direction actions. */
export function recomputeAxes(state) {
  state.moveX = (state.held.has('moveRight') ? 1 : 0) - (state.held.has('moveLeft') ? 1 : 0);
  state.moveY = (state.held.has('moveDown') ? 1 : 0) - (state.held.has('moveUp') ? 1 : 0);
  state.shootX = (state.held.has('shootRight') ? 1 : 0) - (state.held.has('shootLeft') ? 1 : 0);
  state.shootY = (state.held.has('shootDown') ? 1 : 0) - (state.held.has('shootUp') ? 1 : 0);
}

/** Clears per-frame press/release edges. Call once per tick after systems have read them. */
export function clearFrameEdges(state) {
  state.justPressed.clear();
  state.justReleased.clear();
}

function applyDeadzone(v) {
  return Math.abs(v) < GAMEPAD_DEADZONE ? 0 : v;
}

/**
 * Merges one gamepad's analog sticks and buttons into `state`. Pure — the
 * caller supplies the gamepad object (real Gamepad or a test fake), so this
 * needs no `navigator` to unit test.
 */
export function applyGamepad(state, gamepad) {
  if (!gamepad) return;
  const lx = applyDeadzone(gamepad.axes?.[0] ?? 0);
  const ly = applyDeadzone(gamepad.axes?.[1] ?? 0);
  const rx = applyDeadzone(gamepad.axes?.[2] ?? 0);
  const ry = applyDeadzone(gamepad.axes?.[3] ?? 0);
  if (lx !== 0 || ly !== 0) {
    state.moveX = lx;
    state.moveY = ly;
  }
  if (rx !== 0 || ry !== 0) {
    state.shootX = rx;
    state.shootY = ry;
  }
  const buttons = gamepad.buttons ?? [];
  for (const [index, action] of Object.entries(GAMEPAD_BUTTON_MAP)) {
    const pressed = buttons[index]?.pressed ?? false;
    if (pressed) press(state, action);
    else release(state, action);
  }
}

/** Polls every connected gamepad (no gamepad press/release events exist — must poll each frame). */
export function pollGamepads(state, getGamepads) {
  const gamepads = getGamepads ? getGamepads() : typeof navigator !== 'undefined' ? navigator.getGamepads() : [];
  for (const gamepad of gamepads) applyGamepad(state, gamepad);
}

/** Browser wiring: attaches keyboard listeners to `target`. Returns a disposer; no-ops headlessly. */
export function createKeyboardAdapter(state, target = typeof window !== 'undefined' ? window : undefined) {
  if (!target) return () => {};
  const onKeyDown = (e) => {
    handleKeyDown(state, e.code);
    recomputeAxes(state);
  };
  const onKeyUp = (e) => {
    handleKeyUp(state, e.code);
    recomputeAxes(state);
  };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}
