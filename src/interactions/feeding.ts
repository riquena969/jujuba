import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { FoxRig } from '../fox/rig'
import type { FoxAnimator, PoseInput } from '../fox/animations'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { chomp, gulp, slurp, burp } from '../audio/sfx'
import { clamp, damp } from '../utils/math'
import { asset } from '../utils/assets'

export type FoodKind = 'cookie' | 'apple' | 'drumstick' | 'juice' | 'milk'
export const FOOD_KINDS: FoodKind[] = ['cookie', 'apple', 'drumstick', 'juice', 'milk']
/** Bebidas: golinhos (slurp, gotas, sem migalhas) em vez de mordidas. */
const DRINKS: ReadonlySet<FoodKind> = new Set(['juice', 'milk'])

const FLY_DUR = 0.5
const CHOMP_DUR = 0.38
const CHOMPS = 3
/** Plano (z de mundo) onde a comida arrastada flutua, na frente da raposa. */
const DRAG_PLANE_Z = 0.32
/** Distâncias (mundo): boca abre a partir de JAW_START; abocanha em SNAP;
 *  soltar dentro de RELEASE_EAT ainda conta como entregar. */
const JAW_START = 0.55
const SNAP = 0.16
const RELEASE_EAT = 0.34

interface Deps {
  scene: THREE.Scene
  camera: THREE.Camera
  rig: FoxRig
  animator: FoxAnimator
  particles: Particles
  stats: Stats
  pose: PoseInput
}

