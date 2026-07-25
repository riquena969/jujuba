/**
 * Worklet de captura da Jujuba: VAD por RMS + gravação em ring buffer.
 *
 * JS puro (servido de public/ — sem bundler). Regras do Safari:
 * nada de console.log aqui dentro — debug via port.postMessage.
 *
 * Mensagens que SAEM:  {type:'speechstart'} | {type:'speechabort'} |
 *                      {type:'clip', sampleRate, samples: Float32Array} |
 *                      {type:'level', rms}
 * Mensagens que ENTRAM: {cmd:'gate', on: boolean}  — desliga o VAD durante
 *                       playback/estados não-IDLE (anti-feedback).
 */
class JujubaRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.enabled = true
    // pré-roll de 250 ms pra não decepar o comecinho da fala
    this.pre = new Float32Array(Math.ceil(0.25 * sampleRate))
    this.preIdx = 0
    this.preFill = 0
    // gravação: máx 10 s
    this.rec = new Float32Array(Math.ceil(10 * sampleRate))
    this.recLen = 0
    this.recording = false
    // VAD
    this.ambient = 0.004 // EMA do ruído de fundo
    this.speechRun = 0
    this.silenceSamples = 0
    this.levelTick = 0

    this.port.onmessage = (e) => {
      if (e.data && e.data.cmd === 'gate') {
        this.enabled = !!e.data.on
        if (!this.enabled && this.recording) this._abort()
      }
    }
  }

  _abort() {
    this.recording = false
    this.recLen = 0
    this.speechRun = 0
    this.port.postMessage({ type: 'speechabort' })
  }

  _finish() {
    // apara metade do rabo de silêncio (deixa ~300 ms de respiro)
    const trim = Math.floor(0.3 * sampleRate)
    let len = this.recLen
    if (this.silenceSamples > trim) len -= this.silenceSamples - trim
    this.recording = false
    this.recLen = 0
    this.speechRun = 0
    if (len < 0.55 * sampleRate) {
      this.port.postMessage({ type: 'speechabort' })
      return
    }
    const samples = this.rec.slice(0, len)
    this.port.postMessage({ type: 'clip', sampleRate, samples }, [samples.buffer])
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch || !this.enabled) return true

    let sum = 0
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
    const rms = Math.sqrt(sum / ch.length)

    this.levelTick++
    if (this.levelTick % 12 === 0) this.port.postMessage({ type: 'level', rms })

    const startTh = Math.max(0.015, this.ambient * 3.5)
    const stopTh = Math.max(0.01, this.ambient * 2.0)

    if (!this.recording) {
      // calibra ambiente só fora da fala
      this.ambient = this.ambient * 0.995 + rms * 0.005
      // alimenta o pré-roll circular
      for (let i = 0; i < ch.length; i++) {
        this.pre[this.preIdx] = ch[i]
        this.preIdx = (this.preIdx + 1) % this.pre.length
      }
      this.preFill = Math.min(this.preFill + ch.length, this.pre.length)

      if (rms > startTh) {
        this.speechRun++
        if (this.speechRun >= 3) {
          // começa gravando o pré-roll em ordem
          this.recording = true
          this.silenceSamples = 0
          this.recLen = 0
          const n = this.preFill
          let idx = (this.preIdx - n + this.pre.length * 2) % this.pre.length
          for (let i = 0; i < n; i++) {
            this.rec[this.recLen++] = this.pre[idx]
            idx = (idx + 1) % this.pre.length
          }
          this.port.postMessage({ type: 'speechstart' })
        }
      } else {
        this.speechRun = 0
      }
      return true
    }

    // gravando
    const room = this.rec.length - this.recLen
    const n = Math.min(room, ch.length)
    this.rec.set(n === ch.length ? ch : ch.subarray(0, n), this.recLen)
    this.recLen += n

    if (rms < stopTh) {
      this.silenceSamples += ch.length
      if (this.silenceSamples >= 0.6 * sampleRate) this._finish()
    } else {
      this.silenceSamples = 0
    }
    if (this.recLen >= this.rec.length) this._finish() // cap de 10 s

    return true
  }
}

registerProcessor('jujuba-recorder', JujubaRecorder)
