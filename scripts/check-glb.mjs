// Gate do pipeline: valida que o .glb exportado mantém o contrato de nomes
// que o jogo resolve em src/fox/rig.ts (17 ossos obrigatórios + opcionais v2).
import { readFileSync } from 'node:fs'

const path = process.argv[2] ?? 'public/models/jujuba.glb'
const buf = readFileSync(path)

if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString())

const nodeNames = (json.nodes ?? []).map((n) => n.name)
const REQUIRED_BONES = [
  'root', 'spine', 'chest', 'neck', 'head', 'jaw',
  'earL', 'earR', 'eyeL', 'eyeR', 'armL', 'armR',
  'legL', 'legR', 'tailBase', 'tailMid', 'tailTip',
]
const OPTIONAL_BONES = ['lidL', 'lidR', 'browL', 'browR', 'tongue']
const missingBones = REQUIRED_BONES.filter((b) => !nodeNames.includes(b))
const optionalPresent = OPTIONAL_BONES.filter((b) => nodeNames.includes(b))

const morphsByMesh = Object.fromEntries(
  (json.meshes ?? []).map((m) => [m.name, m.extras?.targetNames ?? []]),
)
const allMorphs = new Set(Object.values(morphsByMesh).flat())

console.log(`glb: ${path} (${(buf.length / 1024).toFixed(0)} KB)`)
console.log(`meshes: ${Object.keys(morphsByMesh).join(', ')}`)
console.log(`morphs: ${[...allMorphs].join(', ') || '(nenhum)'}`)
console.log(`ossos obrigatórios: ${REQUIRED_BONES.length - missingBones.length}/${REQUIRED_BONES.length}`)
console.log(`ossos opcionais v2: ${optionalPresent.join(', ') || '(nenhum)'}`)
console.log(`dentes (mesh Teeth): ${nodeNames.includes('Teeth') ? 'sim' : 'não'}`)

if (missingBones.length) throw new Error(`ossos faltando: ${missingBones}`)
if (!allMorphs.has('smile')) throw new Error('morph obrigatório faltando: smile')
console.log('GATE OK ✓')
