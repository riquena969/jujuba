# Jujuba 🦊

> 🎮 **Jogar agora:** <https://riquena969.github.io/jujuba/> — abre direto no celular!
> (é HTTPS de verdade, então o microfone funciona no iPhone/Android sem configurar nada)

Bichinho virtual estilo *My Talking Tom*, rodando **no browser do celular**. Uma
raposinha chibi (você escolhe o nome — padrão Foxy) que reage a carinho, come, dorme,
**toma banho**, **escova os dentes**, **joga bolinha e estoura bolhas de sabão** e
**imita a sua voz** com vozinha aguda — igual ao Talking Tom raiz. Cinco cômodos
(🍳 cozinha, 🛋️ sala, 🌙 quarto, 🛁 banheiro, 🧸 brinquedos) nas setinhas do topo.
Ela se suja com o tempo (manchinhas + barra 🧼) e comer suja os dentinhos (farelos +
dentes amarelando + manchas nos vãos da arcada) — **banheira, pia e potinho de bolha
brilham piscando quando pedem um toque**. Modelo 3D: adaptação CC-BY (créditos no
quadro pendurado na sala e no fim deste README) com re-rig completo, arcada de 12
dentinhos, língua e **olhinhos expressivos por estilo** (normal, soninho, tristinha —
trocam sozinhos com o humor dela).

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

## Salas & atividades

🍳 cozinha (roleta de comidas) · 🛋️ sala (imitar a voz + **quadro de créditos**
clicável) · 🌙 quarto (dormir) ·
🛁 banheiro (banho + **escovação em close**: a câmera dá zoom na boca escancarada,
com dentinhos de verdade mostrando manchas de sujeira — escova 3D no dedo esfrega,
o jatinho 💦 enxágua, gargarejo + cuspidinha no final) · 🧸 **brinquedos**: bolinha
física estilo Pou (arrasta e arremessa, ela acompanha e rebate!) e o **minigame das
bolhas de sabão** — toque no potinho brilhante e o cenário vira um jardim de céu
aberto: as bolhas entram por baixo da tela (sempre ao alcance do dedo) e você
estoura todas antes de fugirem pelo topo; cada rodada vem com mais bolhas, mais
rápidas e mais dançantes.

## Roadmap

v0.6 roupinhas + guarda-roupa · v0.7 moedas + mais minigames · depois: modo offline,
conversa de verdade via IA.

## Créditos (modelos CC-BY adaptados)

A raposinha atual é uma adaptação (dieta de polígonos, re-rig no nosso esqueleto,
boca articulada com dentes/língua e olhos expressivos) de dois modelos CC-BY:

> This work is based on "Rigged Cute Fox character"
> (https://sketchfab.com/3d-models/rigged-cute-fox-character-ab556b01e9be4163888a9c1ac05675db)
> by Robetti (https://sketchfab.com/Robetti) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

> This work is based on "Eyeballs Stylized Flat Anime Cartoon Eyes 4k"
> (https://sketchfab.com/3d-models/eyeballs-stylized-flat-anime-cartoon-eyes-4k-5f8c96c3645a4e27bcb0c2e7ee0a8669)
> by SculptCuteness (https://sketchfab.com/SculptCuteness) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

A v1 100% scriptada segue no repo (`blender/jujuba_v1.py`, `npm run fox:build:v1`).
