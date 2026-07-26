import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { Particles } from '../fx/particles'
import type { Stats } from '../game/state'
import { Rooms, BATH_LOOK, ROOM_META } from '../game/rooms'
import { scrub, splash, bubblePop, sparkle, ShowerSound } from '../audio/sfx'
import { asset } from '../utils/assets'

export type BathTool = 'sponge' | 'shower'

const MAX_FOAM = 96 // dá pra ensaboar a raposa INTEIRA (40 nem cobria metade)
/** px de esfregada que geram uma bolha nova */
const FOAM_STROKE_PX = 26
/** raio (mundo) que a ducha limpa por passada */
const RINSE_RADIUS = 0.2
/** espuma mínima pra valer celebração de "ficou limpinha!" */
const CLEAN_MIN_FOAM = 6

interface Deps {
  gs: GameScene
  rooms: Rooms
  behavior: FoxBehavior
  particles: Particles
  stats: Stats
  /** cápsula invisível da raposa (mesma do carinho) */
  hitProxy: THREE.Object3D
  canvas: HTMLCanvasElement
}

function foamTexture(): THREE.CanvasTexture {
  const s = 96
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const blobs = [
    [34, 42, 24], [58, 36, 19], [50, 60, 20], [70, 56, 13], [26, 62, 13],
  ]
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#dceef8')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  for (const [x, y] of [[40, 34], [62, 50], [36, 58]]) {
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class BathSystem {
  active = false
  tool: BathTool = 'sponge'
  onEnter: (() => void) | null = null
  onExit: (() => void) | null = null

  private bathSet: THREE.Group | null = null
  private foamMat = new THREE.SpriteMaterial({
    map: foamTexture(),
    depthWrite: false,
    transparent: true,
  })
  private foam: THREE.Sprite[] = []
  private everFoamed = false
  private strokePx = 0
  private scrubCooldown = 0
  private dragging = false
  private lastX = 0
  private lastY = 0
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private shower = new ShowerSound()
  private cursor: HTMLDivElement
  private downT = 0
  private downMoved = 0
  private t = 0

  constructor(private deps: Deps) {
    this.cursor = document.createElement('div')
    this.cursor.className = 'tool-cursor'
    this.cursor.hidden = true
    document.querySelector('#hud')!.appendChild(this.cursor)

    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
    canvas.addEventListener('pointercancel', () => this.stopDrag())
  }

  get foamCount(): number {
    return this.foam.length
  }

  get ready(): boolean {
    return this.bathSet !== null
  }

  async preload(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(asset('models/bath-set.glb'))
    this.bathSet = gltf.scene
    this.bathSet.visible = false
    this.deps.gs.scene.add(this.bathSet)
  }

  setTool(tool: BathTool): void {
    this.tool = tool
    if (tool !== 'shower') this.shower.stop()
    this.cursor.textContent = tool === 'sponge' ? '🧽' : '🚿'
  }

  enter(): void {
    if (this.active || !this.bathSet) return
    if (!this.deps.behavior.tryStartBath()) return
    this.active = true
    this.everFoamed = false
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = false
    this.bathSet.visible = true
    this.deps.gs.setRoomLook(BATH_LOOK)
    this.setTool('sponge')
    splash()
    this.onEnter?.()
  }

  exit(): void {
    if (!this.active) return
    this.active = false
    this.stopDrag()
    this.clearFoam()
    if (this.bathSet) this.bathSet.visible = false
    const group = this.deps.rooms.currentGroup()
    if (group) group.visible = true
    this.deps.gs.setRoomLook(ROOM_META[this.deps.rooms.current].look)
    this.deps.behavior.enter('IDLE')
    this.onExit?.()
  }

  private clearFoam(): void {
    for (const f of this.foam) this.deps.gs.scene.remove(f)
    this.foam = []
  }

  private hitFox(clientX: number, clientY: number): THREE.Vector3 | null {
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    const hits = this.ray.intersectObject(this.deps.hitProxy, true)
    return hits.length ? hits[0].point : null
  }

  /** Raycast na banheira da SALA (mesh 'Tub') pra entrar no banho. */
  private hitTub(clientX: number, clientY: number): boolean {
    const group = this.deps.rooms.currentGroup()
    const tub = group?.getObjectByName('Tub')
    if (!tub) return false
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    return this.ray.intersectObject(tub, true).length > 0
  }

  private onDown(e: PointerEvent): void {
    this.downT = performance.now()
    this.downMoved = 0
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active) return
    this.dragging = true
    this.strokePx = FOAM_STROKE_PX // primeira bolha já no toque
    this.cursor.hidden = false
    this.moveCursor(e.clientX, e.clientY)
    this.applyTool(e.clientX, e.clientY, 0)
  }

  private onMove(e: PointerEvent): void {
    const d = Math.hypot(e.clientX - this.lastX, e.clientY - this.lastY)
    this.downMoved += d
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.active || !this.dragging) return
    this.moveCursor(e.clientX, e.clientY)
    this.applyTool(e.clientX, e.clientY, d)
  }

  private onUp(e: PointerEvent): void {
    if (this.active) {
      this.stopDrag()
      return
    }
    // fora do banho: tap na banheira do banheiro entra no modo banho
    // (tap na RAPOSA não conta — senão o raio atravessa e acha a banheira atrás)
    const isTap = performance.now() - this.downT < 300 && this.downMoved < 14
    if (
      isTap &&
      this.deps.rooms.current === 'banheiro' &&
      this.deps.behavior.state === 'IDLE' &&
      !this.hitFox(e.clientX, e.clientY) &&
      this.hitTub(e.clientX, e.clientY)
    ) {
      this.enter()
    }
  }

  private stopDrag(): void {
    this.dragging = false
    this.shower.stop()
    this.cursor.hidden = true
  }

  private moveCursor(x: number, y: number): void {
    this.cursor.style.transform = `translate(${x - 22}px, ${y - 26}px)`
  }

  private applyTool(clientX: number, clientY: number, movedPx: number): void {
    const hit = this.hitFox(clientX, clientY)
    if (this.tool === 'shower') {
      // ducha liga sempre que segurando; só limpa/goteja sobre a raposa
      this.shower.start()
      if (!hit) return
      this.deps.particles.spawn('drop', hit.clone().add(new THREE.Vector3(0, 0.12, 0.05)), 2)
      this.rinseAt(hit)
      this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.06)
      return
    }
    // esponja
    if (!hit) return
    this.strokePx += movedPx
    if (this.strokePx >= FOAM_STROKE_PX) {
      this.strokePx = 0
      this.addFoam(hit)
      if (this.scrubCooldown <= 0) {
        scrub()
        this.scrubCooldown = 0.16
      }
      this.deps.behavior.bathHappy = Math.min(1, this.deps.behavior.bathHappy + 0.12)
    }
  }

  private addFoam(at: THREE.Vector3): void {
    if (this.foam.length >= MAX_FOAM) return
    const s = new THREE.Sprite(this.foamMat)
    s.position.copy(at)
    s.position.z += 0.06
    s.position.x += (Math.random() - 0.5) * 0.05
    s.position.y += (Math.random() - 0.5) * 0.05
    const size = 0.13 + Math.random() * 0.09
    s.scale.setScalar(size)
    s.userData.baseScale = size
    s.userData.phase = Math.random() * Math.PI * 2
    this.deps.gs.scene.add(s)
    this.foam.push(s)
    this.everFoamed = this.everFoamed || this.foam.length >= CLEAN_MIN_FOAM
  }

  private rinseAt(at: THREE.Vector3): void {
    let popped = 0
    this.foam = this.foam.filter((f) => {
      if (popped < 3 && f.position.distanceTo(at) < RINSE_RADIUS) {
        this.deps.gs.scene.remove(f)
        this.deps.particles.spawn('drop', f.position, 2)
        bubblePop()
        popped++
        return false
      }
      return true
    })
    if (popped > 0 && this.foam.length === 0 && this.everFoamed) {
      // limpinha! 🎉
      this.everFoamed = false
      this.deps.stats.addHappiness(10)
      this.deps.stats.setHygiene(100) // banho tira toda a sujeira
      sparkle()
      const head = new THREE.Vector3(0, 0.95, 0.2)
      this.deps.particles.spawn('heart', head, 6)
    }
  }

  update(dt: number): void {
    this.t += dt
    this.scrubCooldown -= dt
    // espuminhas respiram
    for (const f of this.foam) {
      const base = f.userData.baseScale as number
      f.scale.setScalar(base * (1 + 0.08 * Math.sin(this.t * 3 + (f.userData.phase as number))))
    }
  }
}
