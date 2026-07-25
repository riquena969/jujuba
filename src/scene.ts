import * as THREE from 'three'

export interface RoomLook {
  bgTop: string
  bgBottom: string
  floor: string
  rug: string
  rugRim: string
}

export interface GameScene {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Âncora da raposa — o modelo (ou placeholder) entra aqui, pés no y=0. */
  foxRoot: THREE.Group
  resize(): void
  /** Troca cores de fundo/chão/tapete (visual da sala atual). */
  setRoomLook(look: RoomLook): void
  /** 0 = dia, 1 = luz apagada (dormindo). */
  setDim(k: number): void
}

const SHADOW = 'rgba(146, 82, 58, 0.32)'

/** Look padrão (sala de estar). */
export const DEFAULT_LOOK: RoomLook = {
  bgTop: '#ffeeda',
  bgBottom: '#ffcfae',
  floor: '#f6c9a4',
  rug: '#fff3e6',
  rugRim: '#f9b9a0',
}

/** Altura da raposa em unidades de mundo — contrato com o modelo do Blender. */
export const FOX_HEIGHT = 1.15

function gradientTexture(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 512
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 2, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function blobShadowTexture(): THREE.CanvasTexture {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, SHADOW)
  g.addColorStop(0.55, 'rgba(146, 82, 58, 0.16)')
  g.addColorStop(1, 'rgba(146, 82, 58, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.toneMapping = THREE.NeutralToneMapping
  // Sem shadow maps: sombra é um blob fake (barato pra mobile).

  const scene = new THREE.Scene()
  scene.background = gradientTexture(DEFAULT_LOOK.bgTop, DEFAULT_LOOK.bgBottom)
  // Fog na cor do fundo funde o chão com o backdrop (sem linha de horizonte dura)
  scene.fog = new THREE.Fog(DEFAULT_LOOK.bgBottom, 5, 16)

  // ---- Luzes: 3 pontos suaves, clima pastel ----
  const hemi = new THREE.HemisphereLight('#fff6e8', '#ffc09a', 0.9)
  const key = new THREE.DirectionalLight('#fff4ea', 1.7)
  key.position.set(2.5, 4, 3)
  const fill = new THREE.DirectionalLight('#ffdff0', 0.55)
  fill.position.set(-3, 2, 2.5)
  const rim = new THREE.DirectionalLight('#ffffff', 0.5)
  rim.position.set(0, 3.5, -4)
  scene.add(hemi, key, fill, rim)
  const lights = [hemi, key, fill, rim]
  const baseIntensity = lights.map((l) => l.intensity)

  // ---- Quarto: chão + tapete redondo ----
  const floorMat = new THREE.MeshStandardMaterial({ color: DEFAULT_LOOK.floor, roughness: 1 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const rugRimMat = new THREE.MeshStandardMaterial({ color: DEFAULT_LOOK.rugRim, roughness: 1 })
  const rugRim = new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), rugRimMat)
  rugRim.rotation.x = -Math.PI / 2
  rugRim.position.y = 0.004
  const rugMat = new THREE.MeshStandardMaterial({ color: DEFAULT_LOOK.rug, roughness: 1 })
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.38, 48), rugMat)
  rug.rotation.x = -Math.PI / 2
  rug.position.y = 0.008
  scene.add(rugRim, rug)

  // ---- Sombra blob sob a raposa ----
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: blobShadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.012
  scene.add(blob)

  const foxRoot = new THREE.Group()
  scene.add(foxRoot)

  // ---- Câmera portrait enquadrando a raposa pela altura (FOV é vertical) ----
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
  const fillRatio = 0.45 // raposa ocupa ~45% da altura do frame (sobra ar pro HUD)
  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  const dist = FOX_HEIGHT / fillRatio / (2 * Math.tan(fovRad / 2))
  camera.position.set(0, FOX_HEIGHT * 0.62, dist)
  camera.lookAt(0, FOX_HEIGHT * 0.48, 0)

  function resize() {
    renderer.setSize(innerWidth, innerHeight)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
  }
  resize()

  function setRoomLook(look: RoomLook) {
    const old = scene.background as THREE.Texture | null
    scene.background = gradientTexture(look.bgTop, look.bgBottom)
    old?.dispose()
    ;(scene.fog as THREE.Fog).color.set(look.bgBottom)
    floorMat.color.set(look.floor)
    rugMat.color.set(look.rug)
    rugRimMat.color.set(look.rugRim)
  }

  function setDim(k: number) {
    lights.forEach((l, i) => {
      l.intensity = baseIntensity[i] * (1 - 0.72 * k)
    })
  }

  return { renderer, scene, camera, foxRoot, resize, setRoomLook, setDim }
}
