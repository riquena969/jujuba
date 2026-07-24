import './style.css'
import * as THREE from 'three'

// Boot mínimo (M0) — a cena de verdade entra no M1.
const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color('#ffe8d9')
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 50)
camera.position.set(0, 1, 4)

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => renderer.render(scene, camera))
