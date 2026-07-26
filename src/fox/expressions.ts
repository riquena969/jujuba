import type { EyeStyleName, FoxRig } from './rig'
import { clamp, damp } from '../utils/math'

/** Expressões faciais: springs de morphs + agendador de piscada.
 *  Estados setam ALVOS; aqui a gente suaviza e escreve nos morphs. */
export class Expressions {
  /** Alvo de sorriso 0..1 (setado pelos estados: carinho → 1). */
  smileTarget = 0
  /** Piscada forçada (carinho = olhinhos fechados felizes). */
  blinkHold = false
  /** Estilo de olho alvo (v3): large normal, narrow soninho, sad tristinha. */
  eyeStyle: EyeStyleName = 'large'

  private smile = 0
  private blink = 0 // 0 aberto, 1 fechado
  private nextBlinkIn = 2
  private blinkPhase: 'idle' | 'closing' | 'opening' = 'idle'

  constructor(private rig: FoxRig) {}

  update(dt: number): void {
    // sorriso com suavização
    this.smile = damp(this.smile, this.smileTarget, 10, dt)

    // piscada: fecha rápido (60ms), abre mais devagar (120ms)
    if (this.blinkHold) {
      this.blink = damp(this.blink, 1, 22, dt)
      this.blinkPhase = 'idle'
      this.nextBlinkIn = Math.max(this.nextBlinkIn, 0.4)
    } else {
      switch (this.blinkPhase) {
        case 'idle':
          this.blink = damp(this.blink, 0, 18, dt)
          this.nextBlinkIn -= dt
          if (this.nextBlinkIn <= 0) this.blinkPhase = 'closing'
          break
        case 'closing':
          this.blink += dt / 0.06
          if (this.blink >= 1) {
            this.blink = 1
            this.blinkPhase = 'opening'
          }
          break
        case 'opening':
          this.blink -= dt / 0.12
          if (this.blink <= 0) {
            this.blink = 0
            this.blinkPhase = 'idle'
            this.nextBlinkIn = 2 + Math.random() * 4
          }
          break
      }
    }

    const b = clamp(this.blink, 0, 1)
    if (this.rig.hasBone('lidL')) {
      // v2: piscada por PÁLPEBRA (fechar = rotação negativa em X)
      this.rig.addRotation('lidL', 'x', -b * LID_CLOSE_RAD)
      this.rig.addRotation('lidR', 'x', -b * LID_CLOSE_RAD)
    } else if (this.rig.hasMorph('blinkL')) {
      // v1: morphs achatando o olho num arco feliz
      this.rig.setMorph('blinkL', b)
      this.rig.setMorph('blinkR', b)
    } else {
      // v3: piscada cartoon achatando o osso do olho na vertical
      this.rig.squashEyesVertical(b)
    }
    // v3: olhinhos por estilo (setado pelo behavior por estado)
    this.rig.setEyeStyle(this.eyeStyle)
    this.rig.setMorph('smile', clamp(this.smile, 0, 1))
  }
}

/** Quanto a pálpebra gira pra fechar (≈128°, calibrado nos previews). */
const LID_CLOSE_RAD = 2.23
