import type { FoxBehavior } from '../fox/behavior'
import type { PoseInput } from '../fox/animations'
import { getAudio, unlockAudio } from '../audio/context'
import { clamp } from '../utils/math'

const CHIPMUNK_RATE = 1.5

interface Deps {
  behavior: FoxBehavior
  pose: PoseInput
}

/** Imitação de voz: escuta automática (VAD no worklet) → repete agudinho. */
export class VoiceSystem {
  enabled = false
  /** último RMS reportado (UI pode pulsar com isso) */
  level = 0

  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private fallback: ScriptProcessorNode | null = null
  private analyser: AnalyserNode | null = null
  private analyserData: Float32Array<ArrayBuffer> | null = null
  private playing = false
  private lastGate: boolean | null = null

  constructor(private deps: Deps) {}

  private get micTrack(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0] ?? null
  }

  async enable(): Promise<boolean> {
    if (this.enabled) return true
    unlockAudio()
    const audio = getAudio()
    if (!audio) return false
    const { ctx } = audio
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      console.warn('[jujuba] mic negado/indisponível:', err)
      return false
    }
    this.source = ctx.createMediaStreamSource(this.stream)

    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule('/worklets/recorder.js')
      this.worklet = new AudioWorkletNode(ctx, 'jujuba-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      })
      this.worklet.port.onmessage = (e) => this.handleMessage(e.data)
      this.source.connect(this.worklet) // sem caminho pro destination
    } else {
      this.setupScriptProcessorFallback(ctx)
    }
    this.enabled = true
    this.lastGate = null
    return true
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    const b = this.deps.behavior
    if (b.state === 'LISTENING') b.enter('IDLE')
    this.worklet?.port.postMessage({ cmd: 'gate', on: false })
    this.worklet?.disconnect()
    this.worklet = null
    this.fallback?.disconnect()
    this.fallback = null
    this.source?.disconnect()
    this.source = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  /** Fallback raro (sem AudioWorklet): mesma VAD, na main thread. */
  private setupScriptProcessorFallback(ctx: AudioContext): void {
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    const pre: number[] = []
    const preMax = Math.ceil(0.25 * ctx.sampleRate)
    let rec: Float32Array | null = null
    let recLen = 0
    let ambient = 0.004
    let run = 0
    let silence = 0
    let gateOn = true
    this.fallbackGate = (on) => {
      gateOn = on
      if (!on && rec) {
        rec = null
        this.handleMessage({ type: 'speechabort' })
      }
    }
    proc.onaudioprocess = (e) => {
      if (!gateOn) return
      const ch = e.inputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
      const rms = Math.sqrt(sum / ch.length)
      this.handleMessage({ type: 'level', rms })
      const startTh = Math.max(0.015, ambient * 3.5)
      const stopTh = Math.max(0.01, ambient * 2)
      if (!rec) {
        ambient = ambient * 0.99 + rms * 0.01
        for (const s of ch) {
          pre.push(s)
          if (pre.length > preMax) pre.shift()
        }
        if (rms > startTh && ++run >= 1) {
          rec = new Float32Array(Math.ceil(10 * ctx.sampleRate))
          recLen = 0
          for (const s of pre) rec[recLen++] = s
          silence = 0
          this.handleMessage({ type: 'speechstart' })
        }
      } else {
        const n = Math.min(rec.length - recLen, ch.length)
        rec.set(ch.subarray(0, n), recLen)
        recLen += n
        silence = rms < stopTh ? silence + ch.length : 0
        if (silence >= 0.6 * ctx.sampleRate || recLen >= rec.length) {
          const samples = rec.slice(0, recLen)
          rec = null
          run = 0
          if (samples.length < 0.55 * ctx.sampleRate) {
            this.handleMessage({ type: 'speechabort' })
          } else {
            this.handleMessage({ type: 'clip', sampleRate: ctx.sampleRate, samples })
          }
        }
      }
    }
    // ScriptProcessor precisa estar ligado no grafo pra processar (mudo)
    const mute = ctx.createGain()
    mute.gain.value = 0
    this.source!.connect(proc)
    proc.connect(mute).connect(ctx.destination)
    this.fallback = proc
  }

  private fallbackGate: ((on: boolean) => void) | null = null

  private handleMessage(msg: {
    type: string
    rms?: number
    sampleRate?: number
    samples?: Float32Array<ArrayBuffer>
  }): void {
    const b = this.deps.behavior
    switch (msg.type) {
      case 'level':
        this.level = msg.rms ?? 0
        break
      case 'speechstart':
        if (b.state === 'IDLE') b.enter('LISTENING')
        break
      case 'speechabort':
        if (b.state === 'LISTENING') b.enter('IDLE')
        break
      case 'clip':
        if (b.state === 'LISTENING') {
          this.playback(msg.samples!, msg.sampleRate!)
        }
        break
    }
  }

  private playback(samples: Float32Array<ArrayBuffer>, clipRate: number): void {
    const audio = getAudio()
    if (!audio) return
    const { ctx, master } = audio
    const b = this.deps.behavior
    b.enter('REPLAYING')
    this.playing = true

    // anti-feedback: mic desligado durante o playback
    if (this.micTrack) this.micTrack.enabled = false
    this.gate(false)

    const buf = ctx.createBuffer(1, samples.length, clipRate)
    buf.copyToChannel(samples, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = CHIPMUNK_RATE

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyserData = new Float32Array(this.analyser.fftSize)

    src.connect(this.analyser)
    this.analyser.connect(master)
    src.onended = () => {
      this.playing = false
      this.deps.pose.jawOpen = 0
      this.analyser = null
      if (b.state === 'REPLAYING') b.enter('IDLE')
      // religa o mic um tico depois (deixa o eco morrer)
      setTimeout(() => {
        if (this.enabled && this.micTrack) this.micTrack.enabled = true
      }, 150)
    }
    src.start()
  }

  private gate(on: boolean): void {
    this.worklet?.port.postMessage({ cmd: 'gate', on })
    this.fallbackGate?.(on)
  }

  /** Por frame: jaw sync no playback + gate do VAD conforme o estado. */
  update(): void {
    const b = this.deps.behavior
    if (this.enabled) {
      const gateOn = !this.playing && (b.state === 'IDLE' || b.state === 'LISTENING')
      if (gateOn !== this.lastGate) {
        this.gate(gateOn)
        this.lastGate = gateOn
      }
    }
    if (this.playing && this.analyser && this.analyserData) {
      this.analyser.getFloatTimeDomainData(this.analyserData)
      let sum = 0
      for (let i = 0; i < this.analyserData.length; i++) {
        sum += this.analyserData[i] * this.analyserData[i]
      }
      const rms = Math.sqrt(sum / this.analyserData.length)
      this.deps.pose.jawOpen = clamp(rms * 7, 0.06, 1)
    }
  }
}
