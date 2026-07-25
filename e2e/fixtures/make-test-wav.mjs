// Gera e2e/fixtures/voice.wav — "fala" sintética pro mic fake do Chromium:
// 0.4s silêncio (calibra ambiente) + 1.8s de vogais moduladas + 1.5s silêncio
// (dispara o speechend). PCM16 mono 48 kHz.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 48000
const dir = dirname(fileURLToPath(import.meta.url))

const silence1 = 0.4
const speech = 1.8
const silence2 = 1.5
const total = silence1 + speech + silence2
const n = Math.round(total * SR)
const samples = new Int16Array(n)

for (let i = 0; i < n; i++) {
  const t = i / SR
  if (t < silence1 || t > silence1 + speech) continue
  const ts = t - silence1
  // "voz": fundamental + harmônicos, com envelope de sílabas a 3.5 Hz
  const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3.5 * ts - Math.PI / 2)
  const f0 = 175 + 40 * Math.sin(2 * Math.PI * 0.7 * ts)
  const v =
    0.6 * Math.sin(2 * Math.PI * f0 * ts) +
    0.3 * Math.sin(2 * Math.PI * f0 * 2 * ts) +
    0.15 * Math.sin(2 * Math.PI * f0 * 3.1 * ts)
  const edge = Math.min(1, ts / 0.06, (speech - ts) / 0.06) // fade nas bordas
  samples[i] = Math.round(v * syllable * edge * 0.45 * 32767)
}

const dataLen = samples.length * 2
const buf = Buffer.alloc(44 + dataLen)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataLen, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(1, 22) // mono
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 2, 28)
buf.writeUInt16LE(2, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(dataLen, 40)
Buffer.from(samples.buffer).copy(buf, 44)

mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'voice.wav'), buf)
console.log(`voice.wav: ${total}s @ ${SR} Hz (${(buf.length / 1024).toFixed(0)} KB)`)
