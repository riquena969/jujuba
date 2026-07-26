import * as THREE from 'three'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import { Rooms } from './rooms'
import { pop } from '../audio/sfx'

/** Quadro pendurado na sala: tap nele abre o painel de créditos (CC-BY dos
 *  modelos adaptados). O quadro fica em parte atrás da raposa na tela, então
 *  POKED também conta como estado válido (mesma regra do potinho de bolha). */

interface Deps {
  gs: GameScene
  rooms: Rooms
  behavior: FoxBehavior
  canvas: HTMLCanvasElement
}

export class CreditsSystem {
  onOpen: (() => void) | null = null

  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private downT = 0
  private downMoved = 0
  private lastX = 0
  private lastY = 0

  constructor(private deps: Deps) {
    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => {
      this.downT = performance.now()
      this.downMoved = 0
      this.lastX = e.clientX
      this.lastY = e.clientY
    })
    canvas.addEventListener('pointermove', (e) => {
      this.downMoved += Math.hypot(e.clientX - this.lastX, e.clientY - this.lastY)
      this.lastX = e.clientX
      this.lastY = e.clientY
    })
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
  }

  private quadro(): THREE.Object3D | null {
    if (this.deps.rooms.current !== 'sala') return null
    return this.deps.rooms.currentGroup()?.getObjectByName('Quadro') ?? null
  }

  /** Centro do quadro em px (pros testes tocarem sem coordenada mágica). */
  quadroScreenPosition(): { x: number; y: number } | null {
    const q = this.quadro()
    if (!q) return null
    const v = new THREE.Box3().setFromObject(q).getCenter(new THREE.Vector3())
    v.project(this.deps.gs.camera)
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
  }

  private onUp(e: PointerEvent): void {
    const isTap = performance.now() - this.downT < 300 && this.downMoved < 14
    if (!isTap) return
    const st = this.deps.behavior.state
    if (st !== 'IDLE' && st !== 'POKED') return
    const q = this.quadro()
    if (!q) return
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    if (this.ray.intersectObject(q, true).length === 0) return
    pop()
    this.onOpen?.()
  }
}
