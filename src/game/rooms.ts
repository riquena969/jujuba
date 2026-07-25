import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GameScene, RoomLook } from '../scene'
import { DEFAULT_LOOK } from '../scene'
import { asset } from '../utils/assets'

export type RoomId = 'cozinha' | 'sala' | 'quarto' | 'banheiro' | 'brinquedos'

export const ROOM_ORDER: RoomId[] = ['cozinha', 'sala', 'quarto', 'banheiro', 'brinquedos']

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
  banheiro: {
    label: 'Banheiro',
    icon: '🛁',
    look: {
      bgTop: '#e7f7f5',
      bgBottom: '#bee7e4',
      floor: '#cfe9e5',
      rug: '#f1fbfa',
      rugRim: '#a9dcd7',
    },
  },
  brinquedos: {
    label: 'Brinquedos',
    icon: '🧸',
    look: {
      bgTop: '#fdf6d8',
      bgBottom: '#ffdfae',
      floor: '#f6e6b8',
      rug: '#fff8ec',
      rugRim: '#f7c97f',
    },
  },
}

/** Look do modo banho: vapor clarinho. */
export const BATH_LOOK: RoomLook = {
  bgTop: '#f2fcfb',
  bgBottom: '#cdeef2',
  floor: '#d8efec',
  rug: '#f1fbfa',
  rugRim: '#b9e4df',
}

/** Look do minigame das bolhas: jardim com céu aberto (as bolhas sobem de
 *  baixo da tela e o cenário vira um quintal de tarde ensolarada). */
export const BUBBLE_LOOK: RoomLook = {
  bgTop: '#a8dcff',
  bgBottom: '#e6f7ff',
  floor: '#b7e39c',
  rug: '#d9f2c2',
  rugRim: '#9cd684',
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
        const gltf = await loader.loadAsync(asset(`models/room-${id}.glb`))
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

  /** Grupo de props da sala atual (modo banho esconde/mostra). */
  currentGroup(): THREE.Group | undefined {
    return this.groups.get(this.current)
  }

  apply(): void {
    this.gs.setRoomLook(ROOM_META[this.current].look)
    for (const [id, group] of this.groups) group.visible = id === this.current
    this.onChange?.(this.current)
  }
}
