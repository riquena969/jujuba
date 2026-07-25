import './style.css'
import * as THREE from 'three'
import { createScene } from './scene'
import { FoxRig } from './fox/rig'
import { FoxAnimator, createPoseInput } from './fox/animations'
import { Expressions } from './fox/expressions'

const DEBUG = import.meta.env.DEV || location.search.includes('debug')

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const gs = createScene(canvas)

// Placeholder até o glb carregar
const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 0.55, 8, 24),
  new THREE.MeshStandardMaterial({ color: '#ff9a5c', roughness: 0.85 }),
)
placeholder.position.y = 0.595
gs.foxRoot.add(placeholder)

// ---- Estado global do jogo (cresce nos próximos milestones) ----
const pose = createPoseInput()
let rig: FoxRig | null = null
let animator: FoxAnimator | null = null
let expressions: Expressions | null = null

FoxRig.load('/models/jujuba.glb')
  .then((loaded) => {
    rig = loaded
    animator = new FoxAnimator(loaded)
    expressions = new Expressions(loaded)
    gs.foxRoot.remove(placeholder)
    placeholder.geometry.dispose()
    gs.foxRoot.add(loaded.root)
    if (DEBUG) console.log('[jujuba] rig carregado ✓')
  })
  .catch((err) => console.error('[jujuba] falha carregando modelo:', err))

// ---- Olhar segue o dedo/mouse (interações completas no M4) ----
let gazeIdleTimer: ReturnType<typeof setTimeout> | undefined
function trackPointer(e: PointerEvent) {
  pose.gazeX = (e.clientX / innerWidth) * 2 - 1
  pose.gazeY = -((e.clientY / innerHeight) * 2 - 1)
  pose.gazeActive = true
  clearTimeout(gazeIdleTimer)
  gazeIdleTimer = setTimeout(() => (pose.gazeActive = false), 2500)
}
addEventListener('pointermove', trackPointer)
addEventListener('pointerdown', trackPointer)

// ---- Game loop ----
let last = performance.now()
let elapsed = 0

function tick() {
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  elapsed += dt

  if (animator) animator.update(dt, pose)
  if (expressions) expressions.update(dt)

  gs.renderer.render(gs.scene, gs.camera)
}

gs.renderer.setAnimationLoop(tick)

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    gs.renderer.setAnimationLoop(null)
  } else {
    last = performance.now()
    gs.renderer.setAnimationLoop(tick)
  }
})

addEventListener('resize', gs.resize)

// ---- Hook de debug (asserido pelos testes E2E) ----
if (DEBUG) {
  Object.defineProperty(window, '__jujuba', {
    value: {
      pose,
      get rigReady() {
        return rig !== null
      },
      get elapsed() {
        return elapsed
      },
      get animator() {
        return animator
      },
      get expressions() {
        return expressions
      },
      renderer: gs.renderer,
    },
  })
}
