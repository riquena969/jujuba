/** AudioContext singleton com unlock pro iOS.
 *  - criado/resumido apenas dentro de gesto do usuário
 *  - nunca forçar sampleRate: usar ctx.sampleRate nas contas
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null

export function getAudio(): { ctx: AudioContext; master: GainNode } | null {
  return ctx && master ? { ctx, master } : null
}

/** Chamar dentro de um handler de gesto (pointerdown). Idempotente. */
export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    // buffer silencioso de 1 sample "destrava" a saída no iOS
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

// iOS marca o contexto como 'interrupted' ao trocar de app — retoma ao voltar
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume()
})
