import type { FoodKind } from '../interactions/feeding'
import { ROOM_META, type RoomId } from './rooms'
import { createCarousel } from './carousel'
import { unlockAudio } from '../audio/context'
import { pop } from '../audio/sfx'

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
  /** Modo banho: troca de ferramenta e botão Voltar (compartilhado c/ escovação). */
  onBathTool: (tool: 'sponge' | 'shower') => void
  onBathExit: () => void
  /** Escovação: botão Enxaguar. */
  onBrushRinse: () => void
  /** Primeiro toque/batismo — gesto que destrava áudio/mic. name vem do form. */
  onFirstTap: (name?: string) => void
  /** Nome atual da raposinha (mostrado no overlay de retorno). */
  petName: string
  /** true = ainda sem nome → overlay vira formulário de batismo. */
  firstRun: boolean
}

export interface UI {
  setMicVisual(mode: 'off' | 'on' | 'listening' | 'replaying'): void
  updateBars(hunger: number, happiness: number, energy: number, hygiene: number): void
  /** Ajusta visibilidade dos controles pra sala atual + toast com o nome. */
  setRoom(room: RoomId, opts?: { silent?: boolean }): void
  setSleeping(on: boolean): void
  /** Liga/desliga a UI do modo banho (Voltar + ferramentas, nav some). */
  setBathMode(on: boolean): void
  setBathTool(tool: 'sponge' | 'shower'): void
  setBrushMode(on: boolean): void
  /** Minigame das bolhas: HUD de rodada/estouradas + Voltar. */
  setPlayMode(on: boolean): void
  updateGameHud(round: number, popped: number): void
}

