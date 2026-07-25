import { getAudio } from './context'

/** SFX 100% sintetizados via WebAudio — zero assets de áudio. */

function env(ctx: AudioContext, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  const t = ctx.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

/** Guincho fofo de poke: "iiik!" */
export function squeak(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  const t = ctx.currentTime
  osc.frequency.setValueAtTime(650, t)
  osc.frequency.exponentialRampToValueAtTime(1150, t + 0.07)
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.19)
  const g = env(ctx, 0.25, 0.02, 0.2)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.24)
}

/** Pop de UI (bandeja, seleção). */
export function pop(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  const t = ctx.currentTime
  osc.frequency.setValueAtTime(300, t)
  osc.frequency.exponentialRampToValueAtTime(680, t + 0.06)
  const g = env(ctx, 0.2, 0.012, 0.09)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.12)
}

/** Mordida: estalo de ruído + tom grave curtinho. */
export function chomp(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime

  const noiseLen = 0.09
  const buf = ctx.createBuffer(1, Math.ceil(noiseLen * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  const ng = env(ctx, 0.35, 0.005, 0.08)
  noise.connect(lp).connect(ng).connect(master)
  noise.start(t)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(180, t)
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.08)
  const og = env(ctx, 0.3, 0.008, 0.09)
  osc.connect(og).connect(master)
  osc.start(t)
  osc.stop(t + 0.11)
}

/** Gole/engolir. */
export function gulp(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(360, t)
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.16)
  const g = env(ctx, 0.28, 0.02, 0.16)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Esfregadinha de esponja: chiado curto "squish". */
export function scrub(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const len = 0.14
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(750, t)
  bp.frequency.exponentialRampToValueAtTime(1400, t + len)
  bp.Q.value = 2.2
  const g = env(ctx, 0.3, 0.015, 0.12)
  src.connect(bp).connect(g).connect(master)
  src.start(t)
}

/** Tchibum de entrar na banheira. */
export function splash(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const len = 0.3
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const ng = env(ctx, 0.4, 0.01, 0.28)
  noise.connect(lp).connect(ng).connect(master)
  noise.start(t)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(320, t)
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.18)
  const og = env(ctx, 0.22, 0.01, 0.18)
  osc.connect(og).connect(master)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Bolhinha de espuma estourando. */
export function bubblePop(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  const f = 480 + Math.random() * 500
  osc.frequency.setValueAtTime(f, t)
  osc.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.045)
  const g = env(ctx, 0.14, 0.006, 0.05)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.07)
}

/** Golinho de canudo/copo: chiado subindo (sluuurp). */
export function slurp(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const len = 0.24
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 4
  bp.frequency.setValueAtTime(380, t)
  bp.frequency.exponentialRampToValueAtTime(1900, t + len)
  const g = env(ctx, 0.3, 0.02, 0.22)
  src.connect(bp).connect(g).connect(master)
  src.start(t)
}

/** Arrotinho de barriga cheia (cartoon, sem exagero). */
export function burp(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(135, t)
  osc.frequency.exponentialRampToValueAtTime(72, t + 0.3)
  // "granulado" do arroto: LFO rápido balançando o pitch
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 27
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 16
  lfo.connect(lfoDepth).connect(osc.frequency)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 460
  const g = env(ctx, 0.34, 0.025, 0.3)
  osc.connect(lp).connect(g).connect(master)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + 0.36)
  lfo.stop(t + 0.36)
}

/** Escovadinha nos dentes: chiado rápido mais agudo que a esponja. */
export function brushScrub(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const len = 0.11
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 3
  bp.frequency.setValueAtTime(2100, t)
  bp.frequency.exponentialRampToValueAtTime(3100, t + len)
  const g = env(ctx, 0.22, 0.01, 0.1)
  src.connect(bp).connect(g).connect(master)
  src.start(t)
}

/** Gargarejo borbulhante (~1.2s). */
export function gargle(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const len = 1.2
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 620
  bp.Q.value = 2.5
  // borbulhas: tremolo rápido irregular
  const mod = ctx.createGain()
  mod.gain.value = 0.5
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 15
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.45
  lfo.connect(lfoDepth).connect(mod.gain)
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(0.3, t + 0.1)
  out.gain.setValueAtTime(0.3, t + len - 0.15)
  out.gain.exponentialRampToValueAtTime(0.0001, t + len)
  src.connect(bp).connect(mod).connect(out).connect(master)
  src.start(t)
  lfo.start(t)
  lfo.stop(t + len)
}

/** Cuspidinha (ptu!) + respingo. */
export function spit(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(900, t)
  osc.frequency.exponentialRampToValueAtTime(250, t + 0.1)
  const g = env(ctx, 0.25, 0.008, 0.1)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.12)
  // respingo
  const len = 0.12
  const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1600
  const ng = env(ctx, 0.2, 0.05, 0.1)
  noise.connect(lp).connect(ng).connect(master)
  noise.start(t + 0.06)
}

/** Jingle de "ficou limpinha!": arpejo brilhante subindo. */
export function sparkle(): void {
  const a = getAudio()
  if (!a) return
  const { ctx, master } = a
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.09
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.5 : 0.24))
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + 0.55)
  })
}

/** Chuveirinho contínuo (ducha): ruído tipo chuva com liga/desliga suave. */
export class ShowerSound {
  private nodes: { src: AudioBufferSourceNode; out: GainNode } | null = null

  start(): void {
    if (this.nodes) return
    const a = getAudio()
    if (!a) return
    const { ctx, master } = a
    const len = 1.2
    const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2300
    bp.Q.value = 0.7
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, ctx.currentTime)
    out.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.12)
    src.connect(bp).connect(out).connect(master)
    src.start()
    this.nodes = { src, out }
  }

  stop(): void {
    if (!this.nodes) return
    const a = getAudio()
    const { src, out } = this.nodes
    this.nodes = null
    if (!a) return
    const t = a.ctx.currentTime
    out.gain.cancelScheduledValues(t)
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t)
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    src.stop(t + 0.2)
  }
}

/** Ronronar contínuo do carinho: ruído grave modulado a ~24 Hz. */
export class Purr {
  private nodes: { src: AudioBufferSourceNode; lfo: OscillatorNode; out: GainNode } | null = null

  start(): void {
    if (this.nodes) return
    const a = getAudio()
    if (!a) return
    const { ctx, master } = a

    const len = 1.5
    const buf = ctx.createBuffer(1, Math.ceil(len * ctx.sampleRate), ctx.sampleRate)
    const data = buf.getChannelData(0)
    let brown = 0
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.985
      data[i] = brown * 8
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260

    // tremolo de "motorzinho": LFO 24 Hz modulando o ganho
    const mod = ctx.createGain()
    mod.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 24
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.4
    lfo.connect(lfoDepth).connect(mod.gain)

    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, ctx.currentTime)
    out.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.25)

    src.connect(lp).connect(mod).connect(out).connect(master)
    src.start()
    lfo.start()
    this.nodes = { src, lfo, out }
  }

  stop(): void {
    if (!this.nodes) return
    const a = getAudio()
    const { src, lfo, out } = this.nodes
    this.nodes = null
    if (!a) return
    const t = a.ctx.currentTime
    out.gain.cancelScheduledValues(t)
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t)
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    src.stop(t + 0.3)
    lfo.stop(t + 0.3)
  }
}
