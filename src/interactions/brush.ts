import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GameScene } from '../scene'
import { FOX_HEIGHT } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import type { FoxRig } from '../fox/rig'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Rooms, BATH_LOOK, ROOM_META } from '../game/rooms'
import { brushScrub, gargle, spit, sparkle, pop, bubblePop, ShowerSound } from '../audio/sfx'
import { asset } from '../utils/assets'
import { clamp, damp } from '../utils/math'

/** Escovação em close: tap na PIA → a câmera dá zoom na boca ESCANCARADA,
 *  mostrando os dentinhos com manchas de sujeira. A escova 3D segue o dedo
 *  esfregando as manchas (espuminha de pasta gruda nos dentes); depois o
 *  jatinho de água 💦 enxágua tudo → gargarejo, cuspidinha e dentes novos. */

export type BrushTool = 'brush' | 'jet'

const MAX_PASTE = 10
const SPOT_HP_PX = 130 // px de escovada em cima de cada mancha pra limpar
const CLEAN_RADIUS = 0.06 // alcance (mundo) da cabeça da escova
const JET_RADIUS = 0.14 // alcance do jatinho tirando espuma
const FALLBACK_PROGRESS_PX = 520 // dentes já ~limpos: só esfregar completa
const BRUSH_PLANE_Z = 0.42 // plano do dedo/escova na frente da carinha

/** Manchinhas NOS dentes, relativas ao pivô da mandíbula (mouthWorld):
 *  3 na fileira de cima (crânio) e 3 na de baixo já considerando a boca
 *  aberta do modo escovação. z empurrado pra frente da malha (depthTest on:
 *  a escova passa POR CIMA e cobre as manchas — oclusão correta). */
const SPOT_OFFSETS: [number, number, number][] = [
  [-0.05, -0.008, 0.16], [0.0, -0.011, 0.165], [0.05, -0.008, 0.16],
  [-0.04, -0.081, 0.133], [0.017, -0.083, 0.135], [0.046, -0.079, 0.13],
]

interface Deps {
  gs: GameScene
  rooms: Rooms
  behavior: FoxBehavior
  particles: Particles
  stats: Stats
  pose: PoseInput
  rig: FoxRig
  hitProxy: THREE.Object3D
  canvas: HTMLCanvasElement
}

interface Spot {
  sprite: THREE.Sprite
  offset: [number, number, number]
  hp: number
  alive: boolean
}

