import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { FoxRig } from '../fox/rig'
import type { FoxAnimator, PoseInput } from '../fox/animations'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { chomp, gulp } from '../audio/sfx'
import { clamp, damp } from '../utils/math'

export type FoodKind = 'cookie' | 'apple' | 'drumstick'
export const FOOD_KINDS: FoodKind[] = ['cookie', 'apple', 'drumstick']

const FLY_DUR = 0.5
const CHOMP_DUR = 0.38
const CHOMPS = 3

interface Deps {
  scene: THREE.Scene
  rig: FoxRig
  animator: FoxAnimator
  particles: Particles
  stats: Stats
  pose: PoseInput
}

export class FeedingSystem {
  private templates = new Map<FoodKind, THREE.Object3D>()
  private current: THREE.Object3D | null = null
  private phase: 'idle' | 'fly' | 'chomp' | 'swallow' = 'idle'
  private t = 0
  private cycleT = 0
  private bitten = false
  private bites = 0
  private from = new THREE.Vector3()
  private mouth = new THREE.Vector3()
  private jaw = 0
  /** Chamado quando a refeição termina (main devolve o estado pra IDLE). */
  onDone: (() => void) | null = null

  constructor(private deps: Deps) {}

  async preload(): Promise<void> {
    const loader = new GLTFLoader()
    await Promise.all(
      FOOD_KINDS.map(async (kind) => {
        const gltf = await loader.loadAsync(`/models/${kind}.glb`)
        this.templates.set(kind, gltf.scene)
      }),
    )
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  start(kind: FoodKind): boolean {
    const tpl = this.templates.get(kind)
    if (!tpl || this.active) return false
    this.current = tpl.clone(true)
    this.deps.scene.add(this.current)
    this.from.set(0.5, 0.3, 1.1) // nasce embaixo/na frente, à direita
    this.current.position.copy(this.from)
    this.current.rotation.x = 1.1 // inclinada pra câmera (biscoito de frente)
    this.phase = 'fly'
    this.t = 0
    this.bites = 0
    this.jaw = 0
    return true
  }

  private mouthAnchor(): THREE.Vector3 {
    // o osso jaw fica no PIVÔ (fundo da mandíbula) — empurra pra frente dos lábios
    this.deps.rig.mouthWorld(this.mouth)
    this.mouth.y -= 0.045
    this.mouth.z += 0.24
    return this.mouth
  }

  update(dt: number): void {
    if (this.phase === 'idle') return
    const { pose, particles, stats, animator } = this.deps
    this.t += dt

    switch (this.phase) {
      case 'fly': {
        const k = clamp(this.t / FLY_DUR, 0, 1)
        const e = k * k * (3 - 2 * k) // smoothstep
        const target = this.mouthAnchor()
        this.current!.position.lerpVectors(this.from, target, e)
        this.current!.position.y += Math.sin(k * Math.PI) * 0.18 // arquinho
        this.current!.rotation.y += dt * 4
        this.jaw = e * 0.95 // boca abre antecipando
        if (k >= 1) {
          this.phase = 'chomp'
          this.t = 0
          this.cycleT = 0
          this.bitten = false
        }
        break
      }
      case 'chomp': {
        this.cycleT += dt
        const ct = this.cycleT
        // fecha rápido (0→0.12s) e reabre no resto do ciclo
        this.jaw =
          ct < 0.12 ? 1 - (ct / 0.12) * 0.9 : 0.1 + ((ct - 0.12) / (CHOMP_DUR - 0.12)) * 0.85
        // comida gruda na boca (segue o head bob)
        const anchor = this.mouthAnchor()
        this.current!.position.copy(anchor)
        this.current!.rotation.y += dt * 1.5

        if (!this.bitten && ct >= 0.12) {
          // momento da boca fechada = mordida!
          this.bitten = true
          this.bites++
          chomp()
          particles.spawn('crumb', anchor, 5)
          if (this.bites >= CHOMPS) {
            this.deps.scene.remove(this.current!)
            this.current = null
            this.phase = 'swallow'
            this.t = 0
            gulp()
            animator.bounce()
            stats.addHunger(30)
            stats.addHappiness(4)
          } else {
            this.current!.scale.setScalar(Math.max(1 - this.bites / CHOMPS, 0.2))
          }
        }
        if (ct >= CHOMP_DUR) {
          this.cycleT -= CHOMP_DUR
          this.bitten = false
        }
        break
      }
      case 'swallow': {
        this.jaw = damp(this.jaw, 0, 14, dt)
        if (this.t > 0.55) {
          this.phase = 'idle'
          pose.jawOpen = 0
          this.onDone?.()
          return
        }
        break
      }
    }

    pose.jawOpen = clamp(this.jaw, 0, 1)
  }
}
