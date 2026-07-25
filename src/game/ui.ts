import type { FoodKind } from '../interactions/feeding'
import { unlockAudio } from '../audio/context'
import { pop } from '../audio/sfx'

interface Opts {
  onFeed: (kind: FoodKind) => void
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

export function createUI({ onFeed, onMicToggle }: Opts): UI {
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
    btn.appendChild(img)
    btn.addEventListener('pointerdown', () => unlockAudio())
    btn.addEventListener('click', () => {
      pop()
      tray.hidden = true
      onFeed(kind)
    })
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
