import * as THREE from 'three'
import type { GameScene } from '../scene'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import type { Stats } from '../game/state'
import { boing, squeak } from '../audio/sfx'
import { clamp } from '../utils/math'

/** Bolinha estilo Pou: arrasta, arremessa, quica com física simples.
 *  A raposa acompanha com o olhar e rebate quando a bola encosta nela. */

const R = 0.14 // raio da bola
const GRAVITY = -4.2
const REST_FLOOR = 0.62
const REST_WALL = 0.72
const AIR_DRAG = 0.995
const FLOOR_FRICTION = 0.88
// paredes DENTRO do frustum visível do celular (portrait)
const WALL_X = 0.55
const Z_MIN = -0.4
const Z_MAX = 0.5
const DRAG_PLANE_Z = 0.35
/** raposa como cilindro de colisão */
const FOX_RADIUS = 0.34
const FOX_TOP = 1.05

interface Deps {
  gs: GameScene
  behavior: FoxBehavior
  stats: Stats
  pose: PoseInput
  canvas: HTMLCanvasElement
}

function beachBallTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const colors = ['#FF6B6B', '#FFF4E4', '#4ECDC4', '#FFF4E4', '#FFD166', '#FFF4E4']
  const stripe = w / colors.length
  colors.forEach((col, i) => {
    ctx.fillStyle = col
    ctx.fillRect(i * stripe, 0, stripe + 1, h)
  })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class PlayBall {
  /** true enquanto o dedo segura a bola (suprime carinho). */
  dragging = false

  private mesh: THREE.Mesh
  private vel = new THREE.Vector3()
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -DRAG_PLANE_Z)
  private grabTarget = new THREE.Vector3()
  private history: { x: number; y: number; t: number }[] = []
  private lastFoxHit = 0
  private spin = new THREE.Vector3()

  constructor(private deps: Deps) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 24, 16),
      new THREE.MeshStandardMaterial({ map: beachBallTexture(), roughness: 0.5 }),
    )
    this.mesh.position.set(0.4, R, 0.2)
    this.mesh.visible = false
    deps.gs.scene.add(this.mesh)

    const { canvas } = deps
    canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerup', () => this.onUp())
    canvas.addEventListener('pointercancel', () => this.onUp())
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on
    if (on) {
      this.mesh.position.set(0.4, R, 0.2)
      this.vel.set(0, 0, 0)
    } else {
      this.dragging = false
      this.deps.behavior.suppressPetting = false
    }
  }

  get position(): THREE.Vector3 {
    return this.mesh.position
  }

  get speed(): number {
    return this.vel.length()
  }

  /** Posição na tela em px (pros testes mirarem a bola). */
  screenPosition(): { x: number; y: number } {
    const v = this.mesh.position.clone().project(this.deps.gs.camera)
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }
  }

  private fingerPoint(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    if (!this.ray.ray.intersectPlane(this.plane, out)) out.set(0, 0.5, DRAG_PLANE_Z)
    return out
  }

  private onDown(e: PointerEvent): void {
    if (!this.mesh.visible) return
    const b = this.deps.behavior
    if (b.state !== 'IDLE' && b.state !== 'PETTING' && b.state !== 'POKED') return
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.deps.gs.camera)
    if (this.ray.intersectObject(this.mesh).length === 0) return
    this.dragging = true
    b.suppressPetting = true
    this.history = []
    this.fingerPoint(e.clientX, e.clientY, this.grabTarget)
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging) return
    this.fingerPoint(e.clientX, e.clientY, this.grabTarget)
    const now = performance.now()
    this.history.push({ x: this.grabTarget.x, y: this.grabTarget.y, t: now })
    this.history = this.history.filter((h) => now - h.t < 120)
  }

  private onUp(): void {
    if (!this.dragging) return
    this.dragging = false
    this.deps.behavior.suppressPetting = false
    // velocidade do arremesso = média do gesto recente
    if (this.history.length >= 2) {
      const a = this.history[0]
      const b = this.history[this.history.length - 1]
      const dt = Math.max(0.016, (b.t - a.t) / 1000)
      this.vel.set(
        clamp((b.x - a.x) / dt, -6, 6),
        clamp((b.y - a.y) / dt, -6, 6),
        0,
      )
      if (this.vel.length() > 1.2) this.deps.stats.addHappiness(1.5)
    }
  }

  update(dt: number): void {
    if (!this.mesh.visible) return
    const p = this.mesh.position
    const { pose } = this.deps

    if (this.dragging) {
      // segue o dedo com molinha
      p.lerp(this.grabTarget, Math.min(1, dt * 22))
      p.y = Math.max(p.y, R)
      this.vel.set(0, 0, 0)
    } else {
      this.vel.y += GRAVITY * dt
      this.vel.multiplyScalar(AIR_DRAG)
      p.addScaledVector(this.vel, dt)

      // chão
      if (p.y < R) {
        p.y = R
        if (Math.abs(this.vel.y) > 0.35) {
          boing(clamp(Math.abs(this.vel.y) / 4, 0.15, 1))
          this.vel.y = -this.vel.y * REST_FLOOR
        } else {
          this.vel.y = 0
        }
        this.vel.x *= FLOOR_FRICTION
        this.vel.z *= FLOOR_FRICTION
      }
      // paredes laterais (bordas do frustum)
      if (Math.abs(p.x) > WALL_X) {
        p.x = Math.sign(p.x) * WALL_X
        this.vel.x = -this.vel.x * REST_WALL
        boing(clamp(Math.abs(this.vel.x) / 4, 0.12, 0.8))
      }
      if (p.z < Z_MIN || p.z > Z_MAX) {
        p.z = clamp(p.z, Z_MIN, Z_MAX)
        this.vel.z = -this.vel.z * REST_WALL
      }

      // colisão com a raposa (cilindro no centro)
      const distXZ = Math.hypot(p.x, p.z)
      if (p.y < FOX_TOP + R && distXZ < FOX_RADIUS + R && this.vel.length() > 0.2) {
        const nx = p.x / (distXZ || 1)
        const nz = p.z / (distXZ || 1)
        const dot = this.vel.x * nx + this.vel.z * nz
        if (dot < 0) {
          this.vel.x -= 2 * dot * nx
          this.vel.z -= 2 * dot * nz
          this.vel.multiplyScalar(0.8)
          const now = performance.now()
          if (now - this.lastFoxHit > 600) {
            this.lastFoxHit = now
            squeak()
            this.deps.stats.addHappiness(2)
            this.deps.behavior.ballNudge()
          }
        }
        const push = FOX_RADIUS + R
        p.x = nx * push
        p.z = nz * push
      }

      // rotação de rolamento (fake mas convincente)
      this.spin.set(this.vel.z / R, 0, -this.vel.x / R)
      this.mesh.rotation.x += this.spin.x * dt
      this.mesh.rotation.z += this.spin.z * dt
    }

    // a raposa acompanha a bola com o olhar quando ela tá viva
    if (this.dragging || this.vel.length() > 0.4) {
      const ndcPos = p.clone().project(this.deps.gs.camera)
      pose.gazeX = clamp(ndcPos.x, -1, 1)
      pose.gazeY = clamp(ndcPos.y, -1, 1)
      pose.gazeActive = true
    }
  }
}
