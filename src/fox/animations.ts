import type { FoxRig } from './rig'
import { clamp, damp, Spring } from '../utils/math'

/** Entradas de pose que os sistemas do jogo escrevem a cada frame.
 *  O animator compõe tudo por cima da pose de descanso — um único
 *  escritor por osso por frame. */
export interface PoseInput {
  /** Alvo do olhar em NDC (-1..1); active=false → olhares aleatórios. */
  gazeX: number
  gazeY: number
  gazeActive: boolean
  /** 0..1 — voz (RMS) e comida escrevem aqui. */
  jawOpen: number
  /** 0..1 — LISTENING: orelhas em pé. */
  earsPerk: number
  /** rad — LISTENING: cabecinha inclinada. */
  headTilt: number
  /** 0..1 — multiplica o abanar do rabo (carinho/comida). */
  excitement: number
  /** -1..1 — PETTING: inclina o corpo na direção do dedo. */
  lean: number
  /** 0..1 — tristinha (fome baixa): orelhas murcham, rabo desanima. */
  sad: number
}

export function createPoseInput(): PoseInput {
  return {
    gazeX: 0, gazeY: 0, gazeActive: false,
    jawOpen: 0, earsPerk: 0, headTilt: 0, excitement: 0, lean: 0, sad: 0,
  }
}

const JAW_MAX = 0.5 // rad ≈ 28°

export class FoxAnimator {
  private t = 0
  // olhar suavizado
  private lookX = 0
  private lookY = 0
  // olhares aleatórios quando ninguém interage
  private glanceX = 0
  private glanceY = 0
  private nextGlanceIn = 2
  // twitch de orelha
  private twitchSide: 'earL' | 'earR' = 'earL'
  private twitchT = 99
  private nextTwitchIn = 4
  // impulsos
  private squash = new Spring(140, 12)
  private jawSmooth = 0
  private perkSmooth = 0
  private tiltSmooth = 0
  private leanSmooth = 0
  private sadSmooth = 0

  constructor(private rig: FoxRig) {}

  /** Poke: encolhe assustadinha. */
  flinch(): void {
    this.squash.impulse(3.2)
  }

  /** Engolir/feliz: pulinho squash-stretch. */
  bounce(): void {
    this.squash.impulse(-2.6)
  }

  update(dt: number, input: PoseInput): void {
    const { rig } = this
    this.t += dt
    const t = this.t
    rig.resetPose()

    // ---------- camada base (sempre ativa) ----------
    // respiração: 0.25 Hz no peito
    rig.addScale('chest', 0.022 * Math.sin(t * Math.PI * 2 * 0.25))

    // rabo: cadeia com defasagem; excitement acelera e amplia, tristeza desanima
    this.sadSmooth = damp(this.sadSmooth, clamp(input.sad, 0, 1), 4, dt)
    const sad = this.sadSmooth
    const ex = clamp(input.excitement, 0, 1)
    const wagW = (2.4 + ex * 5) * (1 - sad * 0.55)
    const wagA = (0.10 + ex * 0.24) * (1 - sad * 0.6)
    rig.addRotation('tailBase', 'y', Math.sin(t * wagW) * wagA)
    rig.addRotation('tailMid', 'y', Math.sin(t * wagW - 0.45) * wagA * 1.5)
    rig.addRotation('tailTip', 'y', Math.sin(t * wagW - 0.9) * wagA * 2.1)

    // twitch de orelha agendado
    this.nextTwitchIn -= dt
    if (this.nextTwitchIn <= 0) {
      this.twitchSide = Math.random() < 0.5 ? 'earL' : 'earR'
      this.twitchT = 0
      this.nextTwitchIn = 4 + Math.random() * 5
    }
    this.twitchT += dt
    if (this.twitchT < 0.28) {
      const a = Math.sin((this.twitchT / 0.28) * Math.PI) * 0.2
      rig.addRotation(this.twitchSide, 'z', this.twitchSide === 'earL' ? a : -a)
    }

    // ---------- olhar ----------
    let gx = input.gazeX
    let gy = input.gazeY
    if (!input.gazeActive) {
      this.nextGlanceIn -= dt
      if (this.nextGlanceIn <= 0) {
        // olhadinha aleatória, às vezes volta pro "espectador"
        if (Math.random() < 0.4) {
          this.glanceX = 0
          this.glanceY = 0
        } else {
          this.glanceX = (Math.random() * 2 - 1) * 0.55
          this.glanceY = (Math.random() * 2 - 1) * 0.35
        }
        this.nextGlanceIn = 2.5 + Math.random() * 4
      }
      gx = this.glanceX
      gy = this.glanceY
    }
    this.lookX = damp(this.lookX, clamp(gx, -1, 1), input.gazeActive ? 12 : 5, dt)
    this.lookY = damp(this.lookY, clamp(gy, -1, 1), input.gazeActive ? 12 : 5, dt)

    // cabeça segue um pouco, olhos seguem mais (e mais rápido)
    rig.addRotation('head', 'y', this.lookX * 0.20)
    rig.addRotation('head', 'x', -this.lookY * 0.13)
    rig.addRotation('eyeL', 'y', this.lookX * 0.26)
    rig.addRotation('eyeR', 'y', this.lookX * 0.26)
    rig.addRotation('eyeL', 'x', -this.lookY * 0.16)
    rig.addRotation('eyeR', 'x', -this.lookY * 0.16)

    // ---------- camada de estado ----------
    this.perkSmooth = damp(this.perkSmooth, clamp(input.earsPerk, 0, 1), 10, dt)
    if (this.perkSmooth > 0.001) {
      const p = this.perkSmooth
      rig.addRotation('earL', 'x', -0.22 * p)
      rig.addRotation('earR', 'x', -0.22 * p)
      rig.addRotation('earL', 'z', -0.14 * p)
      rig.addRotation('earR', 'z', 0.14 * p)
    }

    // orelhas murchas de fominha (abrem pros lados e caem pra trás)
    if (sad > 0.001) {
      rig.addRotation('earL', 'z', 0.4 * sad)
      rig.addRotation('earR', 'z', -0.4 * sad)
      rig.addRotation('earL', 'x', 0.18 * sad)
      rig.addRotation('earR', 'x', 0.18 * sad)
      rig.addRotation('head', 'x', 0.06 * sad) // cabecinha baixa
    }

    this.tiltSmooth = damp(this.tiltSmooth, input.headTilt, 8, dt)
    rig.addRotation('head', 'z', this.tiltSmooth)

    this.leanSmooth = damp(this.leanSmooth, clamp(input.lean, -1, 1), 8, dt)
    if (Math.abs(this.leanSmooth) > 0.001) {
      rig.addRotation('root', 'z', -this.leanSmooth * 0.10)
      rig.addRotation('head', 'z', -this.leanSmooth * 0.12)
    }

    // mandíbula (voz/comida)
    this.jawSmooth = damp(this.jawSmooth, clamp(input.jawOpen, 0, 1), 26, dt)
    if (this.jawSmooth > 0.001) {
      rig.addRotation('jaw', 'x', this.jawSmooth * JAW_MAX)
      // cabecinha acompanha de leve quando fala
      rig.addRotation('head', 'x', this.jawSmooth * 0.05)
    }

    // ---------- impulsos (squash & stretch no root) ----------
    const s = this.squash.update(0, dt)
    if (Math.abs(s) > 0.0005) {
      const sq = clamp(s * 0.045, -0.18, 0.18)
      this.rig.bones.root.scale.set(1 + sq, 1 - sq * 1.6, 1 + sq)
    }
  }
}
