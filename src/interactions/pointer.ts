import * as THREE from 'three'
import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import { unlockAudio } from '../audio/context'

interface Opts {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  /** Proxy invisível de colisão cobrindo a raposa. */
  hitTarget: THREE.Object3D
  behavior: FoxBehavior
  pose: PoseInput
}

const STROKE_WINDOW_MS = 700
const STROKE_MIN_PX = 120
const TAP_MAX_MS = 220
const TAP_MAX_PX = 10

/** Classificador de gestos: esfregada (carinho) × tap (poke) + gaze. */
export function setupPointer({ canvas, camera, hitTarget, behavior, pose }: Opts): void {
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  let down = false
  let downT = 0
  let totalMoved = 0
  let overFoxAtDown = false
  let lastX = 0
  let lastY = 0
  let gazeIdleTimer: ReturnType<typeof setTimeout> | undefined
  /** janela móvel de distâncias esfregadas sobre a raposa */
  let stroke: { d: number; t: number }[] = []

  function hitFox(clientX: number, clientY: number): THREE.Vector3 | null {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObject(hitTarget, true)
    return hits.length ? hits[0].point : null
  }

  function updateGaze(clientX: number, clientY: number): void {
    pose.gazeX = (clientX / innerWidth) * 2 - 1
    pose.gazeY = -((clientY / innerHeight) * 2 - 1)
    pose.gazeActive = true
    clearTimeout(gazeIdleTimer)
    gazeIdleTimer = setTimeout(() => (pose.gazeActive = false), 2500)
  }

  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio()
    down = true
    downT = performance.now()
    totalMoved = 0
    stroke = []
    lastX = e.clientX
    lastY = e.clientY
    overFoxAtDown = hitFox(e.clientX, e.clientY) !== null
    updateGaze(e.clientX, e.clientY)
  })

  canvas.addEventListener('pointermove', (e) => {
    updateGaze(e.clientX, e.clientY)
    if (!down) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    const d = Math.hypot(dx, dy)
    totalMoved += d

    const hit = hitFox(e.clientX, e.clientY)
    if (!hit) return
    const now = performance.now()
    stroke.push({ d, t: now })
    stroke = stroke.filter((s) => now - s.t < STROKE_WINDOW_MS)
    const sum = stroke.reduce((acc, s) => acc + s.d, 0)
    if (sum >= STROKE_MIN_PX) {
      behavior.petPulse(hit, ndc.x)
    }
  })

  canvas.addEventListener('pointerup', (e) => {
    if (!down) return
    down = false
    const dur = performance.now() - downT
    if (dur < TAP_MAX_MS && totalMoved < TAP_MAX_PX && overFoxAtDown) {
      if (hitFox(e.clientX, e.clientY)) behavior.poke()
    }
  })

  canvas.addEventListener('pointercancel', () => {
    down = false
  })
}
