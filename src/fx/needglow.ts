import * as THREE from 'three'

/** Brilho pulsante de "precisa de mim!": banheira brilha quando a higiene tá
 *  baixa, pia brilha quando os dentes estão sujos. */
export class NeedGlow {
  private tubMats: THREE.MeshStandardMaterial[] = []
  private sinkMats: THREE.MeshStandardMaterial[] = []
  private blowerMats: THREE.MeshStandardMaterial[] = []
  private collected = false
  private blowerCollected = false
  private t = 0
  /** intensidades atuais (asseridas nos testes) */
  tubIntensity = 0
  sinkIntensity = 0
  blowerIntensity = 0

  private collect(group: THREE.Object3D): void {
    const grab = (name: string, into: THREE.MeshStandardMaterial[]) => {
      group.getObjectByName(name)?.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshStandardMaterial
          if (!into.includes(m)) {
            m.emissive = new THREE.Color('#ffb84d')
            into.push(m)
          }
        }
      })
    }
    grab('Tub', this.tubMats)
    grab('Sink', this.sinkMats)
    this.collected = this.tubMats.length > 0 && this.sinkMats.length > 0
  }

  private collectBlower(group: THREE.Object3D): void {
    group.getObjectByName('Blower')?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial
        if (!this.blowerMats.includes(m)) {
          m.emissive = new THREE.Color('#8fe0ff')
          this.blowerMats.push(m)
        }
      }
    })
    this.blowerCollected = this.blowerMats.length > 0
  }

  update(dt: number, bathroomGroup: THREE.Object3D | undefined,
         needBath: boolean, needBrush: boolean,
         playGroup?: THREE.Object3D): void {
    this.t += dt
    if (!this.collected && bathroomGroup) this.collect(bathroomGroup)
    if (!this.blowerCollected && playGroup) this.collectBlower(playGroup)
    const pulse = 0.28 + 0.2 * Math.sin(this.t * 3.6)
    this.tubIntensity = needBath ? pulse : 0
    this.sinkIntensity = needBrush ? pulse : 0
    // assoprador: brilho-convite sempre piscando na sala de brinquedos
    this.blowerIntensity = playGroup ? 0.2 + 0.14 * Math.sin(this.t * 3) : 0
    for (const m of this.tubMats) m.emissiveIntensity = this.tubIntensity
    for (const m of this.sinkMats) m.emissiveIntensity = this.sinkIntensity
    for (const m of this.blowerMats) m.emissiveIntensity = this.blowerIntensity
  }
}
