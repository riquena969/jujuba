import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Rooms, BATH_LOOK, ROOM_META } from '../game/rooms'
import { brushScrub, gargle, spit, sparkle, pop } from '../audio/sfx'
import { asset } from '../utils/assets'

/** Escovação: tap na PIA entra no modo; escova esfregando a boca (progresso +
 *  espuminha de pasta), depois Enxaguar → gargarejo, cuspidinha e dentes novos. */

const PROGRESS_PX = 620 // px de escovada pra completar
const MAX_PASTE = 12

interface Deps {
  gs: GameScene
  rooms: Rooms
  behavior: FoxBehavior
  particles: Particles
  stats: Stats
  pose: PoseInput
  hitProxy: THREE.Object3D
  canvas: HTMLCanvasElement
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

export class BrushSystem {
  active = false
  /** 0..1 — escovada acumulada. */
  progress = 0
  onEnter: (() => void) | null = null
  onExit: (() => void) | null = null

  private brushSet: THREE.Group | null = null
  private pasteMat = new THREE.SpriteMaterial({
    map: pasteTexture(),
    depthWrite: false,
    transparent: true,
  })
  private paste: THREE.Sprite[] = []
  private rinsePhase: 'idle' | 'gargle' | 'spit' | 'done' = 'idle'
  private rinseT = 0
  private dragging = false
  private overMouth = false
  private scrubCooldown = 0
  private lastX = 0
  private lastY = 0
  private downT = 0
  private downMoved = 0
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private cursor: HTMLDivElement
  private t = 0

  constructor(private deps: Deps) {
    this.cursor = document.createElement('div')
    this.cursor.className = 'tool-cursor'
    this.cursor.hidden = true
    this.cursor.textContent = '🪥'
    document.querySelector('#hud')!.appendChild(this.cursor)

    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
    canvas.addEventListener('pointercancel', () => this.stopDrag())
  }

  get ready(): boolean {
    return this.brushSet !== null
  }

  async preload(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(asset('models/brush-set.glb'))
    this.brushSet = gltf.scene
    this.brushSet.visible = false
    this.deps.gs.scene.add(this.brushSet)
  }

  enter(): void {
    if (this.active || !this.brushSet) return
    if (!this.deps.behavior.tryStartBrush()) return
    this.active = true
    this.progress = 0
    this.rinsePhase = 'idle'
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = false
    this.brushSet.visible = true
    this.deps.gs.setRoomLook(BATH_LOOK)
    pop()
    this.onEnter?.()
  }

  exit(): void {
    if (!this.active) return
    this.active = false
    this.stopDrag()
    this.clearPaste()
    this.rinsePhase = 'idle'
    this.deps.pose.jawOpen = 0
    if (this.brushSet) this.brushSet.visible = false
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = true
    this.deps.gs.setRoomLook(ROOM_META[this.deps.rooms.current].look)
    this.deps.behavior.enter('IDLE')
    this.onExit?.()
  }

  /** Botão "Enxaguar": gargarejo → cuspidinha → dentes limpos (se escovou). */
  rinse(): void {
    if (!this.active || this.rinsePhase !== 'idle') return
    this.rinsePhase = 'gargle'
    this.rinseT = 0
    gargle()
  }

  private clearPaste(): void {
    for (const p of this.paste) this.deps.gs.scene.remove(p)
    this.paste = []
  }

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

  private onDown(e: PointerEvent): void {
    this.downT = performance.now()
    this.downMoved = 0
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active || this.rinsePhase !== 'idle') return
    this.dragging = true
    this.cursor.hidden = false
    this.moveCursor(e.clientX, e.clientY)
  }

  private onMove(e: PointerEvent): void {
    const d = Math.hypot(e.clientX - this.lastX, e.clientY - this.lastY)
    this.downMoved += d
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active || !this.dragging || this.rinsePhase !== 'idle') return
    this.moveCursor(e.clientX, e.clientY)
    const hit = this.hitFox(e.clientX, e.clientY)
    this.overMouth = hit !== null
    if (!hit) return
    this.progress = Math.min(1, this.progress + d / PROGRESS_PX)
    if (this.scrubCooldown <= 0) {
      brushScrub()
      this.scrubCooldown = 0.14
    }
    if (this.paste.length < MAX_PASTE && Math.random() < 0.35) {
      const s = new THREE.Sprite(this.pasteMat)
      // espuminha gruda em volta da boca
      s.position.set((Math.random() - 0.5) * 0.16, 0.66 + Math.random() * 0.08, 0.34)
      const size = 0.07 + Math.random() * 0.05
      s.scale.setScalar(size)
      s.userData.baseScale = size
      s.userData.phase = Math.random() * Math.PI * 2
      this.deps.gs.scene.add(s)
      this.paste.push(s)
    }
    this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.05)
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
    this.overMouth = false
    this.cursor.hidden = true
  }

  private moveCursor(x: number, y: number): void {
    this.cursor.style.transform = `translate(${x - 22}px, ${y - 30}px)`
  }

  update(dt: number): void {
    if (!this.active) return
    this.t += dt
    this.scrubCooldown -= dt

    // boquinha aberta enquanto escova
    if (this.rinsePhase === 'idle') {
      this.deps.pose.jawOpen = this.dragging && this.overMouth ? 0.7 : 0.15
    }

    // espuminha respira
    for (const p of this.paste) {
      const base = p.userData.baseScale as number
      p.scale.setScalar(base * (1 + 0.1 * Math.sin(this.t * 4 + (p.userData.phase as number))))
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
        const at = new THREE.Vector3(0.28, 0.62, 0.3)
        this.deps.particles.spawn('drop', at, 6)
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
        if (this.progress >= 1) {
          // dentinhos NOVOS ✨
          this.deps.stats.setTeeth(100)
          this.deps.stats.addHappiness(8)
          sparkle()
          this.deps.particles.spawn('heart', new THREE.Vector3(0, 0.95, 0.25), 5)
        }
        this.progress = 0
        this.rinsePhase = 'idle'
      }
    }
  }
}
