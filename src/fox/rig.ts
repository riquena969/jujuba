import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const BONE_NAMES = [
  'root', 'spine', 'chest', 'neck', 'head', 'jaw',
  'earL', 'earR', 'eyeL', 'eyeR', 'armL', 'armR',
  'legL', 'legR', 'tailBase', 'tailMid', 'tailTip',
] as const
export type BoneName = (typeof BONE_NAMES)[number]

/** Ossos da v2 — opcionais: a v1 carrega sem eles, sem quebrar. */
export const OPTIONAL_BONE_NAMES = ['lidL', 'lidR', 'browL', 'browR', 'tongue'] as const
export type OptionalBoneName = (typeof OPTIONAL_BONE_NAMES)[number]
export type AnyBoneName = BoneName | OptionalBoneName

/** Só 'smile' é obrigatório; blinks (v1) e sad/cheekPuff (v2) são opcionais. */
export const MORPH_NAMES = ['blinkL', 'blinkR', 'smile', 'sad', 'cheekPuff'] as const
export type MorphName = (typeof MORPH_NAMES)[number]
const REQUIRED_MORPHS: MorphName[] = ['smile']

/** Estilos de olho trocáveis (v3): meshes EyeL/EyeR (large) +
 *  EyeStyleNarrowL/R (soninho) + EyeStyleSadL/R (tristinha). */
export const EYE_STYLE_NAMES = ['large', 'narrow', 'sad'] as const
export type EyeStyleName = (typeof EYE_STYLE_NAMES)[number]

interface MorphRef {
  mesh: THREE.Mesh
  index: number
}

interface RestPose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
}

/** Direções, no espaço LOCAL do osso em repouso, dos eixos de MUNDO.
 *  Girar em torno delas ≈ girar em torno do eixo de mundo (offsets pequenos). */
interface WorldAxes {
  x: THREE.Vector3
  y: THREE.Vector3
  z: THREE.Vector3
}

export class FoxRig {
  readonly bones = {} as Record<AnyBoneName, THREE.Bone>
  readonly rest = {} as Record<AnyBoneName, RestPose>
  readonly axes = {} as Record<AnyBoneName, WorldAxes>
  /** Lista por morph: glTF divide malha multi-material em vários primitives,
   *  cada um com o próprio morphTargetDictionary — escrevemos em todos. */
  private morphs = {
    blinkL: [], blinkR: [], smile: [], sad: [], cheekPuff: [],
  } as Record<MorphName, MorphRef[]>
  /** Material dos dentinhos (v2+) — escovação tinge de amarelo→branco. */
  teethMaterial: THREE.MeshStandardMaterial | null = null
  private teethObject: THREE.Object3D | null = null
  private present = new Set<AnyBoneName>()
  private readonly tmpQ = new THREE.Quaternion()
  private eyeStyles = { large: [], narrow: [], sad: [] } as Record<
    EyeStyleName,
    THREE.Object3D[]
  >
  private currentEyeStyle: EyeStyleName = 'large'

  private constructor(readonly root: THREE.Group) {}

