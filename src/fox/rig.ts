import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const BONE_NAMES = [
  'root', 'spine', 'chest', 'neck', 'head', 'jaw',
  'earL', 'earR', 'eyeL', 'eyeR', 'armL', 'armR',
  'legL', 'legR', 'tailBase', 'tailMid', 'tailTip',
] as const
export type BoneName = (typeof BONE_NAMES)[number]

export const MORPH_NAMES = ['blinkL', 'blinkR', 'smile'] as const
export type MorphName = (typeof MORPH_NAMES)[number]

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
  readonly bones = {} as Record<BoneName, THREE.Bone>
  readonly rest = {} as Record<BoneName, RestPose>
  readonly axes = {} as Record<BoneName, WorldAxes>
  private morphs = {} as Record<MorphName, MorphRef>
  private readonly tmpQ = new THREE.Quaternion()

  private constructor(readonly root: THREE.Group) {}

  static async load(url: string): Promise<FoxRig> {
    const gltf = await new GLTFLoader().loadAsync(url)
    const rig = new FoxRig(gltf.scene)
    const missingBones: string[] = []
    const missingMorphs: string[] = []

    for (const name of BONE_NAMES) {
      const obj = gltf.scene.getObjectByName(name)
      if (!(obj instanceof THREE.Bone)) {
        missingBones.push(name)
        continue
      }
      rig.bones[name] = obj
      rig.rest[name] = { pos: obj.position.clone(), quat: obj.quaternion.clone() }
    }

    gltf.scene.updateMatrixWorld(true)
    const wq = new THREE.Quaternion()
    for (const name of BONE_NAMES) {
      const bone = rig.bones[name]
      if (!bone) continue
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
      if (!dict) return
      for (const name of MORPH_NAMES) {
        if (name in dict) rig.morphs[name] = { mesh: obj, index: dict[name] }
      }
    })
    for (const name of MORPH_NAMES) {
      if (!rig.morphs[name]) missingMorphs.push(name)
    }

    if (missingBones.length || missingMorphs.length) {
      throw new Error(
        `jujuba.glb fora do contrato — ossos faltando: [${missingBones}] morphs faltando: [${missingMorphs}]`,
      )
    }
    return rig
  }

  /** Volta todos os ossos à pose de descanso — chamada no início de cada frame. */
  resetPose(): void {
    for (const name of BONE_NAMES) {
      const b = this.bones[name]
      const r = this.rest[name]
      b.position.copy(r.pos)
      b.quaternion.copy(r.quat)
      b.scale.setScalar(1)
    }
  }

  /** Acumula rotação no osso em torno de um eixo de MUNDO (rad). */
  addRotation(name: BoneName, axis: keyof WorldAxes, angle: number): void {
    if (angle === 0) return
    this.tmpQ.setFromAxisAngle(this.axes[name][axis], angle)
    this.bones[name].quaternion.multiply(this.tmpQ)
  }

  addScale(name: BoneName, amount: number): void {
    this.bones[name].scale.multiplyScalar(1 + amount)
  }

  setMorph(name: MorphName, value: number): void {
    const { mesh, index } = this.morphs[name]
    mesh.morphTargetInfluences![index] = value
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
