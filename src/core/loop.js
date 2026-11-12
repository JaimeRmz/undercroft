/**
 * Fixed-timestep accumulator loop: simulation always advances in CONFIG.TICK_STEP
 * chunks regardless of render framerate; rendering interpolates with the leftover
 * alpha. Runs headless (caller drives tick() with its own clock), so it works
 * identically in Node tests/tools and in the browser.
 */
import { CONFIG } from './config.js';

export class FixedStepLoop {
  /**
   * @param {object} opts
   * @param {number} [opts.step] seconds per simulation tick
   * @param {(dt: number) => void} opts.update called once per fixed tick
   * @param {(alpha: number) => void} [opts.render] called once per tick(), alpha in [0,1)
   * @param {number} [opts.maxFrameTime] clamp for a single tick() call's elapsed time
   */
  constructor({ step = CONFIG.TICK_STEP, update, render, maxFrameTime = CONFIG.MAX_FRAME_TIME }) {
    this.step = step;
    this.update = update;
    this.render = render;
    this.maxFrameTime = maxFrameTime;
    this.accumulator = 0;
    this.running = false;
    this.ticks = 0;
  }

  start() {
    this.running = true;
    this.accumulator = 0;
  }

  stop() {
    this.running = false;
  }

  /** Advance the simulation by `frameTime` seconds (wall-clock elapsed since the last call). */
  tick(frameTime) {
    if (!this.running) return;
    if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;
    if (frameTime < 0) frameTime = 0;
    this.accumulator += frameTime;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
      this.ticks += 1;
    }
    const alpha = this.accumulator / this.step;
    if (this.render) this.render(alpha);
    return alpha;
  }
}
