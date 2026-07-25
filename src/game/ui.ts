import { FOOD_KINDS, type FoodKind } from '../interactions/feeding'
import { ROOM_META, type RoomId } from './rooms'
import { unlockAudio } from '../audio/context'
import { pop } from '../audio/sfx'
import { asset } from '../utils/assets'

interface Opts {
  /** Dedo desceu no item central da roleta. true = arrasto autorizado. */
  onFoodDragStart: (kind: FoodKind, x: number, y: number) => boolean
  onFoodDragMove: (x: number, y: number) => void
  /** Dedo soltou; tap = clique rapidinho (voo automático). */
  onFoodDragEnd: (tap: boolean) => void
  /** Toggle do mic; retorna se ficou ligado. */
  onMicToggle: () => Promise<boolean>
  /** Setinhas de sala: -1 anterior, +1 próxima. */
  onRoomChange: (dir: 1 | -1) => void
  onSleepToggle: () => void
}

const FOOD_LABELS: Record<FoodKind, string> = {
  cookie: 'Biscoito',
  apple: 'Maçã',
  drumstick: 'Coxinha de frango',
}

export interface UI {
  setMicVisual(mode: 'off' | 'on' | 'listening' | 'replaying'): void
  updateBars(hunger: number, happiness: number, energy: number): void
  /** Ajusta visibilidade dos controles pra sala atual + toast com o nome. */
  setRoom(room: RoomId, opts?: { silent?: boolean }): void
  setSleeping(on: boolean): void
}

