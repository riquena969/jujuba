import * as THREE from 'three'

/** Manchinhas de sujeira grudadas na raposa — quanto menor a higiene, mais
 *  manchas aparecem. Posições fixas (frente do corpo/cabeça), visibilidade
 *  controlada por setHygiene(). O banho zera tudo. */

const SPOTS: [number, number, number][] = [
  [0.12, 0.52, 0.2], [-0.15, 0.44, 0.19], [0.05, 0.33, 0.22],
  [-0.08, 0.62, 0.2], [0.18, 0.72, 0.21], [-0.19, 0.78, 0.2],
  [0.1, 0.9, 0.24], [-0.06, 0.98, 0.24], [0.2, 0.28, 0.18],
  [-0.16, 0.24, 0.18],
]

function dirtTexture(): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const blobs: [number, number, number, number][] = [
    [30, 32, 15, 0.5], [42, 26, 9, 0.42], [22, 44, 8, 0.4], [44, 44, 6, 0.35],
  ]
  for (const [x, y, r, a] of blobs) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r)
    g.addColorStop(0, `rgba(101, 74, 48, ${a})`)
    g.addColorStop(1, 'rgba(101, 74, 48, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class DirtLayer {
  private sprites: THREE.Sprite[] = []

  constructor(scene: THREE.Scene) {
    const mat = new THREE.SpriteMaterial({
      map: dirtTexture(),
      depthWrite: false,
      transparent: true,
    })
    for (const [x, y, z] of SPOTS) {
      const s = new THREE.Sprite(mat)
      s.position.set(x, y, z)
      s.scale.setScalar(0.16 + Math.abs(x) * 0.2)
      s.visible = false
      scene.add(s)
      this.sprites.push(s)
    }
  }

  /** Quantas manchas estão aparecendo (debug/testes). */
  get count(): number {
    return this.sprites.filter((s) => s.visible).length
  }

  /** hygiene 100 → 0 manchas; 0 → todas. Começa a sujar abaixo de 75. */
  setHygiene(hygiene: number): void {
    const dirtiness = Math.max(0, 75 - hygiene) / 75 // 0..1
    const visible = Math.round(dirtiness * SPOTS.length)
    this.sprites.forEach((s, i) => {
      s.visible = i < visible
    })
  }
}

/** Farelinhos de comida na boca — aparecem conforme os dentes sujam. */
const MOUTH_SPOTS: [number, number, number][] = [
  [0.065, 0.695, 0.34], [-0.055, 0.66, 0.335], [0.005, 0.635, 0.33],
]

export class MouthDirt {
  private sprites: THREE.Sprite[] = []

  constructor(scene: THREE.Scene) {
    const mat = new THREE.SpriteMaterial({
      map: dirtTexture(),
      depthWrite: false,
      transparent: true,
    })
    for (const [x, y, z] of MOUTH_SPOTS) {
      const s = new THREE.Sprite(mat)
      s.position.set(x, y, z)
      s.scale.setScalar(0.075)
      s.visible = false
      scene.add(s)
      this.sprites.push(s)
    }
  }

  get count(): number {
    return this.sprites.filter((s) => s.visible).length
  }

  /** teeth 100 → limpo; <60 um farelo, <40 dois, <25 três. */
  setTeeth(teeth: number): void {
    const visible = teeth < 25 ? 3 : teeth < 40 ? 2 : teeth < 60 ? 1 : 0
    this.sprites.forEach((s, i) => {
      s.visible = i < visible
    })
  }
}
