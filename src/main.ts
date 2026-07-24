import './style.css'
import * as THREE from 'three'
import { createScene } from './scene'

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const gs = createScene(canvas)

// Placeholder da Jujuba (M1) — vira o modelo .glb no M3.
const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 0.55, 8, 24),
  new THREE.MeshStandardMaterial({ color: '#ff9a5c', roughness: 0.85 }),
)
placeholder.position.y = 0.595
gs.foxRoot.add(placeholder)

// ---- Game loop ----
let last = performance.now()

function tick() {
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  void dt // (M3+: camadas de animação consomem o dt)
  gs.renderer.render(gs.scene, gs.camera)
}

gs.renderer.setAnimationLoop(tick)

// Pausa em aba oculta (economia de bateria no celular)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    gs.renderer.setAnimationLoop(null)
  } else {
    last = performance.now() // descarta o tempo parado
    gs.renderer.setAnimationLoop(tick)
  }
})

addEventListener('resize', gs.resize)