export function createUI({
  onFoodDragStart,
  onFoodDragMove,
  onFoodDragEnd,
  onMicToggle,
  onRoomChange,
  onSleepToggle,
  onBathTool,
  onBathExit,
  onBrushRinse,
  onFirstTap,
  petName,
  firstRun,
}: Opts): UI {
  const hud = document.querySelector<HTMLDivElement>('#hud')!

  // ---- overlay de boas-vindas (destrava o áudio no iOS) ----
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  const dismissOverlay = (name?: string) => {
    unlockAudio()
    overlay.classList.add('overlay-out')
    setTimeout(() => overlay.remove(), 450)
    onFirstTap(name)
  }

  if (firstRun) {
    // batismo: pergunta o nome da raposinha
    overlay.innerHTML = `<h1><span>🦊</span></h1><p>Como sua raposinha vai se chamar?</p>`
    const input = document.createElement('input')
    input.className = 'overlay-input'
    input.value = 'Foxy'
    input.maxLength = 16
    input.autocomplete = 'off'
    input.setAttribute('aria-label', 'Nome da raposinha')
    const start = document.createElement('button')
    start.className = 'overlay-start'
    start.textContent = 'Começar!'
    const submit = () => dismissOverlay(input.value.trim() || 'Foxy')
    start.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit()
    })
    input.addEventListener('focus', () => input.select())
    overlay.append(input, start)
  } else {
    const h1 = document.createElement('h1')
    h1.append(`${petName} `, Object.assign(document.createElement('span'), { textContent: '🦊' }))
    const p = document.createElement('p')
    p.textContent = 'Toque para começar'
    overlay.append(h1, p)
    overlay.addEventListener('pointerdown', () => dismissOverlay())
  }

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
  const hygieneFill = mkBar('🧼', 'Higiene')

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

  // ---- roleta de comidas fluida (só na cozinha) ----
  const carousel = createCarousel({ onFoodDragStart, onFoodDragMove, onFoodDragEnd }).el

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

  // ---- modo banho: Voltar + ferramentas ----
  const backBtn = document.createElement('button')
  backBtn.className = 'btn btn-back'
  backBtn.hidden = true
  backBtn.textContent = '‹ Voltar'
  backBtn.addEventListener('click', () => {
    pop()
    onBathExit()
  })

  const tools = document.createElement('div')
  tools.className = 'bath-tools'
  tools.hidden = true
  const mkTool = (tool: 'sponge' | 'shower', emoji: string, label: string) => {
    const b = document.createElement('button')
    b.className = 'tool-btn'
    b.dataset.tool = tool
    b.innerHTML = `<span>${emoji}</span>${label}`
    b.addEventListener('click', () => {
      pop()
      onBathTool(tool)
    })
    tools.appendChild(b)
    return b
  }
  const spongeBtn = mkTool('sponge', '🧽', 'Esponja')
  const showerBtn = mkTool('shower', '🚿', 'Ducha')

  // ---- escovação: dica + Enxaguar ----
  const brushTools = document.createElement('div')
  brushTools.className = 'brush-tools'
  brushTools.hidden = true
  const brushHint = document.createElement('div')
  brushHint.className = 'brush-hint'
  brushHint.innerHTML = '<span>🪥</span>Esfregue a boquinha!'
  const rinseBtn = document.createElement('button')
  rinseBtn.className = 'tool-btn'
  rinseBtn.dataset.tool = 'rinse'
  rinseBtn.innerHTML = '<span>💧</span>Enxaguar'
  rinseBtn.addEventListener('click', () => {
    onBrushRinse()
  })
  brushTools.append(brushHint, rinseBtn)

  // ---- HUD do minigame das bolhas ----
  const gameHud = document.createElement('div')
  gameHud.className = 'game-hud'
  gameHud.hidden = true

  // ---- dormir (só no quarto) ----
  const sleepBtn = document.createElement('button')
  sleepBtn.className = 'btn btn-sleep'
  sleepBtn.hidden = true
  sleepBtn.textContent = '😴 Dormir'
  sleepBtn.addEventListener('pointerdown', () => unlockAudio())
  sleepBtn.addEventListener('click', () => {
    onSleepToggle()
  })

  hud.append(night, bars, nav, toast, carousel, micBtn, sleepBtn, backBtn, tools, brushTools, gameHud, overlay)

  return {
    setMicVisual(mode) {
      micBtn.classList.toggle('mic-on', mode !== 'off')
      micBtn.classList.toggle('mic-listening', mode === 'listening')
      micBtn.classList.toggle('mic-replaying', mode === 'replaying')
      micBtn.textContent =
        mode === 'off' ? '🎤 Falar' : mode === 'listening' ? '👂 Ouvindo…' : mode === 'replaying' ? '🗣️ …' : '🎤 Ligado'
    },
    updateBars(hunger, happiness, energy, hygiene) {
      hungerFill.style.width = `${hunger}%`
      hungerFill.classList.toggle('stat-low', hunger < 30)
      happyFill.style.width = `${happiness}%`
      happyFill.classList.toggle('stat-low', happiness < 30)
      energyFill.style.width = `${energy}%`
      energyFill.classList.toggle('stat-low', energy < 30)
      hygieneFill.style.width = `${hygiene}%`
      hygieneFill.classList.toggle('stat-low', hygiene < 30)
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
    setBathMode(on) {
      backBtn.hidden = !on
      tools.hidden = !on
      nav.hidden = on
      bars.hidden = on // dá lugar pro Voltar; higiene reaparece cheia na volta
    },
    setBathTool(tool) {
      spongeBtn.classList.toggle('tool-active', tool === 'sponge')
      showerBtn.classList.toggle('tool-active', tool === 'shower')
    },
    setBrushMode(on) {
      backBtn.hidden = !on
      brushTools.hidden = !on
      nav.hidden = on
      bars.hidden = on
    },
    setPlayMode(on) {
      backBtn.hidden = !on
      gameHud.hidden = !on
      nav.hidden = on
      bars.hidden = on
    },
    updateGameHud(round, popped) {
      gameHud.textContent = `Rodada ${round} · 🫧 ${popped}`
    },
  }
}
