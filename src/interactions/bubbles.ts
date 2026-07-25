import * as THREE from 'three'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Rooms, BUBBLE_LOOK, ROOM_META } from '../game/rooms'
import { blub, bubblePop, roundUp, deflate, sparkle, pop } from '../audio/sfx'
import { clamp } from '../utils/math'

/** Minigame das bolhas de sabão: tap no potinho inicia; o cenário vira um
 *  jardim de céu aberto e as bolhas entram por BAIXO da tela, dançando até o
 *  topo — o jogador estoura todas antes de escaparem. Rodadas: mais bolhas,
 *  mais rápidas, mais dançantes. Uma escapou = fim.
 *
 *  Tudo em coordenadas DE TELA (NDC → mundo no plano das bolhas): nascem
 *  abaixo da borda real de baixo, fogem na borda real de cima e o x é
 *  limitado pra nenhuma bolha sair da área visível (sempre dá pra estourar). */

const BUBBLE_Z = 0.45 // plano (mundo) onde as bolhas vivem
const SIDE_NDC = 0.86 // |x| máximo em NDC — margem pro dedo alcançar
const ESCAPE_NDC_Y = 1.08 // acima disso (topo real + folga) a bolha "fugiu"

interface Bubble {
  sprite: THREE.Sprite
  vy: number
  baseX: number
  xMin: number
  xMax: number
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

function cloudTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const puffs: [number, number, number][] = [
    [70, 84, 38], [120, 68, 46], [175, 82, 40], [105, 92, 40], [148, 92, 38],
  ]
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.2, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
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
    depthTest: false, // bolha nunca "afunda" atrás do chão/props
    transparent: true,
  })
  private cloudMat = new THREE.SpriteMaterial({
    map: cloudTexture(),
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  })
  private bubbles: Bubble[] = []
  private clouds: THREE.Sprite[] = []
  private toSpawn = 0
  private spawnTimer = 0
  private t = 0
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -BUBBLE_Z)
  private tmpV = new THREE.Vector3()
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

  /** Ponto tocável do potinho em px (pros testes, sem coordenada mágica):
   *  meio do corpo do pote, não o centro do bbox (que pode cair no ar). */
  blowerScreenPosition(): { x: number; y: number } | null {
    const blower = this.deps.rooms.currentGroup()?.getObjectByName('Blower')
    if (!blower) return null
    const box = new THREE.Box3().setFromObject(blower)
    const v = box.getCenter(new THREE.Vector3())
    v.y = box.min.y + (box.max.y - box.min.y) * 0.18 // barriga do pote
    v.project(this.deps.gs.camera)
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
  }

  /** Ponto de mundo no plano das bolhas visto em (nx, ny) de NDC. */
  private worldAtNdc(nx: number, ny: number, out: THREE.Vector3): THREE.Vector3 {
    this.ndc.set(nx, ny)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    if (!this.ray.ray.intersectPlane(this.plane, out)) out.set(0, 0.5, BUBBLE_Z)
    return out
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
    // POKED conta: o tap pode ter acertado raposa E pote (ele fica meio na
    // frente dela) — se o dedo tocou o pote, o minigame é a intenção.
    const st = this.deps.behavior.state
    if (
      isTap &&
      this.deps.rooms.current === 'brinquedos' &&
      (st === 'IDLE' || st === 'POKED') &&
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
    // tema: jardim de céu aberto (props da sala saem de cena)
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = false
    this.deps.gs.setRoomLook(BUBBLE_LOOK)
    this.addClouds()
    pop()
    this.startRound(1)
    this.onEnter?.()
  }

  exit(): void {
    if (!this.active) return
    this.active = false
    this.clear()
    this.removeClouds()
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = true
    this.deps.gs.setRoomLook(ROOM_META[this.deps.rooms.current].look)
    this.deps.behavior.enter('IDLE')
    this.onExit?.()
  }

  private addClouds(): void {
    const spots: [number, number, number, number][] = [
      // x, y, escala, deriva
      [-1.3, 2.5, 1.6, 0.05], [1.1, 3.1, 2.1, -0.035], [0.2, 2.1, 1.2, 0.04],
    ]
    for (const [x, y, scale, drift] of spots) {
      const s = new THREE.Sprite(this.cloudMat)
      s.position.set(x, y, -2.5)
      s.scale.set(scale, scale * 0.5, 1)
      s.userData.drift = drift
      this.deps.gs.scene.add(s)
      this.clouds.push(s)
    }
  }

  private removeClouds(): void {
    for (const c of this.clouds) this.deps.gs.scene.remove(c)
    this.clouds = []
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
    sprite.renderOrder = 40
    // nasce logo ABAIXO da borda de baixo da tela, espalhando mais a cada rodada
    const spread = Math.min(0.78, 0.3 + r * 0.07)
    const nx = (Math.random() - 0.5) * 2 * spread
    this.worldAtNdc(nx, -1.18, sprite.position)
    sprite.scale.setScalar(size)
    this.deps.gs.scene.add(sprite)
    // limites laterais (mundo) equivalentes à borda visível — sempre estourável
    const xMin = this.worldAtNdc(-SIDE_NDC, 0, this.tmpV).x
    const xMax = this.worldAtNdc(SIDE_NDC, 0, this.tmpV).x
    const speed = 0.24 + r * 0.045 + Math.random() * 0.08
    const sway = 0.05 + r * 0.02
    this.bubbles.push({
      sprite,
      vy: speed,
      baseX: clamp(sprite.position.x, xMin, xMax),
      xMin,
      xMax,
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

    // nuvens derivam devagarzinho
    for (const c of this.clouds) {
      c.position.x += (c.userData.drift as number) * dt
      if (c.position.x > 2.2) c.position.x = -2.2
      if (c.position.x < -2.2) c.position.x = 2.2
    }

    let gazeTarget: THREE.Vector3 | null = null
    let escaped = false
    for (const b of this.bubbles) {
      const age = this.t - b.born
      // dança orgânica: dois senos + respiração de tamanho + sobe acelerando de leve
      b.sprite.position.y += b.vy * dt * (1 + age * 0.03)
      b.sprite.position.x = clamp(
        b.baseX + Math.sin(age * b.f1 + b.ph1) * b.a1 + Math.sin(age * b.f2 + b.ph2) * b.a2,
        b.xMin,
        b.xMax,
      )
      b.sprite.scale.setScalar(b.size * (1 + 0.06 * Math.sin(age * 3.1 + b.ph2)))
      if (!gazeTarget || b.sprite.position.y > gazeTarget.y) gazeTarget = b.sprite.position
      // fugiu pela borda REAL de cima da tela?
      this.tmpV.copy(b.sprite.position).project(this.deps.gs.camera)
      if (this.tmpV.y > ESCAPE_NDC_Y) escaped = true
    }

    // ela acompanha a bolha mais alta, encantada
    if (gazeTarget) {
      const v = gazeTarget.clone().project(this.deps.gs.camera)
      this.deps.pose.gazeX = clamp(v.x, -1, 1)
      this.deps.pose.gazeY = clamp(v.y, -1, 1)
      this.deps.pose.gazeActive = true
    }

    if (!this.ending && escaped) this.gameOver()
  }
}
