/** Fixed-capacity particle pool (death bursts, hit sparks). Pure data + lifecycle; no canvas access. */
export class ParticlePool {
  constructor(max = 300) {
    this.max = max;
    this.particles = [];
  }

  spawn({ x, y, vx = 0, vy = 0, life, color = '#fff', size = 2 }) {
    if (this.particles.length >= this.max) this.particles.shift(); // drop oldest to stay under budget
    const particle = { x, y, vx, vy, life, maxLife: life, color, size, alive: true };
    this.particles.push(particle);
    return particle;
  }

  /** Bursts `count` particles outward from a point at varying speed/life, via an injected Rng for determinism. */
  burst(x, y, count, { speed = 80, life = 0.3, color = '#fff', size = 2, rng }) {
    for (let i = 0; i < count; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const spd = rng.range(speed * 0.5, speed);
      this.spawn({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: rng.range(life * 0.6, life),
        color,
        size,
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
    if (this.particles.some((p) => !p.alive)) {
      this.particles = this.particles.filter((p) => p.alive);
    }
  }

  clear() {
    this.particles = [];
  }
}