export class FeedingSystem {
  private templates = new Map<FoodKind, THREE.Object3D>()
  private current: THREE.Object3D | null = null
  private kind: FoodKind = 'cookie'
  private pendingBurp = false
  /** Quantos arrotinhos já saíram (testes/curiosidade). */
  burps = 0
  private phase: 'idle' | 'drag' | 'cancel' | 'fly' | 'chomp' | 'swallow' | 'burp' = 'idle'
  private t = 0
  private cycleT = 0
  private bitten = false
  private bites = 0
  private from = new THREE.Vector3()
  private mouth = new THREE.Vector3()
  private jaw = 0
  private dragTarget = new THREE.Vector3()
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -DRAG_PLANE_Z)
  /** Chamado quando a refeição termina (main devolve o estado pra IDLE). */
  onDone: (() => void) | null = null
  /** Chamado quando ela abocanha (DRAGGING → EATING). */
  onSnap: (() => void) | null = null
  /** Chamado quando o arrasto é cancelado (soltou longe). */
  onCancel: (() => void) | null = null

  constructor(private deps: Deps) {}

  async preload(): Promise<void> {
    const loader = new GLTFLoader()
    await Promise.all(
      FOOD_KINDS.map(async (kind) => {
        const gltf = await loader.loadAsync(asset(`models/${kind}.glb`))
        this.templates.set(kind, gltf.scene)
      }),
    )
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  get dragging(): boolean {
    return this.phase === 'drag'
  }

  /** Ponto do dedo projetado no plano de arrasto. */
  private fingerPoint(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 {
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.camera)
    if (!this.ray.ray.intersectPlane(this.dragPlane, out)) out.set(0, 0.6, DRAG_PLANE_Z)
    return out
  }

  private spawn(kind: FoodKind): boolean {
    const tpl = this.templates.get(kind)
    if (!tpl || this.active) return false
    this.kind = kind
    this.current = tpl.clone(true)
    this.current.rotation.x = 1.1 // inclinada pra câmera (biscoito de frente)
    this.deps.scene.add(this.current)
    this.t = 0
    this.bites = 0
    this.jaw = 0
    return true
  }

  /** Começa o arrasto com a comida grudada no dedo. */
  beginDrag(kind: FoodKind, clientX: number, clientY: number): boolean {
    if (!this.spawn(kind)) return false
    this.fingerPoint(clientX, clientY, this.dragTarget)
    this.current!.position.copy(this.dragTarget)
    this.phase = 'drag'
    return true
  }

  moveDrag(clientX: number, clientY: number): void {
    if (this.phase !== 'drag') return
    this.fingerPoint(clientX, clientY, this.dragTarget)
    // ela acompanha o petisco com o olhar
    this.deps.pose.gazeX = (clientX / innerWidth) * 2 - 1
    this.deps.pose.gazeY = -((clientY / innerHeight) * 2 - 1)
    this.deps.pose.gazeActive = true
  }

  /** Soltou o dedo: tap = voo automático; perto da boca = entrega; longe = cancela. */
  endDrag(tap: boolean): void {
    if (this.phase !== 'drag') return
    const dist = this.current!.position.distanceTo(this.mouthAnchor())
    if (tap) {
      this.from.copy(this.current!.position)
      this.phase = 'fly'
      this.t = 0
    } else if (dist < RELEASE_EAT) {
      this.startChomp()
    } else {
      this.phase = 'cancel'
      this.t = 0
    }
  }

  private startChomp(): void {
    this.phase = 'chomp'
    this.t = 0
    this.cycleT = 0
    this.bitten = false
    this.jaw = 1
    this.onSnap?.()
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
      case 'drag': {
        // comida persegue o dedo com suavização
        const p = this.current!.position
        p.x = damp(p.x, this.dragTarget.x, 22, dt)
        p.y = damp(p.y, this.dragTarget.y, 22, dt)
        p.z = damp(p.z, this.dragTarget.z, 22, dt)
        this.current!.rotation.y += dt * 2

        // boca-imã: abre conforme aproxima; pertinho, abocanha sozinha
        const dist = p.distanceTo(this.mouthAnchor())
        if (dist < SNAP) {
          this.startChomp()
          break
        }
        this.jaw = clamp((JAW_START - dist) / (JAW_START - SNAP), 0, 1) * 0.95
        break
      }
      case 'cancel': {
        // soltou longe: a comida murcha num "puf"
        const k = 1 - this.t / 0.22
        if (k <= 0) {
          this.deps.scene.remove(this.current!)
          this.current = null
          this.phase = 'idle'
          pose.jawOpen = 0
          this.onCancel?.()
          return
        }
        this.current!.scale.setScalar(Math.max(k, 0.01))
        this.jaw = damp(this.jaw, 0, 18, dt)
        break
      }
      case 'fly': {
        const k = clamp(this.t / FLY_DUR, 0, 1)
        const e = k * k * (3 - 2 * k) // smoothstep
        const target = this.mouthAnchor()
        this.current!.position.lerpVectors(this.from, target, e)
        this.current!.position.y += Math.sin(k * Math.PI) * 0.18 // arquinho
        this.current!.rotation.y += dt * 4
        this.jaw = e * 0.95 // boca abre antecipando
        if (k >= 1) this.startChomp()
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
          // momento da boca fechada = mordida (ou golinho)!
          this.bitten = true
          this.bites++
          const drinking = DRINKS.has(this.kind)
          if (drinking) {
            slurp()
            particles.spawn('drop', anchor, 3)
            // a caixinha/copo inclina a cada gole
            this.current!.rotation.x -= 0.28
          } else {
            chomp()
            particles.spawn('crumb', anchor, 5)
          }
          if (this.bites >= CHOMPS) {
            this.deps.scene.remove(this.current!)
            this.current = null
            this.phase = 'swallow'
            this.t = 0
            gulp()
            animator.bounce()
            stats.addHunger(30)
            stats.addHappiness(4)
            // comer suja os dentinhos (bebida menos) — escova na pia!
            stats.addTeeth(drinking ? -10 : -15)
            // barriga estufada? arrotinho a caminho
            this.pendingBurp = stats.hunger >= 99.5
          } else if (!drinking) {
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
          if (this.pendingBurp) {
            this.pendingBurp = false
            this.phase = 'burp'
            this.t = 0
            burp()
            this.burps++
            animator.flinch() // encolhidinha de vergonha
          } else {
            this.phase = 'idle'
            pose.jawOpen = 0
            this.onDone?.()
            return
          }
        }
        break
      }
      case 'burp': {
        // boquinha abre no arroto e fecha devagarinho
        this.jaw = this.t < 0.3 ? 0.55 : damp(this.jaw, 0, 10, dt)
        if (this.t > 0.8) {
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
