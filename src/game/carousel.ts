import { FOOD_KINDS, type FoodKind } from '../interactions/feeding'
import { unlockAudio } from '../audio/context'
import { pop } from '../audio/sfx'
import { asset } from '../utils/assets'

/** Roleta de comidas fluida:
 *  - arrastar na HORIZONTAL rola com inércia e snap no item mais próximo
 *  - puxar QUALQUER item pra CIMA inicia o arrasto de alimentação com ele
 *  - tap num item = voo automático (alimenta rapidinho)
 */

export const FOOD_LABELS: Record<FoodKind, string> = {
  cookie: 'Biscoito',
  apple: 'Maçã',
  drumstick: 'Coxinha de frango',
  juice: 'Caixinha de suco',
  milk: 'Copo de leite',
}

const SPACING = 84 // px entre itens
const N = FOOD_KINDS.length
const TOTAL = SPACING * N

interface Opts {
  onFoodDragStart: (kind: FoodKind, x: number, y: number) => boolean
  onFoodDragMove: (x: number, y: number) => void
  onFoodDragEnd: (tap: boolean) => void
}

export interface Carousel {
  el: HTMLElement
}

/** wrap circular pra [-TOTAL/2, TOTAL/2) */
const wrap = (v: number): number => {
  let w = ((v % TOTAL) + TOTAL) % TOTAL
  if (w >= TOTAL / 2) w -= TOTAL
  return w
}

export function createCarousel({ onFoodDragStart, onFoodDragMove, onFoodDragEnd }: Opts): Carousel {
  const el = document.createElement('div')
  el.className = 'carousel'
  el.hidden = true

  const items: { btn: HTMLButtonElement; kind: FoodKind }[] = FOOD_KINDS.map((kind) => {
    const btn = document.createElement('button')
    btn.className = 'food-btn'
    btn.dataset.kind = kind
    btn.setAttribute('aria-label', FOOD_LABELS[kind])
    const img = document.createElement('img')
    img.src = asset(`icons/food-${kind}.png`)
    img.alt = FOOD_LABELS[kind]
    img.draggable = false
    btn.appendChild(img)
    el.appendChild(btn)
    return { btn, kind }
  })

  let scroll = 0 // px contínuo (infinito, wrap circular)
  let velocity = 0
  let raf = 0

  function render() {
    for (let i = 0; i < items.length; i++) {
      const x = wrap(i * SPACING - scroll)
      const d = Math.min(Math.abs(x) / SPACING, 2)
      const scale = 1.06 - d * 0.22
      const { btn } = items[i]
      btn.style.transform = `translateX(${x}px) scale(${Math.max(scale, 0.55)})`
      btn.style.opacity = String(Math.max(1 - d * 0.32, 0.3))
      btn.style.zIndex = String(100 - Math.round(d * 10))
      btn.classList.toggle('food-center', Math.abs(x) < SPACING / 2)
    }
    const centerIdx = ((Math.round(scroll / SPACING) % N) + N) % N
    el.dataset.center = FOOD_KINDS[centerIdx]
  }
  render()

  function snapTarget(): number {
    return Math.round(scroll / SPACING) * SPACING
  }

  function momentum() {
    cancelAnimationFrame(raf)
    const step = () => {
      scroll += velocity
      velocity *= 0.92
      if (Math.abs(velocity) < 0.6) {
        // encaixa suave no item mais próximo
        const target = snapTarget()
        scroll += (target - scroll) * 0.22
        if (Math.abs(target - scroll) < 0.5) {
          scroll = target
          render()
          return
        }
      }
      render()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  // ---- gestos: pending → scroll | feed | tap ----
  let mode: 'idle' | 'pending' | 'scroll' | 'feed' | 'dead' = 'idle'
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastT = 0
  let downT = 0
  let grabbedKind: FoodKind = 'cookie'

  el.addEventListener('pointerdown', (e) => {
    unlockAudio()
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.food-btn')
    grabbedKind = (btn?.dataset.kind as FoodKind) ?? (el.dataset.center as FoodKind)
    mode = 'pending'
    startX = lastX = e.clientX
    startY = e.clientY
    downT = lastT = performance.now()
    velocity = 0
    cancelAnimationFrame(raf)
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* pointer sintético */
    }
  })

  el.addEventListener('pointermove', (e) => {
    if (mode === 'idle' || mode === 'dead') return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (mode === 'pending') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        mode = 'scroll'
      } else if (dy < -14) {
        // puxou o item pra cima → alimentar com ELE
        mode = onFoodDragStart(grabbedKind, e.clientX, e.clientY) ? 'feed' : 'dead'
        if (mode === 'feed') pop()
      }
    }

    if (mode === 'scroll') {
      const now = performance.now()
      const ddx = e.clientX - lastX
      scroll -= ddx
      velocity = -ddx * Math.min(1, 16 / Math.max(1, now - lastT))
      lastX = e.clientX
      lastT = now
      render()
    } else if (mode === 'feed') {
      onFoodDragMove(e.clientX, e.clientY)
    }
  })

  const finish = (e: PointerEvent) => {
    const m = mode
    mode = 'idle'
    if (m === 'scroll') {
      momentum()
    } else if (m === 'feed') {
      onFoodDragEnd(false)
    } else if (m === 'pending') {
      // tap simples: alimenta com o item tocado (voo automático)
      const isTap = performance.now() - downT < 300
      if (isTap && onFoodDragStart(grabbedKind, e.clientX, e.clientY)) {
        pop()
        onFoodDragEnd(true)
      }
    }
  }
  el.addEventListener('pointerup', finish)
  el.addEventListener('pointercancel', finish)

  return { el }
}
