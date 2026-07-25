import type { FoodKind } from '../interactions/feeding'
import { unlockAudio } from '../audio/context'
import { pop } from '../audio/sfx'

interface Opts {
  /** Dedo desceu num item da bandeja. true = arrasto autorizado. */
  onFoodDragStart: (kind: FoodKind, x: number, y: number) => boolean
  onFoodDragMove: (x: number, y: number) => void
  /** Dedo soltou; tap = clique rapidinho (voo automático). */
  onFoodDragEnd: (tap: boolean) => void
  /** Toggle do mic; retorna se ficou ligado. */
  onMicToggle: () => Promise<boolean>
}

const FOOD_LABELS: Record<FoodKind, string> = {
  cookie: 'Biscoito',
  apple: 'Maçã',
  drumstick: 'Coxinha de frango',
}

export interface UI {
  hideTray(): void
  /** Reflete o estado da voz no botão do mic. */
  setMicVisual(mode: 'off' | 'on' | 'listening' | 'replaying'): void
  updateBars(hunger: number, happiness: number): void
}

export function createUI({ onFoodDragStart, onFoodDragMove, onFoodDragEnd, onMicToggle }: Opts): UI {
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

  const tray = document.createElement('div')
  tray.className = 'tray'
  tray.hidden = true
  for (const kind of Object.keys(FOOD_LABELS) as FoodKind[]) {
    const btn = document.createElement('button')
    btn.className = 'food-btn'
    btn.setAttribute('aria-label', FOOD_LABELS[kind])
    const img = document.createElement('img')
    img.src = `/icons/food-${kind}.png`
    img.alt = FOOD_LABELS[kind]
    img.draggable = false
    btn.appendChild(img)

    // arrasta a comida até a boca (tap rápido = voo automático)
    let drag: { t0: number; x0: number; y0: number; moved: number } | null = null
    btn.addEventListener('pointerdown', (e) => {
      unlockAudio()
      if (!onFoodDragStart(kind, e.clientX, e.clientY)) return
      pop()
      try {
        btn.setPointerCapture(e.pointerId)
      } catch {
        /* pointer sintético (testes) não captura */
      }
      drag = { t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 0 }
      tray.hidden = true
    })
    btn.addEventListener('pointermove', (e) => {
      if (!drag) return
      drag.moved += Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0)
      drag.x0 = e.clientX
      drag.y0 = e.clientY
      onFoodDragMove(e.clientX, e.clientY)
    })
    const finish = () => {
      if (!drag) return
      const tap = performance.now() - drag.t0 < 250 && drag.moved < 12
      drag = null
      onFoodDragEnd(tap)
    }
    btn.addEventListener('pointerup', finish)
    btn.addEventListener('pointercancel', finish)
    tray.appendChild(btn)
  }

  const eatBtn = document.createElement('button')
  eatBtn.className = 'btn btn-eat'
  eatBtn.textContent = '🍽️ Comer'
  eatBtn.addEventListener('pointerdown', () => unlockAudio())
  eatBtn.addEventListener('click', () => {
    pop()
    tray.hidden = !tray.hidden
  })

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

  hud.append(bars, tray, eatBtn, micBtn, overlay)

  return {
    hideTray() {
      tray.hidden = true
    },
    updateBars(hunger, happiness) {
      hungerFill.style.width = `${hunger}%`
      hungerFill.classList.toggle('stat-low', hunger < 30)
      happyFill.style.width = `${happiness}%`
      happyFill.classList.toggle('stat-low', happiness < 30)
    },
    setMicVisual(mode) {
      micBtn.classList.toggle('mic-on', mode !== 'off')
      micBtn.classList.toggle('mic-listening', mode === 'listening')
      micBtn.classList.toggle('mic-replaying', mode === 'replaying')
      micBtn.textContent =
        mode === 'off' ? '🎤 Falar' : mode === 'listening' ? '👂 Ouvindo…' : mode === 'replaying' ? '🗣️ …' : '🎤 Ligado'
    },
  }
}
