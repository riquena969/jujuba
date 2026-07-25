// Gate do pipeline: valida que o .glb exportado mantém o contrato de nomes
// (17 ossos + shape keys) que o jogo resolve em src/fox/rig.ts.
import { readFileSync } from 'node:fs'

const path = process.argv[2] ?? 'public/models/jujuba.glb'
const buf = readFileSync(path)

if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString())

const nodeNames = (json.nodes ?? []).map((n) => n.name)
const EXPECTED_BONES = [
  'root', 'spine', 'chest', 'neck', 'head', 'jaw',
  'earL', 'earR', 'eyeL', 'eyeR', 'armL', 'armR',
  'legL', 'legR', 'tailBase', 'tailMid', 'tailTip',
]
const missingBones = EXPECTED_BONES.filter((b) => !nodeNames.includes(b))

const morphsByMesh = Object.fromEntries(
  (json.meshes ?? []).map((m) => [m.name, m.extras?.targetNames ?? []]),
)
const EXPECTED_MORPHS = [
  ['Jujuba', 'smile'],
  ['EyeL', 'blinkL'],
  ['EyeR', 'blinkR'],
]
const missingMorphs = EXPECTED_MORPHS.filter(
  ([mesh, morph]) => !(morphsByMesh[mesh] ?? []).includes(morph),
)

const skinsJoints = (json.skins ?? []).map((s) => s.joints.length)
console.log(`glb: ${path} (${(buf.length / 1024).toFixed(0)} KB)`)
console.log(`meshes: ${Object.keys(morphsByMesh).join(', ')}`)
console.log(`morphs: ${JSON.stringify(morphsByMesh)}`)
console.log(`skins (joints): ${skinsJoints.join(', ')}`)
console.log(`bones esperados presentes: ${EXPECTED_BONES.length - missingBones.length}/${EXPECTED_BONES.length}`)

if (missingBones.length) throw new Error(`ossos faltando: ${missingBones}`)
if (missingMorphs.length) throw new Error(`morphs faltando: ${JSON.stringify(missingMorphs)}`)
console.log('GATE OK ✓')
