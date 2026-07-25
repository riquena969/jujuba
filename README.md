# Jujuba 🦊

> 🎮 **Jogar agora:** <https://riquena969.github.io/jujuba/> — abre direto no celular!
> (é HTTPS de verdade, então o microfone funciona no iPhone/Android sem configurar nada)

Bichinho virtual estilo *My Talking Tom*, rodando **no browser do celular**. Uma
raposinha chibi (você escolhe o nome — padrão Foxy) que reage a carinho, come, dorme,
**toma banho**, **escova os dentes** e **imita a sua voz** com vozinha aguda — igual ao
Talking Tom raiz. Quatro cômodos (🍳 cozinha, 🛋️ sala, 🌙 quarto, 🛁 banheiro) nas
setinhas do topo. Ela se suja com o tempo (manchinhas + barra 🧼) e comer suja os
dentinhos (farelos + dentes amarelando) — **banheira e pia brilham piscando quando
precisam de você**. Modelo 3D v2: malha única gerada por script (bmesh + subsurf),
olhos de íris âmbar, pálpebras e sobrancelhas de verdade, boca com dentes e língua.

Tudo 3D (Three.js), com o modelo **gerado 100% por script no Blender** (nada de assets
comprados): malha, ossos, expressões e ícones saem de `blender/*.py`.

## Rodar

```bash
npm install
npm run dev          # abre em https://localhost:5173 (ou http se não houver certs/)
```

## Deploy

Push na `main` → GitHub Actions builda e publica no GitHub Pages automaticamente
(`.github/workflows/deploy.yml`; o `vite.config.ts` usa `base: '/jujuba/'` no CI).

## Testar o DEV local no iPhone (mic exige HTTPS "de verdade")

O Safari do iOS **recusa o microfone com certificado self-signed**, mesmo aceitando o
aviso. O caminho é o [mkcert](https://github.com/FiloSottile/mkcert):

```bash
brew install mkcert
mkcert -install                      # confia a CA local no Mac (pede senha)
mkcert -key-file certs/key.pem -cert-file certs/cert.pem \
  localhost 127.0.0.1 $(ipconfig getifaddr en0)
```

1. Mande o arquivo `$(mkcert -CAROOT)/rootCA.pem` pro iPhone (AirDrop).
2. No iPhone: Ajustes → *Perfil baixado* → instalar; depois **Ajustes → Geral →
   Sobre → Certificados confiáveis** → ativar confiança total na CA.
3. `npm run dev` e acesse `https://<IP-do-Mac>:5173` no Safari do iPhone.

> Plano B sem perfil: `cloudflared tunnel --url http://localhost:5173` (certificado real).

Notas do iOS: o **botão físico de silencioso muta o WebAudio** (destrave o som do
aparelho); o primeiro toque na tela ("Toque para começar") é o que destrava o áudio.
O manifest usa `display: "browser"` de propósito — mic em PWA standalone é instável no iOS.

## Assets (Blender scriptado)

Requer Blender no PATH (`brew install --cask blender`). Os `.glb` ficam commitados em
`public/models/` — só precisa rodar isto quando mexer nos scripts:

```bash
npm run fox:build      # raposa: malha + 17 ossos + shape keys → jujuba.glb + previews
npm run foods:build    # biscoito/maçã/coxa → glb + ícones da bandeja
npm run icon:build     # ícones do app (closeup da carinha)
npm run assets:build   # tudo acima
node scripts/check-glb.mjs   # gate: valida ossos/morphs exportados
```

Loop de iteração visual: edite o dict `PROPORTIONS`/`P` em `blender/jujuba.py`, rode o
build e olhe os renders em `blender/preview/`.

## Testes

```bash
npm run test:e2e   # Playwright + mic FAKE (WAV sintético de fala) — cobre carinho,
                   # poke, comida, decay offline e o fluxo completo de voz
```

## Arquitetura (resumo)

- `src/fox/rig.ts` — carrega o glb e resolve ossos/morphs **por nome** (contrato com o
  Blender; validação barulhenta se quebrar).
- `src/fox/animations.ts` — animação 100% procedural em camadas sobre a pose de descanso
  (respiração, rabo, piscada, olhar segue o dedo, orelhas). Um escritor por osso/frame.
- `src/fox/behavior.ts` — FSM `IDLE/PETTING/POKED/EATING/LISTENING/REPLAYING`; toda
  interação passa por aqui (animações nunca brigam).
- `src/interactions/voice.ts` + `public/worklets/recorder.js` — VAD por RMS no
  AudioWorklet (pre-roll 250 ms, cap 10 s), playback com `playbackRate 1.5` (chipmunk),
  mandíbula sincronizada por Analyser, anti-feedback (mic desligado durante o replay).
- `src/interactions/{pointer,feeding}.ts` — carinho×poke por classificador de gesto;
  comida é **arrastada da bandeja até a boca** (boca-imã: abre por proximidade e
  abocanha pertinho; soltar longe cancela; tap = voo automático), 3 mordidas + migalhas.
- `src/game/state.ts` — fome/alegria com decay (também offline via `lastSeen`),
  persistência em `localStorage`.
- Sons: 100% sintetizados via WebAudio (`src/audio/sfx.ts`) — zero arquivos de áudio.

## Roadmap

v0.5 roupinhas + guarda-roupa · v0.6 bolinha + moedas · depois: minigames, modo
offline, conversa de verdade via IA. (Raposinha v2 e escovação: entregues ✓ — o plano
da v2 está em [docs/raposinha-v2.md](docs/raposinha-v2.md).)
