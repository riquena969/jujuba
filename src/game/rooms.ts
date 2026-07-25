import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GameScene, RoomLook } from '../scene'
import { DEFAULT_LOOK } from '../scene'

export type RoomId = 'cozinha' | 'sala' | 'quarto'

export const ROOM_ORDER: RoomId[] = ['cozinha', 'sala', 'quarto']

export const ROOM_META: Record<RoomId, { label: string; icon: string; look: RoomLook }> = {
  cozinha: {
    label: 'Cozinha',
    icon: '🍳',
    look: {
      bgTop: '#fff4d9',
      bgBottom: '#ffdfae',
      floor: '#f0d2a0',
      rug: '#fdf3df',
      rugRim: '#f2c88f',
    },
  },
  sala: { label: 'Sala', icon: '🛋️', look: DEFAULT_LOOK },
  quarto: {
    label: 'Quarto',
    icon: '🌙',
    look: {
      bgTop: '#ece7ff',
      bgBottom: '#cfc5f2',
      floor: '#d9cfef',
      rug: '#f4f0ff',
      rugRim: '#c6b7ee',
    },
  },
}

export class Rooms {
  current: RoomId
  private groups = new Map<RoomId, THREE.Group>()
  /** Avisa main/ui quando a sala muda. */
  onChange: ((room: RoomId) => void) | null = null

  constructor(
    private gs: GameScene,
    initial: RoomId = 'sala',
  ) {
    this.current = ROOM_ORDER.includes(initial) ? initial : 'sala'
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader()
    await Promise.all(
      ROOM_ORDER.map(async (id) => {
        const gltf = await loader.loadAsync(`/models/room-${id}.glb`)
        gltf.scene.visible = false
        this.gs.scene.add(gltf.scene)
        this.groups.set(id, gltf.scene)
      }),
    )
    this.apply()
  }

  go(dir: 1 | -1): RoomId {
    const i = ROOM_ORDER.indexOf(this.current)
    this.current = ROOM_ORDER[(i + dir + ROOM_ORDER.length) % ROOM_ORDER.length]
    this.apply()
    return this.current
  }

  apply(): void {
    this.gs.setRoomLook(ROOM_META[this.current].look)
    for (const [id, group] of this.groups) group.visible = id === this.current
    this.onChange?.(this.current)
  }
}
