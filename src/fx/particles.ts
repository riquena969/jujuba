import * as THREE from 'three'

type Kind = 'heart' | 'crumb'

interface Particle {
  sprite: THREE.Sprite
  life: number
  maxLife: number
  vel: THREE.Vector3
  baseScale: number
  kind: Kind
}

function heartTexture(): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.translate(s / 2, s / 2)
  ctx.scale(s / 32, s / 32)
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.bezierCurveTo(-14, -2, -9, -14, 0, -7)
  ctx.bezierCurveTo(9, -14, 14, -2, 0, 10)
  const g = ctx.createLinearGradient(0, -14, 0, 10)
  g.addColorStop(0, '#ff8fb3')
  g.addColorStop(1, '#ff5f8d')
  ctx.fillStyle = g
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function crumbTexture(): THREE.CanvasTexture {
  const s = 32
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#8a5a35'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const POOL_SIZE = 48

export class Particles {
  private pool: Particle[] = []
  private materials: Record<Kind, THREE.SpriteMaterial>

  constructor(private scene: THREE.Scene) {
    this.materials = {
      heart: new THREE.SpriteMaterial({ map: heartTexture(), depthWrite: false, transparent: true }),
      crumb: new THREE.SpriteMaterial({ map: crumbTexture(), depthWrite: false, transparent: true }),
    }
  }

  spawn(kind: Kind, pos: THREE.Vector3, count = 1): void {
    for (let i = 0; i < count; i++) {
      let p = this.pool.find((q) => q.life <= 0)
      if (!p) {
        if (this.pool.length >= POOL_SIZE) return
        const sprite = new THREE.Sprite(this.materials[kind].clone())
        this.scene.add(sprite)
        p = { sprite, life: 0, maxLife: 1, vel: new THREE.Vector3(), baseScale: 0.1, kind }
        this.pool.push(p)
      }
      p.kind = kind
      p.sprite.material = this.materials[kind]
      p.sprite.visible = true
      const jitter = kind === 'heart' ? 0.12 : 0.06
      p.sprite.position.copy(pos).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * jitter * 2,
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter + 0.05,
        ),
      )
      if (kind === 'heart') {
        p.maxLife = p.life = 1.1 + Math.random() * 0.3
        p.vel.set((Math.random() - 0.5) * 0.25, 0.55 + Math.random() * 0.25, 0.05)
        p.baseScale = 0.09 + Math.random() * 0.05
      } else {
        p.maxLife = p.life = 0.7 + Math.random() * 0.2
        p.vel.set((Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.5, 0.25 + Math.random() * 0.2)
        p.baseScale = 0.028 + Math.random() * 0.018
      }
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        p.sprite.visible = false
        continue
      }
      const k = p.life / p.maxLife // 1 → 0
      if (p.kind === 'crumb') p.vel.y -= 2.6 * dt // gravidade
      p.sprite.position.addScaledVector(p.vel, dt)
      const grow = p.kind === 'heart' ? 1.35 - k * 0.35 : 1
      p.sprite.scale.setScalar(p.baseScale * grow)
      p.sprite.material.opacity = Math.min(1, k * 3)
    }
  }
}
