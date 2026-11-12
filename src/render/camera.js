/** World-to-screen transform + screen shake. Pure math; no canvas access, fully headless-testable. */
export class Camera {
  constructor({ x = 0, y = 0, zoom = 1, viewportWidth = 1040, viewportHeight = 720 } = {}) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.shakeTimer = 0;
    this.shakeMagnitude = 0;
    this.shakeOffset = { x: 0, y: 0 };
  }

  centerOn(x, y) {
    this.x = x;
    this.y = y;
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.x) * this.zoom + this.viewportWidth / 2 + this.shakeOffset.x,
      y: (y - this.y) * this.zoom + this.viewportHeight / 2 + this.shakeOffset.y,
    };
  }

  /** Starts (or extends) a screen shake. Call on player damage / explosions. */
  shake(magnitude, seconds) {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeTimer = Math.max(this.shakeTimer, seconds);
  }

  /** Call once per render frame with a source of randomness to jitter the offset while shaking. */
  update(dt, rng) {
    if (this.shakeTimer <= 0) {
      this.shakeOffset = { x: 0, y: 0 };
      this.shakeMagnitude = 0;
      return;
    }
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    if (this.shakeTimer === 0) {
      this.shakeOffset = { x: 0, y: 0 };
      this.shakeMagnitude = 0;
      return;
    }
    this.shakeOffset = {
      x: (rng.next() * 2 - 1) * this.shakeMagnitude,
      y: (rng.next() * 2 - 1) * this.shakeMagnitude,
    };
  }
}
