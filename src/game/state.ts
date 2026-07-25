import { clamp } from '../utils/math'

const KEY = 'jujuba:v1'
const HUNGER_DECAY_PER_S = 100 / (10 * 3600) // -100 em 10h
const HAPPY_DECAY_PER_S = 100 / (16 * 3600) // -100 em 16h
const ENERGY_DECAY_PER_S = 100 / (14 * 3600) // -100 em 14h acordada
const HYGIENE_DECAY_PER_S = 100 / (12 * 3600) // -100 em 12h (vai se sujando)
const SLEEP_REGEN_PER_S = 100 / 40 // dormindo com o jogo aberto: cheia em 40s
const SLEEP_REGEN_OFFLINE_PER_S = 100 / (6 * 3600) // dormindo offline: cheia em 6h

export interface StatsData {
  version: 1
  hunger: number
  happiness: number
  energy?: number
  hygiene?: number
  room?: string
  sleeping?: boolean
  /** Usuário desligou o mic na mão → não religar sozinho ao entrar na sala. */
  micUserOff?: boolean
  /** Nome da raposinha (padrão Foxy) e se já foi batizada. */
  name?: string
  named?: boolean
  lastSeen: number
}

type Listener = (s: Stats) => void

export class Stats {
  hunger = 80
  happiness = 80
  energy = 80
  hygiene = 80
  /** Sala atual (persistida). */
  room = 'sala'
  /** Sincronizado pelo main com o estado SLEEPING (persistido). */
  sleeping = false
  /** Preferência: mic desligado manualmente não religa sozinho. */
  micUserOff = false
  /** Nome da raposinha; `named` = usuário já escolheu (senão pergunta no boot). */
  name = 'Foxy'
  named = false
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
      this.energy = clamp(d.energy ?? 80, 0, 100)
      this.hygiene = clamp(d.hygiene ?? 80, 0, 100)
      this.room = typeof d.room === 'string' ? d.room : 'sala'
      this.sleeping = d.sleeping === true
      this.micUserOff = d.micUserOff === true
      this.name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Foxy'
      this.named = d.named === true
      // decay offline desde a última visita (dormindo: energia REGENERA)
      const away = Math.max(0, (Date.now() - d.lastSeen) / 1000)
      this.hunger = clamp(this.hunger - away * HUNGER_DECAY_PER_S, 0, 100)
      this.happiness = clamp(this.happiness - away * HAPPY_DECAY_PER_S, 0, 100)
      this.energy = clamp(
        this.energy + away * (this.sleeping ? SLEEP_REGEN_OFFLINE_PER_S : -ENERGY_DECAY_PER_S),
        0,
        100,
      )
      this.hygiene = clamp(this.hygiene - away * HYGIENE_DECAY_PER_S, 0, 100)
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
        energy: this.energy,
        hygiene: this.hygiene,
        room: this.room,
        sleeping: this.sleeping,
        micUserOff: this.micUserOff,
        name: this.name,
        named: this.named,
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

  addEnergy(v: number): void {
    this.energy = clamp(this.energy + v, 0, 100)
    this.scheduleSave()
    this.emit()
  }

  setHygiene(v: number): void {
    this.hygiene = clamp(v, 0, 100)
    this.scheduleSave()
    this.emit()
  }

  /** Decay contínuo enquanto o jogo roda (dormindo: energia regenera). */
  update(dt: number): void {
    const h0 = Math.round(this.hunger)
    const a0 = Math.round(this.happiness)
    const e0 = Math.round(this.energy)
    const y0 = Math.round(this.hygiene)
    this.hunger = clamp(this.hunger - HUNGER_DECAY_PER_S * dt, 0, 100)
    this.happiness = clamp(this.happiness - HAPPY_DECAY_PER_S * dt, 0, 100)
    this.energy = clamp(
      this.energy + dt * (this.sleeping ? SLEEP_REGEN_PER_S : -ENERGY_DECAY_PER_S),
      0,
      100,
    )
    this.hygiene = clamp(this.hygiene - HYGIENE_DECAY_PER_S * dt, 0, 100)
    if (
      Math.round(this.hunger) !== h0 ||
      Math.round(this.happiness) !== a0 ||
      Math.round(this.energy) !== e0 ||
      Math.round(this.hygiene) !== y0
    ) {
      this.emit()
    }
  }
}
