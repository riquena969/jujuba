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
import { BathSystem } from './interactions/bath'
import { BrushSystem } from './interactions/brush'
import { PlayBall } from './interactions/playball'
import { BubbleGame } from './interactions/bubbles'
import { NeedGlow } from './fx/needglow'
import { createUI } from './game/ui'
import { Rooms, type RoomId } from './game/rooms'
import { DirtLayer, MouthDirt } from './fx/dirt'
import { asset } from './utils/assets'

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
const dirt = new DirtLayer(gs.scene)
dirt.setHygiene(stats.hygiene)
const mouthDirt = new MouthDirt(gs.scene)
mouthDirt.setTeeth(stats.teeth)
const needGlow = new NeedGlow()

let rig: FoxRig | null = null
let animator: FoxAnimator | null = null
let expressions: Expressions | null = null
let behavior: FoxBehavior | null = null
let feeding: FeedingSystem | null = null
let voice: VoiceSystem | null = null
let bath: BathSystem | null = null
let brush: BrushSystem | null = null
let ball: PlayBall | null = null
let bubbles: BubbleGame | null = null

const rooms = new Rooms(gs, stats.room as RoomId)
void rooms.load()

FoxRig.load(asset('models/jujuba.glb'))
  .then((loaded) => {
    rig = loaded
    animator = new FoxAnimator(loaded)
    expressions = new Expressions(loaded)
    behavior = new FoxBehavior({ rig: loaded, animator, expressions, particles, stats, pose })
    gs.foxRoot.remove(placeholder)
    placeholder.geometry.dispose()
    gs.foxRoot.add(loaded.root)
    setupPointer({ canvas, camera: gs.camera, hitTarget: hitProxy, behavior, pose })

    feeding = new FeedingSystem({
      scene: gs.scene,
      camera: gs.camera,
      rig: loaded,
      animator,
      particles,
      stats,
      pose,
    })
    feeding.onDone = () => behavior?.enter('IDLE')
    feeding.onSnap = () => behavior?.enter('EATING')
    feeding.onCancel = () => behavior?.enter('IDLE')
    void feeding.preload()
    voice = new VoiceSystem({ behavior, pose })
    bath = new BathSystem({ gs, rooms, behavior, particles, stats, hitProxy, canvas })
    void bath.preload()
    brush = new BrushSystem({ gs, rooms, behavior, particles, stats, pose, hitProxy, canvas })
    void brush.preload()
    ball = new PlayBall({ gs, behavior, stats, pose, canvas })
    bubbles = new BubbleGame({ gs, rooms, behavior, particles, stats, pose, canvas })
    const ui = createUI({
      onFoodDragStart(kind, x, y) {
        if (!behavior || !feeding || feeding.active) return false
        if (!behavior.tryStartDragging()) return false
        if (!feeding.beginDrag(kind, x, y)) {
          behavior.enter('IDLE')
          return false
        }
        return true
      },
      onFoodDragMove(x, y) {
        feeding?.moveDrag(x, y)
      },
      onFoodDragEnd(tap) {
        feeding?.endDrag(tap)
      },
      async onMicToggle() {
        if (!voice) return false
        if (voice.enabled) {
          voice.disable()
          stats.micUserOff = true // desligou na mão: não religar sozinho
        } else {
          await voice.enable()
          if (voice.enabled) stats.micUserOff = false
        }
        stats.save()
        syncMicVisual()
        return voice.enabled
      },
      onRoomChange(dir) {
        if (behavior?.state === 'SLEEPING') return // acorda primeiro
        rooms.go(dir)
      },
      onSleepToggle() {
        behavior?.toggleSleep()
      },
      onBathTool(tool) {
        bath?.setTool(tool)
        ui.setBathTool(tool)
      },
      onBathExit() {
        if (bath?.active) bath.exit()
        else if (brush?.active) brush.exit()
        else bubbles?.exit()
      },
      onBrushRinse() {
        brush?.rinse()
      },
      onFirstTap(name) {
        if (name) {
          stats.name = name
          stats.named = true
          stats.save()
        }
        document.title = `${stats.name} 🦊`
        tryAutoMic()
      },
      petName: stats.name,
      firstRun: !stats.named,
    })
    if (stats.named) document.title = `${stats.name} 🦊`

    // na sala de estar o mic liga sozinho (a não ser que o usuário o desligue)
    const tryAutoMic = () => {
      if (!voice || voice.enabled || stats.micUserOff) return
      if (rooms.current !== 'sala' || behavior?.state === 'SLEEPING') return
      void voice.enable().then(() => syncMicVisual())
    }
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
    const applyTeethTint = (teeth: number) => {
      if (!rig?.teethMaterial) return
      const k = 1 - teeth / 100 // 0 limpo → 1 encardido
      rig.teethMaterial.color.setRGB(1 - k * 0.2, 1 - k * 0.34, 1 - k * 0.62)
    }
    stats.onChange((s) => {
      ui.updateBars(s.hunger, s.happiness, s.energy, s.hygiene)
      dirt.setHygiene(s.hygiene)
      mouthDirt.setTeeth(s.teeth)
      applyTeethTint(s.teeth)
    })
    ui.updateBars(stats.hunger, stats.happiness, stats.energy, stats.hygiene)
    applyTeethTint(stats.teeth)

    // salas: visual + persistência + mic só na sala de estar
    rooms.onChange = (room) => {
      stats.room = room
      stats.save()
      ui.setRoom(room)
      if (room !== 'sala' && voice?.enabled) {
        voice.disable()
        syncMicVisual()
      }
      if (room === 'sala') tryAutoMic()
      ball?.setVisible(room === 'brinquedos')
    }
    ui.setRoom(rooms.current, { silent: true })
    rooms.apply()

    // modo banho: UI própria (Voltar + ferramentas)
    bath.onEnter = () => {
      ui.setBathMode(true)
      ui.setBathTool(bath!.tool)
    }
    bath.onExit = () => ui.setBathMode(false)
    brush.onEnter = () => ui.setBrushMode(true)
    brush.onExit = () => ui.setBrushMode(false)
    bubbles.onEnter = () => {
      ui.setPlayMode(true)
      ui.updateGameHud(1, 0)
    }
    bubbles.onExit = () => ui.setPlayMode(false)
    bubbles.onHud = (round, popped) => ui.updateGameHud(round, popped)

    // dormir: filtro noturno + luz baixa (e restaura sono salvo)
    behavior.onState((s) => {
      const sleeping = s === 'SLEEPING'
      ui.setSleeping(sleeping)
      gs.setDim(sleeping ? 1 : 0)
    })
    if (stats.sleeping) behavior.enter('SLEEPING')

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

  if (behavior) stats.sleeping = behavior.state === 'SLEEPING'
  stats.update(dt)
  if (behavior) behavior.update(dt)
  if (feeding) feeding.update(dt)
  if (voice) voice.update()
  if (bath) bath.update(dt)
  if (brush) brush.update(dt)
  if (ball) ball.update(dt)
  if (bubbles) bubbles.update(dt)
  needGlow.update(
    dt,
    rooms.current === 'banheiro' ? rooms.currentGroup() : undefined,
    stats.hygiene < 40,
    stats.teeth < 40,
    rooms.current === 'brinquedos' ? rooms.currentGroup() : undefined,
  )
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
      get rig() {
        return rig
      },
      get voice() {
        return voice
      },
      get bath() {
        return bath
      },
      get feeding() {
        return feeding
      },
      get brush() {
        return brush
      },
      get ball() {
        return ball
      },
      get bubbles() {
        return bubbles
      },
      dirt,
      mouthDirt,
      needGlow,
      get elapsed() {
        return elapsed
      },
      renderer: gs.renderer,
    },
  })
}
