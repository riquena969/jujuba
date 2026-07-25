import './style.css'
import * as THREE from 'three'
import { createScene, FOX_HEIGHT } from './scene'
import { FoxRig } from './fox/rig'
import { FoxAnimator, createPoseInput } from './fox/animations'
import { Expressions } from './fox/expressions'
import { FoxBehavior } from './fox/behavior'
import { Particles } from './fx/particles'
import { Stats } from './game/state'
import { setupPointer } from './interactions/pointer'
import { FeedingSystem } from './interactions/feeding'
import { VoiceSystem } from './interactions/voice'
import { createUI } from './game/ui'

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

// Proxy invisível de colisão (raycast estável e barato numa cápsula)
const hitProxy = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.36, FOX_HEIGHT - 0.72, 6, 12),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
)
hitProxy.position.y = FOX_HEIGHT / 2
gs.foxRoot.add(hitProxy)

// ---- Sistemas ----
const pose = createPoseInput()
const stats = new Stats()
const particles = new Particles(gs.scene)

let rig: FoxRig | null = null
let animator: FoxAnimator | null = null
let expressions: Expressions | null = null
let behavior: FoxBehavior | null = null
let feeding: FeedingSystem | null = null
let voice: VoiceSystem | null = null

FoxRig.load('/models/jujuba.glb')
  .then((loaded) => {
    rig = loaded
    animator = new FoxAnimator(loaded)
    expressions = new Expressions(loaded)
    behavior = new FoxBehavior({ animator, expressions, particles, stats, pose })
    gs.foxRoot.remove(placeholder)
    placeholder.geometry.dispose()
    gs.foxRoot.add(loaded.root)
    setupPointer({ canvas, camera: gs.camera, hitTarget: hitProxy, behavior, pose })

    feeding = new FeedingSystem({ scene: gs.scene, rig: loaded, animator, particles, stats, pose })
    feeding.onDone = () => behavior?.enter('IDLE')
    void feeding.preload()
    voice = new VoiceSystem({ behavior, pose })
    const ui = createUI({
      onFeed(kind) {
        if (!behavior || !feeding || feeding.active) return
        if (behavior.tryStartEating() && !feeding.start(kind)) behavior.enter('IDLE')
      },
      async onMicToggle() {
        if (!voice) return false
        if (voice.enabled) {
          voice.disable()
        } else {
          await voice.enable()
        }
        syncMicVisual()
        return voice.enabled
      },
    })
    const syncMicVisual = () => {
      if (!voice || !behavior) return
      ui.setMicVisual(
        !voice.enabled
          ? 'off'
          : behavior.state === 'LISTENING'
            ? 'listening'
            : behavior.state === 'REPLAYING'
              ? 'replaying'
              : 'on',
      )
    }
    behavior.onState(syncMicVisual)
    stats.onChange((s) => ui.updateBars(s.hunger, s.happiness))
    ui.updateBars(stats.hunger, stats.happiness)
    if (DEBUG) console.log('[jujuba] rig carregado ✓')
  })
  .catch((err) => console.error('[jujuba] falha carregando modelo:', err))

// ---- Game loop ----
let last = performance.now()
let elapsed = 0

function tick() {
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  elapsed += dt

  stats.update(dt)
  if (behavior) behavior.update(dt)
  if (feeding) feeding.update(dt)
  if (voice) voice.update()
  if (animator) animator.update(dt, pose)
  if (expressions) expressions.update(dt)
  particles.update(dt)

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
      stats,
      get state() {
        return behavior?.state ?? 'LOADING'
      },
      get behavior() {
        return behavior
      },
      get rigReady() {
        return rig !== null
      },
      get voice() {
        return voice
      },
      get elapsed() {
        return elapsed
      },
      renderer: gs.renderer,
    },
  })
}
