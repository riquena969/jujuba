import * as THREE from 'three'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Rooms } from '../game/rooms'
import { blub, bubblePop, roundUp, deflate, sparkle, pop } from '../audio/sfx'
import { clamp } from '../utils/math'

/** Minigame das bolhas de sabão: tap no assoprador inicia; bolhas sobem com
 *  movimento orgânico e o jogador estoura TODAS antes de escaparem lá em cima.
 *  Rodadas: mais bolhas, mais rápidas, mais dançantes. Uma escapou = fim. */

const ESCAPE_Y = 2.35 // acima disso a bolha "fugiu" (topo do frustum + folga)

interface Bubble {
  sprite: THREE.Sprite
  vy: number
  baseX: number
  size: number
  // dois senos dessincronizados = dança orgânica de bolha de sabão
  f1: number
  f2: number
  a1: number
  a2: number
  ph1: number
  ph2: number
  born: number
}

interface Deps {
  gs: GameScene
  rooms: Rooms
  behavior: FoxBehavior
  particles: Particles
  stats: Stats
  pose: PoseInput
  canvas: HTMLCanvasElement
}

function bubbleTexture(): THREE.CanvasTexture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const cx = s / 2
  const r = s * 0.46
  // miolo quase transparente
  const body = ctx.createRadialGradient(cx, cx, r * 0.2, cx, cx, r)
  body.addColorStop(0, 'rgba(255,255,255,0.05)')
  body.addColorStop(0.82, 'rgba(255,255,255,0.08)')
  body.addColorStop(1, 'rgba(255,255,255,0.55)')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(cx, cx, r, 0, Math.PI * 2)
  ctx.fill()
  // iridescência: arcos coloridos perto da borda
  const arcs: [string, number, number][] = [
    ['rgba(255,150,200,0.5)', 0.3, 1.6], ['rgba(140,220,255,0.5)', 2.2, 3.4],
    ['rgba(200,160,255,0.45)', 4.0, 5.1], ['rgba(150,255,220,0.4)', 5.5, 6.1],
  ]
  ctx.lineWidth = s * 0.05
  for (const [col, a0, a1] of arcs) {
    ctx.strokeStyle = col
    ctx.beginPath()
    ctx.arc(cx, cx, r * 0.88, a0, a1)
    ctx.stroke()
  }
  // aro fininho + brilho
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = s * 0.025
  ctx.beginPath()
  ctx.arc(cx, cx, r * 0.97, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.38, cx - r * 0.42, s * 0.09, s * 0.055, -0.6, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class BubbleGame {
  active = false
  round = 0
  popped = 0
  onEnter: (() => void) | null = null
  onExit: (() => void) | null = null
  /** HUD: (rodada, estouradas) */
  onHud: ((round: number, popped: number) => void) | null = null

  private mat = new THREE.SpriteMaterial({
    map: bubbleTexture(),
    depthWrite: false,
    transparent: true,
  })
  private bubbles: Bubble[] = []
  private toSpawn = 0
  private spawnTimer = 0
  private t = 0
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private downT = 0
  private downMoved = 0
  private lastX = 0
  private lastY = 0
  private ending = false

  constructor(private deps: Deps) {
    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => {
      this.downT = performance.now()
      this.downMoved = 0
      this.lastX = e.clientX
      this.lastY = e.clientY
      if (this.active) this.tryPop(e.clientX, e.clientY)
    })
    canvas.addEventListener('pointermove', (e) => {
      this.downMoved += Math.hypot(e.clientX - this.lastX, e.clientY - this.lastY)
      this.lastX = e.clientX
      this.lastY = e.clientY
    })
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
  }

  get bubbleCount(): number {
    return this.bubbles.length
  }

  /** Posições das bolhas em px (pros testes mirarem). */
  screenPositions(): { x: number; y: number }[] {
    const v = new THREE.Vector3()
    return this.bubbles.map((b) => {
      v.copy(b.sprite.position).project(this.deps.gs.camera)
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
    })
  }

  private hitBlower(x: number, y: number): boolean {
    const group = this.deps.rooms.currentGroup()
    const blower = group?.getObjectByName('Blower')
    if (!blower) return false
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    return this.ray.intersectObject(blower, true).length > 0
  }

  private onUp(e: PointerEvent): void {
    if (this.active) return
    const isTap = performance.now() - this.downT < 300 && this.downMoved < 14
    if (
      isTap &&
      this.deps.rooms.current === 'brinquedos' &&
      this.deps.behavior.state === 'IDLE' &&
      this.hitBlower(e.clientX, e.clientY)
    ) {
      this.enter()
    }
  }

  enter(): void {
    if (this.active) return
    if (!this.deps.behavior.tryStartPlay()) return
    this.active = true
    this.ending = false
    this.round = 0
    this.popped = 0
    pop()
    this.startRound(1)
    this.onEnter?.()
  }

  exit(): void {
    if (!this.active) return
    this.active = false
    this.clear()
    this.deps.behavior.enter('IDLE')
    this.onExit?.()
  }

  private clear(): void {
    for (const b of this.bubbles) this.deps.gs.scene.remove(b.sprite)
    this.bubbles = []
    this.toSpawn = 0
  }

  private startRound(r: number): void {
    this.round = r
    this.toSpawn = 2 + r
    this.spawnTimer = 0.4
    this.onHud?.(this.round, this.popped)
  }

  private spawn(): void {
    const r = this.round
    const size = 0.16 + Math.random() * 0.1
    const sprite = new THREE.Sprite(this.mat)
    // nasce perto do assoprador (direita) com espalhamento crescente
    const spread = Math.min(0.7, 0.25 + r * 0.06)
    sprite.position.set(0.5 + (Math.random() - 0.5) * spread * 2, 0.25, 0.45)
    sprite.scale.setScalar(size)
    this.deps.gs.scene.add(sprite)
    const speed = 0.24 + r * 0.045 + Math.random() * 0.08
    const sway = 0.05 + r * 0.02
    this.bubbles.push({
      sprite,
      vy: speed,
      baseX: sprite.position.x,
      size,
      f1: 0.9 + Math.random() * 0.9,
      f2: 2.1 + Math.random() * 1.6,
      a1: sway * (0.7 + Math.random() * 0.6),
      a2: sway * 0.45 * (0.7 + Math.random() * 0.6),
      ph1: Math.random() * Math.PI * 2,
      ph2: Math.random() * Math.PI * 2,
      born: this.t,
    })
    blub()
  }

  private tryPop(x: number, y: number): void {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    const hits = this.ray.intersectObjects(this.bubbles.map((b) => b.sprite))
    if (hits.length === 0) return
    const sprite = hits[0].object as THREE.Sprite
    const i = this.bubbles.findIndex((b) => b.sprite === sprite)
    if (i < 0) return
    const b = this.bubbles.splice(i, 1)[0]
    this.deps.gs.scene.remove(b.sprite)
    this.popped++
    bubblePop()
    this.deps.particles.spawn('drop', b.sprite.position, 4)
    this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.3)
    this.onHud?.(this.round, this.popped)

    // rodada limpa?
    if (this.bubbles.length === 0 && this.toSpawn === 0) {
      roundUp()
      this.deps.stats.addHappiness(2)
      this.startRound(this.round + 1)
    }
  }

  private gameOver(): void {
    if (this.ending) return
    this.ending = true
    deflate()
    // recompensa proporcional; rodadas altas = jingle
    this.deps.stats.addHappiness(Math.min(20, this.popped))
    if (this.round >= 4) sparkle()
    setTimeout(() => this.exit(), 900)
  }

  update(dt: number): void {
    if (!this.active) return
    this.t += dt

    if (this.toSpawn > 0) {
      this.spawnTimer -= dt
      if (this.spawnTimer <= 0) {
        this.spawn()
        this.toSpawn--
        this.spawnTimer = Math.max(0.35, 1.0 - this.round * 0.07)
      }
    }

    let gazeTarget: THREE.Vector3 | null = null
    for (const b of this.bubbles) {
      const age = this.t - b.born
      // dança orgânica: dois senos + respiração de tamanho + sobe acelerando de leve
      b.sprite.position.y += b.vy * dt * (1 + age * 0.03)
      b.sprite.position.x =
        b.baseX + Math.sin(age * b.f1 + b.ph1) * b.a1 + Math.sin(age * b.f2 + b.ph2) * b.a2
      b.sprite.scale.setScalar(b.size * (1 + 0.06 * Math.sin(age * 3.1 + b.ph2)))
      if (!gazeTarget || b.sprite.position.y > gazeTarget.y) gazeTarget = b.sprite.position
    }

    // ela acompanha a bolha mais alta, encantada
    if (gazeTarget) {
      const v = gazeTarget.clone().project(this.deps.gs.camera)
      this.deps.pose.gazeX = clamp(v.x, -1, 1)
      this.deps.pose.gazeY = clamp(v.y, -1, 1)
      this.deps.pose.gazeActive = true
    }

    // escapou = fim de jogo
    if (!this.ending && this.bubbles.some((b) => b.sprite.position.y > ESCAPE_Y)) {
      this.gameOver()
    }
  }
}