  static async load(url: string): Promise<FoxRig> {
    const gltf = await new GLTFLoader().loadAsync(url)
    const rig = new FoxRig(gltf.scene)
    const missingBones: string[] = []
    const missingMorphs: string[] = []

    const allNames: AnyBoneName[] = [...BONE_NAMES, ...OPTIONAL_BONE_NAMES]
    for (const name of allNames) {
      const obj = gltf.scene.getObjectByName(name)
      if (!(obj instanceof THREE.Bone)) {
        if ((BONE_NAMES as readonly string[]).includes(name)) missingBones.push(name)
        continue
      }
      rig.bones[name] = obj
      rig.rest[name] = { pos: obj.position.clone(), quat: obj.quaternion.clone() }
      rig.present.add(name)
    }

    gltf.scene.updateMatrixWorld(true)
    const wq = new THREE.Quaternion()
    for (const name of rig.present) {
      const bone = rig.bones[name]
      bone.getWorldQuaternion(wq)
      const inv = wq.clone().invert()
      rig.axes[name] = {
        x: new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(),
        y: new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize(),
        z: new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize(),
      }
    }

    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.frustumCulled = false // malha skinned pequena; evita sumiço por bounds
      const dict = obj.morphTargetDictionary
      if (dict) {
        for (const name of MORPH_NAMES) {
          if (name in dict) rig.morphs[name].push({ mesh: obj, index: dict[name] })
        }
      }
    })
    // olhos por estilo (v3): EyeL/EyeR = large; EyeStyle<Nome><L|R> = extras
    for (const [style, names] of [
      ['large', ['EyeL', 'EyeR']],
      ['narrow', ['EyeStyleNarrowL', 'EyeStyleNarrowR']],
      ['sad', ['EyeStyleSadL', 'EyeStyleSadR']],
    ] as [EyeStyleName, string[]][]) {
      for (const n of names) {
        const o = gltf.scene.getObjectByName(n)
        if (o) rig.eyeStyles[style].push(o)
      }
    }
    if (rig.hasEyeStyles) rig.setEyeStyle('large')

    // material dos dentes (mesh 'Teeth' — pode ser Group de primitives)
    const teeth = gltf.scene.getObjectByName('Teeth')
    teeth?.traverse((o) => {
      if (o instanceof THREE.Mesh && !rig.teethMaterial) {
        rig.teethMaterial = o.material as THREE.MeshStandardMaterial
      }
    })
    // todos os primitives dos dentes compartilham o material
    teeth?.traverse((o) => {
      if (o instanceof THREE.Mesh && rig.teethMaterial) o.material = rig.teethMaterial
    })
    // a arcada é segredo da escovação — no resto do jogo, boquinha fofa
    rig.teethObject = teeth ?? null
    rig.setTeethVisible(false)

    for (const name of REQUIRED_MORPHS) {
      if (rig.morphs[name].length === 0) missingMorphs.push(name)
    }

    if (missingBones.length || missingMorphs.length) {
      throw new Error(
        `jujuba.glb fora do contrato — ossos faltando: [${missingBones}] morphs faltando: [${missingMorphs}]`,
      )
    }
    return rig
  }

  hasBone(name: AnyBoneName): boolean {
    return this.present.has(name)
  }

  hasMorph(name: MorphName): boolean {
    return this.morphs[name].length > 0
  }

  /** Dentinhos aparecem SÓ no modo escovação (pedido do Kevin). */
  setTeethVisible(on: boolean): void {
    if (this.teethObject) this.teethObject.visible = on
  }

  /** v3 tem estilos extras de olho; v1/v2 só o par padrão (sem troca). */
  get hasEyeStyles(): boolean {
    return this.eyeStyles.narrow.length > 0
  }

  /** Mostra um estilo de olho e esconde os outros (no-op sem estilos). */
  setEyeStyle(style: EyeStyleName): void {
    if (!this.hasEyeStyles) return
    if (this.eyeStyles[style].length === 0) style = 'large'
    if (style === this.currentEyeStyle) return
    this.currentEyeStyle = style
    for (const [s, objs] of Object.entries(this.eyeStyles)) {
      for (const o of objs) o.visible = s === style
    }
  }

  /** Piscada cartoon (v3): achata os olhos na vertical de MUNDO via escala do
   *  osso (a componente local dominante do eixo Z de mundo). */
  squashEyesVertical(k: number): void {
    if (k <= 0) return
    for (const name of ['eyeL', 'eyeR'] as const) {
      if (!this.present.has(name)) continue
      const zAxis = this.axes[name].z
      const idx =
        Math.abs(zAxis.x) >= Math.abs(zAxis.y) && Math.abs(zAxis.x) >= Math.abs(zAxis.z)
          ? 0
          : Math.abs(zAxis.y) >= Math.abs(zAxis.z)
            ? 1
            : 2
      const b = this.bones[name]
      b.scale.setComponent(idx, b.scale.getComponent(idx) * (1 - k * 0.93))
    }
  }

  /** Volta todos os ossos à pose de descanso — chamada no início de cada frame. */
  resetPose(): void {
    for (const name of this.present) {
      const b = this.bones[name]
      const r = this.rest[name]
      b.position.copy(r.pos)
      b.quaternion.copy(r.quat)
      b.scale.setScalar(1)
    }
  }

  /** Acumula rotação no osso em torno de um eixo de MUNDO (rad). */
  addRotation(name: AnyBoneName, axis: keyof WorldAxes, angle: number): void {
    if (angle === 0 || !this.present.has(name)) return
    this.tmpQ.setFromAxisAngle(this.axes[name][axis], angle)
    this.bones[name].quaternion.multiply(this.tmpQ)
  }

  addScale(name: BoneName, amount: number): void {
    this.bones[name].scale.multiplyScalar(1 + amount)
  }

  setMorph(name: MorphName, value: number): void {
    for (const { mesh, index } of this.morphs[name]) {
      mesh.morphTargetInfluences![index] = value
    }
  }

  /** Posição de mundo da boca (âncora pra comida/partículas). */
  mouthWorld(target: THREE.Vector3): THREE.Vector3 {
    this.bones.jaw.getWorldPosition(target)
    return target
  }

  headWorld(target: THREE.Vector3): THREE.Vector3 {
    this.bones.head.getWorldPosition(target)
    return target
  }
}
