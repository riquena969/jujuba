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
}

export function createUI({ onFeed, onMicToggle }: Opts): UI {
  const hud = document.querySelector<HTMLDivElement>('#hud')!

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

  hud.append(tray, eatBtn, micBtn)

  return {
    hideTray() {
      tray.hidden = true
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
