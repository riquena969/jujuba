import * as THREE from 'three'
import type { FoxAnimator, PoseInput } from './animations'
import type { Expressions } from './expressions'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Purr, squeak } from '../audio/sfx'
import { clamp } from '../utils/math'

export type FoxState =
  | 'IDLE'
  | 'PETTING'
  | 'POKED'
  | 'DRAGGING' // comida sendo arrastada até a boca
  | 'EATING'
  | 'LISTENING'
  | 'REPLAYING'

interface Deps {
  animator: FoxAnimator
  expressions: Expressions
  particles: Particles
  stats: Stats
  pose: PoseInput
}

/** FSM central — toda interação passa por aqui pras animações não brigarem. */
export class FoxBehavior {
  state: FoxState = 'IDLE'
  private stateT = 0
  private sinceStroke = 0
  private strokePoint = new THREE.Vector3()
  private strokeNdcX = 0
  private heartTimer = 0
  private purr = new Purr()
  private stateListeners: ((s: FoxState) => void)[] = []

  constructor(private deps: Deps) {}

  onState(fn: (s: FoxState) => void): void {
    this.stateListeners.push(fn)
  }

  /** EATING, REPLAYING e DRAGGING não podem ser atropelados por carinho/poke. */
  private canInterrupt(): boolean {
    return this.state !== 'EATING' && this.state !== 'REPLAYING' && this.state !== 'DRAGGING'
  }

  enter(next: FoxState): void {
    if (this.state === next) return
    // saídas
    if (this.state === 'PETTING') this.purr.stop()
    this.state = next
    this.stateT = 0
    // entradas
    if (next === 'PETTING') {
      this.purr.start()
      this.heartTimer = 0
    } else if (next === 'POKED') {
      this.deps.animator.flinch()
      squeak()
      this.deps.stats.addHappiness(1)
    }
    for (const fn of this.stateListeners) fn(next)
  }

  /** Chamado pelo pointer a cada trecho de "esfregada" válida sobre a raposa. */
  petPulse(point: THREE.Vector3, ndcX: number): void {
    if (!this.canInterrupt()) return
    if (this.state === 'POKED' && this.stateT < 0.15) return
    if (this.state !== 'PETTING') this.enter('PETTING')
    this.sinceStroke = 0
    this.strokePoint.copy(point)
    this.strokeNdcX = ndcX
  }

  poke(): void {
    if (this.state !== 'IDLE') return
    this.enter('POKED')
  }

  /** Começo do arrasto de comida. true = pode (main dispara o FeedingSystem). */
  tryStartDragging(): boolean {
    const ok =
      this.state === 'IDLE' ||
      this.state === 'PETTING' ||
      this.state === 'POKED' ||
      this.state === 'LISTENING'
    if (ok) this.enter('DRAGGING')
    return ok
  }

  update(dt: number): void {
    this.stateT += dt
    const { pose, expressions, particles, stats } = this.deps

    switch (this.state) {
      case 'PETTING': {
        this.sinceStroke += dt
        if (this.sinceStroke > 1.0) {
          this.enter('IDLE')
          break
        }
        stats.addHappiness(6 * dt)
        this.heartTimer -= dt
        if (this.heartTimer <= 0) {
          particles.spawn('heart', this.strokePoint)
          this.heartTimer = 0.22
        }
        break
      }
      case 'POKED':
        if (this.stateT > 0.55) this.enter('IDLE')
        break
      case 'LISTENING':
        // trava de segurança (worklet limita em 10 s)
        if (this.stateT > 12) this.enter('IDLE')
        break
      default:
        break
    }

    // ---- pose/expressões por estado (um lugar só escreve os alvos) ----
    const petting = this.state === 'PETTING'
    const eating = this.state === 'EATING'
    const listening = this.state === 'LISTENING'
    const replaying = this.state === 'REPLAYING'
    const dragging = this.state === 'DRAGGING'
    pose.excitement =
      petting ? 0.95 : eating ? 0.7 : dragging ? 0.55 : replaying ? 0.5 : listening ? 0.3 : 0
    pose.lean = petting
      ? clamp(this.strokeNdcX, -1, 1)
      : dragging
        ? clamp(pose.gazeX * 0.5, -1, 1) // se estica na direção do petisco
        : 0
    pose.earsPerk = listening ? 1 : 0
    pose.headTilt = listening ? 0.14 : 0
    pose.sad = this.deps.stats.hunger < 30 && this.state === 'IDLE' ? 1 : 0
    expressions.smileTarget = petting ? 1 : 0
    expressions.blinkHold = petting
    // jawOpen: escrito pela comida (FeedingSystem) e pela voz (VoiceSystem)
  }
}
