export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Suavização exponencial independente de framerate (Freya Holmér). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

/** Mola amortecida pra impulsos (poke, squash-stretch). */
export class Spring {
  value = 0
  velocity = 0

  constructor(
    public stiffness = 120,
    public damping = 14,
  ) {}

  update(target: number, dt: number): number {
    const accel = this.stiffness * (target - this.value) - this.damping * this.velocity
    this.velocity += accel * dt
    this.value += this.velocity * dt
    return this.value
  }

  impulse(v: number): void {
    this.velocity += v
  }
}