function pasteTexture(): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  for (const [x, y, r] of [[24, 30, 15], [40, 26, 11], [34, 42, 12]] as const) {
    const g = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, r)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#c8f2e4') // espuma mentolada
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function plaqueTexture(): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  // sujeirinha amarelo-amarronzada grudada no dente
  const blobs: [number, number, number, number][] = [
    [30, 32, 16, 0.85], [42, 26, 10, 0.7], [22, 42, 9, 0.65], [40, 42, 7, 0.6],
  ]
  for (const [x, y, r, a] of blobs) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r)
    g.addColorStop(0, `rgba(150, 112, 44, ${a})`)
    g.addColorStop(0.7, `rgba(122, 88, 38, ${a * 0.8})`)
    g.addColorStop(1, 'rgba(122, 88, 38, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class BrushSystem {
  active = false
  tool: BrushTool = 'brush'
  /** 0..1 — fração das manchas escovadas (ou esfregada, se dente limpo). */
  progress = 0
  onEnter: (() => void) | null = null
  onExit: (() => void) | null = null
  /** Auto-troca de ferramenta (escovou tudo → jatinho) — UI reflete. */
  onToolChange: ((tool: BrushTool) => void) | null = null
  onHint: ((text: string) => void) | null = null

  private brushSet: THREE.Group | null = null
  private brushMesh: THREE.Group | null = null
  private pasteMat = new THREE.SpriteMaterial({
    map: pasteTexture(),
    depthWrite: false,
    transparent: true,
  })
  private plaqueMat = new THREE.SpriteMaterial({
    map: plaqueTexture(),
    depthWrite: false,
    transparent: true,
  })
  private paste: THREE.Sprite[] = []
  private spots: Spot[] = []
  private rinsePhase: 'idle' | 'gargle' | 'spit' | 'done' = 'idle'
  private rinseT = 0
  private dragging = false
  private strokePx = 0
  private pastePx = 0
  private foamSpawned = false
  private announcedJet = false
  private pendingJet = false
  private scrubCooldown = 0
  private dropCooldown = 0
  private lastX = 0
  private lastY = 0
  private downT = 0
  private downMoved = 0
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private fingerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -BRUSH_PLANE_Z)
  private brushPoint = new THREE.Vector3()
  private mouth = new THREE.Vector3()
  private tmpV = new THREE.Vector3()
  private tmpV2 = new THREE.Vector3()
  private shower = new ShowerSound()
  private cursor: HTMLDivElement
  private t = 0
  // orientação da escova: cerdas do modelo (+y) viradas pros dentes (-z, com
  // leve subida), depois inclinação diagonal em torno do eixo da tela
  private brushQTip = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2 + 0.28,
  )
  private brushQ = new THREE.Quaternion()
  private zAxis = new THREE.Vector3(0, 0, 1)
  // câmera em zoom na boca (vai e volta suave)
  private zoom = 0
  private camSaved = false
  private baseCamPos = new THREE.Vector3()
  private baseCamQuat = new THREE.Quaternion()
  private baseLook = new THREE.Vector3(0, FOX_HEIGHT * 0.48, 0)

  constructor(private deps: Deps) {
    this.cursor = document.createElement('div')
    this.cursor.className = 'tool-cursor'
    this.cursor.hidden = true
    this.cursor.textContent = '💦'
    document.querySelector('#hud')!.appendChild(this.cursor)

    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
    canvas.addEventListener('pointercancel', () => this.stopDrag())
  }

  get ready(): boolean {
    return this.brushSet !== null && this.brushMesh !== null
  }

  /** Manchas de sujeira ainda visíveis nos dentes (asserido nos testes). */
  get dirtCount(): number {
    return this.spots.filter((s) => s.alive).length
  }

  /** Espuminha de pasta ainda nos dentes (o jatinho remove). */
  get foamCount(): number {
    return this.paste.length
  }

  /** Centro da boca em px (pros testes esfregarem no lugar certo). */
  mouthScreen(): { x: number; y: number } {
    this.deps.rig.mouthWorld(this.tmpV)
    this.tmpV.y -= 0.03
    this.tmpV.z += 0.16
    this.tmpV.project(this.deps.gs.camera)
    return { x: ((this.tmpV.x + 1) / 2) * innerWidth, y: ((1 - this.tmpV.y) / 2) * innerHeight }
  }

  async preload(): Promise<void> {
    const loader = new GLTFLoader()
    const [set, brush] = await Promise.all([
      loader.loadAsync(asset('models/brush-set.glb')),
      loader.loadAsync(asset('models/toothbrush.glb')),
    ])
    this.brushSet = set.scene
    this.brushSet.visible = false
    this.deps.gs.scene.add(this.brushSet)
    this.brushMesh = brush.scene
    this.brushMesh.visible = false
    this.brushMesh.scale.setScalar(0.42)
    this.deps.gs.scene.add(this.brushMesh)
  }

  setTool(tool: BrushTool): void {
    this.tool = tool
    if (tool !== 'jet') this.shower.stop()
    if (this.brushMesh && tool !== 'brush') this.brushMesh.visible = false
    this.cursor.hidden = true
  }

  enter(): void {
    if (this.active || !this.brushSet) return
    if (!this.deps.behavior.tryStartBrush()) return
    this.active = true
    this.progress = 0
    this.strokePx = 0
    this.pastePx = 0
    this.foamSpawned = false
    this.announcedJet = false
    this.pendingJet = false
    this.rinsePhase = 'idle'
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = false
    this.brushSet.visible = true
    this.deps.gs.setRoomLook(BATH_LOOK)
    this.deps.rig.setTeethVisible(true) // a arcada só aparece aqui
    this.saveCamera()
    this.makeSpots()
    this.setTool('brush')
    pop()
    this.onHint?.('🪥 Esfregue os dentinhos!')
    this.onEnter?.()
  }

  exit(): void {
    if (!this.active) return
    this.active = false
    this.stopDrag()
    this.clearPaste()
    this.clearSpots()
    this.rinsePhase = 'idle'
    this.deps.pose.jawOpen = 0
    this.deps.rig.setTeethVisible(false)
    if (this.brushSet) this.brushSet.visible = false
    if (this.brushMesh) this.brushMesh.visible = false
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = true
    this.deps.gs.setRoomLook(ROOM_META[this.deps.rooms.current].look)
    this.deps.behavior.enter('IDLE')
    this.onExit?.()
  }

  // ---------------------------------------------------------------- câmera

  private saveCamera(): void {
    if (this.camSaved) return
    this.baseCamPos.copy(this.deps.gs.camera.position)
    this.baseCamQuat.copy(this.deps.gs.camera.quaternion)
    this.camSaved = true
  }

  private updateCamera(dt: number): void {
    if (!this.camSaved) return
    this.zoom = damp(this.zoom, this.active ? 1 : 0, 5, dt)
    const cam = this.deps.gs.camera
    if (!this.active && this.zoom < 0.002) {
      cam.position.copy(this.baseCamPos)
      cam.quaternion.copy(this.baseCamQuat)
      return
    }
    const k = this.zoom * this.zoom * (3 - 2 * this.zoom) // easing suave
    const m = this.deps.rig.mouthWorld(this.mouth)
    // perto da boca aberta mas com a carinha no quadro (a respiração da
    // cabeça dá um leve "handheld")
    this.tmpV.set(0, m.y + 0.16, m.z + 1.18)
    cam.position.lerpVectors(this.baseCamPos, this.tmpV, k)
    this.tmpV2.set(0, m.y + 0.03, m.z + 0.18)
    this.tmpV.lerpVectors(this.baseLook, this.tmpV2, k)
    cam.lookAt(this.tmpV)
  }

  // ---------------------------------------------------------------- manchas

  private makeSpots(): void {
    this.clearSpots()
    const teeth = this.deps.stats.teeth
    const count = teeth >= 95 ? 0 : Math.min(SPOT_OFFSETS.length, Math.ceil((100 - teeth) / 18))
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(this.plaqueMat)
      sprite.renderOrder = 30
      const size = 0.034 + (i % 3) * 0.004
      sprite.scale.setScalar(size)
      sprite.userData.baseScale = size
      this.deps.gs.scene.add(sprite)
      this.spots.push({ sprite, offset: SPOT_OFFSETS[i], hp: SPOT_HP_PX, alive: true })
    }
  }

  private clearSpots(): void {
    for (const s of this.spots) this.deps.gs.scene.remove(s.sprite)
    this.spots = []
  }

  private refreshProgress(): void {
    if (this.spots.length === 0) {
      this.progress = Math.min(1, this.strokePx / FALLBACK_PROGRESS_PX)
    } else {
      const total = this.spots.length * SPOT_HP_PX
      const cleaned = this.spots.reduce((acc, s) => acc + (SPOT_HP_PX - Math.max(0, s.hp)), 0)
      this.progress = cleaned / total
    }
    if (this.progress >= 1 && !this.announcedJet) {
      this.announcedJet = true
      // troca pro jatinho só quando o dedo soltar (trocar no meio do arrasto
      // faria o resto do gesto enxaguar sem o jogador perceber)
      if (this.dragging) this.pendingJet = true
      else this.switchToJet()
    }
  }

  private switchToJet(): void {
    this.pendingJet = false
    this.setTool('jet')
    this.onToolChange?.('jet')
    this.onHint?.('💦 Agora enxágua com o jatinho!')
  }

  // ---------------------------------------------------------------- entrada

  private hitFox(clientX: number, clientY: number): THREE.Vector3 | null {
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    const hits = this.ray.intersectObject(this.deps.hitProxy, true)
    return hits.length ? hits[0].point : null
  }

  private hitSink(clientX: number, clientY: number): boolean {
    const group = this.deps.rooms.currentGroup()
    const sink = group?.getObjectByName('Sink')
    if (!sink) return false
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    return this.ray.intersectObject(sink, true).length > 0
  }

  private fingerWorld(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 {
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    if (!this.ray.ray.intersectPlane(this.fingerPlane, out)) out.set(0, 0.7, BRUSH_PLANE_Z)
    return out
  }

  private onDown(e: PointerEvent): void {
    this.downT = performance.now()
    this.downMoved = 0
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active || this.rinsePhase !== 'idle') return
    this.dragging = true
    this.applyTool(e.clientX, e.clientY, 0)
  }

  private onMove(e: PointerEvent): void {
    const d = Math.hypot(e.clientX - this.lastX, e.clientY - this.lastY)
    this.downMoved += d
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active || !this.dragging || this.rinsePhase !== 'idle') return
    this.applyTool(e.clientX, e.clientY, d)
  }

  private onUp(e: PointerEvent): void {
    if (this.active) {
      this.stopDrag()
      return
    }
    // fora do modo: tap na PIA entra (tap na raposa não conta)
    const isTap = performance.now() - this.downT < 300 && this.downMoved < 14
    if (
      isTap &&
      this.deps.rooms.current === 'banheiro' &&
      this.deps.behavior.state === 'IDLE' &&
      !this.hitFox(e.clientX, e.clientY) &&
      this.hitSink(e.clientX, e.clientY)
    ) {
      this.enter()
    }
  }

  private stopDrag(): void {
    this.dragging = false
    this.shower.stop()
    if (this.brushMesh) this.brushMesh.visible = false
    this.cursor.hidden = true
    if (this.pendingJet && this.active) this.switchToJet()
  }

  // ---------------------------------------------------------------- ferramentas

  private applyTool(clientX: number, clientY: number, movedPx: number): void {
    const p = this.fingerWorld(clientX, clientY, this.brushPoint)
    const m = this.deps.rig.mouthWorld(this.mouth)

    if (this.tool === 'jet') {
      this.cursor.hidden = false
      this.cursor.style.transform = `translate(${clientX - 22}px, ${clientY - 30}px)`
      this.shower.start()
      if (this.dropCooldown <= 0) {
        this.tmpV.set(p.x + (Math.random() - 0.5) * 0.06, p.y + 0.1, m.z + 0.24)
        this.deps.particles.spawn('drop', this.tmpV, 2)
        this.dropCooldown = 0.055
      }
      this.jetAt(p)
      return
    }

    // escova 3D segue o dedo (cabeça no dedo, cabo descendo pra direita)
    if (this.brushMesh) {
      this.brushMesh.visible = true
      this.brushMesh.position.set(p.x + 0.02, p.y - 0.1, 0.34)
    }
    const nearMouth = Math.hypot(p.x - m.x, p.y - (m.y - 0.05)) < 0.34
    if (!nearMouth || movedPx <= 0) return

    let scrubbedSpot = false
    for (const s of this.spots) {
      if (!s.alive) continue
      const dist = Math.hypot(p.x - s.sprite.position.x, p.y - s.sprite.position.y)
      if (dist < CLEAN_RADIUS + s.sprite.scale.x * 0.5) {
        s.hp -= movedPx
        scrubbedSpot = true
        if (s.hp <= 0) {
          s.alive = false
          s.sprite.visible = false
          bubblePop()
          this.deps.particles.spawn('drop', s.sprite.position, 3)
          this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.25)
        }
      }
    }
    if (this.spots.length === 0) this.strokePx += movedPx
    if (scrubbedSpot || this.spots.length === 0) {
      if (this.scrubCooldown <= 0) {
        brushScrub()
        this.scrubCooldown = 0.14
      }
      this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.04)
    }
    this.refreshProgress()

    // espuminha de pasta gruda nos dentes conforme esfrega
    this.pastePx += movedPx
    if (this.pastePx >= 34 && this.paste.length < MAX_PASTE) {
      this.pastePx = 0
      this.foamSpawned = true
      const s = new THREE.Sprite(this.pasteMat)
      s.renderOrder = 32
      s.position.set(
        m.x + clamp(p.x - m.x, -0.14, 0.14) + (Math.random() - 0.5) * 0.04,
        m.y - 0.05 + clamp(p.y - (m.y - 0.05), -0.09, 0.06) + (Math.random() - 0.5) * 0.04,
        m.z + 0.25,
      )
      const size = 0.055 + Math.random() * 0.035
      s.scale.setScalar(size)
      s.userData.baseScale = size
      s.userData.phase = Math.random() * Math.PI * 2
      this.deps.gs.scene.add(s)
      this.paste.push(s)
    }
  }

  private jetAt(p: THREE.Vector3): void {
    let removed = 0
    this.paste = this.paste.filter((f) => {
      if (removed < 2 && Math.hypot(p.x - f.position.x, p.y - f.position.y) < JET_RADIUS) {
        this.deps.gs.scene.remove(f)
        this.deps.particles.spawn('drop', f.position, 2)
        bubblePop()
        removed++
        return false
      }
      return true
    })
    if (removed > 0) {
      this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.08)
    }
  }

  private clearPaste(): void {
    for (const f of this.paste) this.deps.gs.scene.remove(f)
    this.paste = []
  }

  /** Gargarejo → cuspidinha → dentes novos. Dispara sozinho quando a boca
   *  está escovada (progress 1) e o jatinho tirou toda a espuma. */
  private startRinse(): void {
    if (this.rinsePhase !== 'idle') return
    this.rinsePhase = 'gargle'
    this.rinseT = 0
    this.stopDrag()
    gargle()
  }

  update(dt: number): void {
    this.updateCamera(dt)
    if (!this.active) return
    this.t += dt
    this.scrubCooldown -= dt
    this.dropCooldown -= dt
    const m = this.deps.rig.mouthWorld(this.mouth)

    // boca escancarada + olhinhos acompanhando a ferramenta (vesguinha fofa)
    if (this.rinsePhase === 'idle') {
      this.deps.pose.jawOpen = 0.95
      this.deps.pose.gazeActive = true
      if (this.dragging) {
        this.tmpV.copy(this.brushPoint).project(this.deps.gs.camera)
        this.deps.pose.gazeX = clamp(this.tmpV.x, -1, 1)
        this.deps.pose.gazeY = clamp(this.tmpV.y, -1, 1)
      } else {
        this.deps.pose.gazeX = 0
        this.deps.pose.gazeY = -0.15
      }
    }

    // manchas e espuma acompanham a cabeça (respiração) e "respiram" junto
    for (const s of this.spots) {
      s.sprite.position.set(m.x + s.offset[0], m.y + s.offset[1], m.z + s.offset[2])
      if (s.alive) {
        const base = s.sprite.userData.baseScale as number
        s.sprite.scale.setScalar(base * (1 + 0.08 * Math.sin(this.t * 2.6 + s.offset[0] * 40)))
      }
    }
    for (const f of this.paste) {
      const base = f.userData.baseScale as number
      f.scale.setScalar(base * (1 + 0.1 * Math.sin(this.t * 4 + (f.userData.phase as number))))
    }

    // balancinho da escova enquanto esfrega
    if (this.brushMesh?.visible) {
      this.brushQ.setFromAxisAngle(this.zAxis, 2.05 + Math.sin(this.t * 26) * 0.09)
      this.brushMesh.quaternion.copy(this.brushQ).multiply(this.brushQTip)
    }

    // escovou tudo + enxaguou tudo → gargarejo final
    if (
      this.rinsePhase === 'idle' &&
      this.progress >= 1 &&
      this.foamSpawned &&
      this.paste.length === 0
    ) {
      this.startRinse()
    }

    // timeline do enxágue
    if (this.rinsePhase === 'gargle') {
      this.rinseT += dt
      this.deps.pose.gazeActive = true
      this.deps.pose.gazeY = 0.9 // cabecinha pra cima gargarejando
      this.deps.pose.jawOpen = 0.5 + 0.15 * Math.sin(this.t * 22)
      if (this.rinseT > 1.3) {
        this.rinsePhase = 'spit'
        this.rinseT = 0
        spit()
        // cuspidinha pro lado
        this.tmpV.set(m.x + 0.22, m.y - 0.12, m.z + 0.18)
        this.deps.particles.spawn('drop', this.tmpV, 6)
      }
    } else if (this.rinsePhase === 'spit') {
      this.rinseT += dt
      this.deps.pose.gazeActive = true
      this.deps.pose.gazeY = -0.5
      this.deps.pose.gazeX = 0.5
      this.deps.pose.jawOpen = 0.35
      if (this.rinseT > 0.55) {
        this.rinsePhase = 'done'
        this.clearPaste()
        this.deps.pose.jawOpen = 0
        this.deps.pose.gazeActive = false
        // dentinhos NOVOS ✨
        this.deps.stats.setTeeth(100)
        this.deps.stats.addHappiness(8)
        sparkle()
        this.tmpV.set(m.x, m.y + 0.18, m.z + 0.1)
        this.deps.particles.spawn('heart', this.tmpV, 5)
        this.progress = 0
        this.strokePx = 0
        this.foamSpawned = false
        this.onHint?.('✨ Dentinhos novinhos!')
        this.rinsePhase = 'idle'
      }
    }
  }
}
