import { clamp } from '../utils/math'

const KEY = 'jujuba:v1'
const HUNGER_DECAY_PER_S = 100 / (10 * 3600) // -100 em 10h
const HAPPY_DECAY_PER_S = 100 / (16 * 3600) // -100 em 16h

export interface StatsData {
  version: 1
  hunger: number
  happiness: number
  lastSeen: number
}

type Listener = (s: Stats) => void

export class Stats {
  hunger = 80
  happiness = 80
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private listeners: Listener[] = []

  constructor() {
    this.load()
    setInterval(() => this.save(), 10_000)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save()
    })
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const d = JSON.parse(raw) as StatsData
      if (d.version !== 1 || typeof d.hunger !== 'number') return
      this.hunger = clamp(d.hunger, 0, 100)
      this.happiness = clamp(d.happiness, 0, 100)
      // decay offline desde a última visita
      const away = Math.max(0, (Date.now() - d.lastSeen) / 1000)
      this.hunger = clamp(this.hunger - away * HUNGER_DECAY_PER_S, 0, 100)
      this.happiness = clamp(this.happiness - away * HAPPY_DECAY_PER_S, 0, 100)
    } catch {
      /* storage indisponível/corrompido: segue com defaults */
    }
  }

  save(): void {
    try {
      const d: StatsData = {
        version: 1,
        hunger: this.hunger,
        happiness: this.happiness,
        lastSeen: Date.now(),
      }
      localStorage.setItem(KEY, JSON.stringify(d))
    } catch {
      /* sem storage, sem crise */
    }
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), 1000)
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this)
  }

  addHunger(v: number): void {
    this.hunger = clamp(this.hunger + v, 0, 100)
    this.scheduleSave()
    this.emit()
  }

  addHappiness(v: number): void {
    this.happiness = clamp(this.happiness + v, 0, 100)
    this.scheduleSave()
    this.emit()
  }

  /** Decay contínuo enquanto o jogo roda. */
  update(dt: number): void {
    const h0 = Math.round(this.hunger)
    const a0 = Math.round(this.happiness)
    this.hunger = clamp(this.hunger - HUNGER_DECAY_PER_S * dt, 0, 100)
    this.happiness = clamp(this.happiness - HAPPY_DECAY_PER_S * dt, 0, 100)
    if (Math.round(this.hunger) !== h0 || Math.round(this.happiness) !== a0) this.emit()
  }
}