export function createUI({
  onFoodDragStart,
  onFoodDragMove,
  onFoodDragEnd,
  onMicToggle,
  onRoomChange,
  onSleepToggle,
}: Opts): UI {
  const hud = document.querySelector<HTMLDivElement>('#hud')!

  // ---- overlay de primeiro toque (destrava o áudio no iOS) ----
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<h1>Jujuba <span>🦊</span></h1><p>Toque para começar</p>`
  overlay.addEventListener('pointerdown', () => {
    unlockAudio()
    overlay.classList.add('overlay-out')
    setTimeout(() => overlay.remove(), 450)
  })

  // ---- filtro noturno (dormindo) ----
  const night = document.createElement('div')
  night.className = 'night'

  // ---- barras de status ----
  const bars = document.createElement('div')
  bars.className = 'hud-bars'
  const mkBar = (icon: string, label: string) => {
    const row = document.createElement('div')
    row.className = 'stat'
    row.innerHTML = `<span class="stat-icon" title="${label}">${icon}</span><div class="stat-track"><div class="stat-fill"></div></div>`
    bars.appendChild(row)
    return row.querySelector<HTMLDivElement>('.stat-fill')!
  }
  const hungerFill = mkBar('🍖', 'Fome')
  const happyFill = mkBar('💛', 'Alegria')
  const energyFill = mkBar('💤', 'Energia')

  // ---- navegação de salas (topo-direita) ----
  const nav = document.createElement('div')
  nav.className = 'room-nav'
  const prevBtn = document.createElement('button')
  prevBtn.className = 'room-arrow room-prev'
  prevBtn.textContent = '‹'
  prevBtn.setAttribute('aria-label', 'Sala anterior')
  const roomIcon = document.createElement('span')
  roomIcon.className = 'room-icon'
  const nextBtn = document.createElement('button')
  nextBtn.className = 'room-arrow room-next'
  nextBtn.textContent = '›'
  nextBtn.setAttribute('aria-label', 'Próxima sala')
  nav.append(prevBtn, roomIcon, nextBtn)
  prevBtn.addEventListener('click', () => {
    unlockAudio()
    pop()
    onRoomChange(-1)
  })
  nextBtn.addEventListener('click', () => {
    unlockAudio()
    pop()
    onRoomChange(1)
  })

  const toast = document.createElement('div')
  toast.className = 'room-toast'
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // ---- roleta de comidas (só na cozinha) ----
  const carousel = document.createElement('div')
  carousel.className = 'carousel'
  carousel.hidden = true
  let activeFood = 0

  const slots: { btn: HTMLButtonElement; img: HTMLImageElement }[] = []
  const mkSlot = (cls: string) => {
    const btn = document.createElement('button')
    btn.className = cls
    const img = document.createElement('img')
    img.draggable = false
    btn.appendChild(img)
    carousel.appendChild(btn)
    slots.push({ btn, img })
    return btn
  }
  const leftBtn = mkSlot('car-side car-left')
  const centerBtn = mkSlot('car-center food-btn')
  const rightBtn = mkSlot('car-side car-right')

  const foodAt = (offset: number): FoodKind =>
    FOOD_KINDS[(activeFood + offset + FOOD_KINDS.length) % FOOD_KINDS.length]

  function renderCarousel() {
    const kinds = [foodAt(-1), foodAt(0), foodAt(1)]
    slots.forEach(({ btn, img }, i) => {
      img.src = asset(`icons/food-${kinds[i]}.png`)
      img.alt = FOOD_LABELS[kinds[i]]
      btn.setAttribute('aria-label', FOOD_LABELS[kinds[i]])
    })
  }
  renderCarousel()

  const rotate = (dir: 1 | -1) => {
    activeFood = (activeFood + dir + FOOD_KINDS.length) % FOOD_KINDS.length
    pop()
    renderCarousel()
  }
  leftBtn.addEventListener('click', () => rotate(-1))
  rightBtn.addEventListener('click', () => rotate(1))

  // arrasto a partir do item central (tap = voo automático)
  let drag: { t0: number; x0: number; y0: number; moved: number } | null = null
  centerBtn.addEventListener('pointerdown', (e) => {
    unlockAudio()
    if (!onFoodDragStart(foodAt(0), e.clientX, e.clientY)) return
    pop()
    try {
      centerBtn.setPointerCapture(e.pointerId)
    } catch {
      /* pointer sintético (testes) não captura */
    }
    drag = { t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 0 }
  })
  centerBtn.addEventListener('pointermove', (e) => {
    if (!drag) return
    drag.moved += Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0)
    drag.x0 = e.clientX
    drag.y0 = e.clientY
    onFoodDragMove(e.clientX, e.clientY)
  })
  const finishDrag = () => {
    if (!drag) return
    const tap = performance.now() - drag.t0 < 250 && drag.moved < 12
    drag = null
    onFoodDragEnd(tap)
  }
  centerBtn.addEventListener('pointerup', finishDrag)
  centerBtn.addEventListener('pointercancel', finishDrag)

  // ---- mic (só na sala) ----
  const micBtn = document.createElement('button')
  micBtn.className = 'btn btn-mic'
  micBtn.textContent = '🎤 Falar'
  micBtn.addEventListener('pointerdown', () => unlockAudio())
  micBtn.addEventListener('click', () => {
    pop()
    micBtn.disabled = true
    void onMicToggle().finally(() => {
      micBtn.disabled = false
    })
  })

  // ---- dormir (só no quarto) ----
  const sleepBtn = document.createElement('button')
  sleepBtn.className = 'btn btn-sleep'
  sleepBtn.hidden = true
  sleepBtn.textContent = '😴 Dormir'
  sleepBtn.addEventListener('pointerdown', () => unlockAudio())
  sleepBtn.addEventListener('click', () => {
    onSleepToggle()
  })

  hud.append(night, bars, nav, toast, carousel, micBtn, sleepBtn, overlay)

  return {
    setMicVisual(mode) {
      micBtn.classList.toggle('mic-on', mode !== 'off')
      micBtn.classList.toggle('mic-listening', mode === 'listening')
      micBtn.classList.toggle('mic-replaying', mode === 'replaying')
      micBtn.textContent =
        mode === 'off' ? '🎤 Falar' : mode === 'listening' ? '👂 Ouvindo…' : mode === 'replaying' ? '🗣️ …' : '🎤 Ligado'
    },
    updateBars(hunger, happiness, energy) {
      hungerFill.style.width = `${hunger}%`
      hungerFill.classList.toggle('stat-low', hunger < 30)
      happyFill.style.width = `${happiness}%`
      happyFill.classList.toggle('stat-low', happiness < 30)
      energyFill.style.width = `${energy}%`
      energyFill.classList.toggle('stat-low', energy < 30)
    },
    setRoom(room, opts) {
      roomIcon.textContent = ROOM_META[room].icon
      carousel.hidden = room !== 'cozinha'
      micBtn.hidden = room !== 'sala'
      sleepBtn.hidden = room !== 'quarto'
      if (!opts?.silent) {
        toast.textContent = `${ROOM_META[room].icon} ${ROOM_META[room].label}`
        toast.classList.add('room-toast-show')
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => toast.classList.remove('room-toast-show'), 1300)
      }
    },
    setSleeping(on) {
      sleepBtn.textContent = on ? '☀️ Acordar' : '😴 Dormir'
      night.classList.toggle('night-on', on)
      nav.classList.toggle('nav-disabled', on)
      prevBtn.disabled = on
      nextBtn.disabled = on
    },
  }
}
