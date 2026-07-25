# Raposinha v2 — plano da fofura detalhada 🦊✨

> **VEREDITO (2026-07-25):** v2 implementada de ponta a ponta (`blender/jujuba2.py`) e
> **revertida por preferência do Kevin** — a v1 chibi de esferas é mais bonita aos olhos
> dele, e gosto é soberano. A v2 fica no repo como experimento; lições aproveitáveis:
> a íris âmbar texturizada, as pálpebras por osso (contrato de ossos OPCIONAIS já está
> no runtime, com fallback) e a mesh 'Teeth' tingível. Um futuro retry deve **evoluir as
> proporções exatas da v1** (mesmas esferas, mesmo rosto) adicionando detalhes AOS POUCOS,
> em vez de topologia nova de uma vez.

**Objetivo:** evoluir a raposinha de "elipsoides sobrepostos" (v1, estilo massinha) para
uma personagem mais detalhada e levemente mais realista, mantendo o corpo meio
humanoide/bípede estilo *Talking Angela* — e mantendo 100% do pipeline scriptado
(Blender headless + iteração por renders).

## Diagnóstico da v1

A v1 é montada por primitivas independentes que se sobrepõem: cabeça-esfera + focinho-esfera
+ bochechas-esferas etc. Funciona e é fofa, mas tem tetos claros:

- **Emendas visíveis** entre as partes (silhueta "gomos") e nenhuma continuidade de superfície
- **Sem pálpebras reais** (piscada achata o olho por morph — funciona, mas o "calombo" fica)
- Mãos e pés são bolas — sem dedinhos; cauda é uma fileira de bolas
- Sem sobrancelhas, sem língua/dentes, boca sem cantos expressivos
- Cores chapadas por material — sem gradientes de pelagem

## Opções avaliadas

| Opção | Veredito |
|---|---|
| **Baixar modelo pronto** (Sketchfab "Rigged Cute Fox", "Cutie Fox"; Poly Pizza/Quaternius CC0) | ❌ como base / ✅ como referência visual. Nenhum vem bípede com rig facial; TODOS exigiriam cirurgia pesada (re-rig completo pro nosso contrato de 17 ossos, mandíbula articulada, shape keys) em topologia alheia e às cegas no pipeline headless. Licenças variam (CC-BY exige atribuição; CC0 ok). Úteis pra calibrar proporção/estilo. |
| **Gerar por IA** (Meshy etc., CC0) | ❌ topologia bagunçada, sem rig, mesmo problema de cirurgia. |
| **Evoluir o pipeline procedural** | ✅ **escolhido.** Scriptar a técnica que modeladores usam de verdade: box-modeling de uma *cage* low-poly + Subdivision Surface → malha única, contínua e lisa. Controle total, zero problema de licença, mesmos loops de iteração por render. |

## Técnica central (a grande mudança)

1. **Cage por código (bmesh):** construir vértice-a-vértice uma gaiola low-poly do corpo
   INTEIRO conectado (cabeça+focinho+orelhas+tronco+membros+cauda numa malha só), com
   espelhamento X programático. Helpers novos em `lib.py`: `loft(rings)` (pontes entre
   anéis de vértices), `extrude_ring`, `crease(edges, v)`.
2. **Subdivision Surface ×2** + creases seletivos (pontas de orelha, sola) → superfície
   orgânica contínua. **Aplicar o modifier ANTES dos shape keys** (regra do exporter que
   já dominamos).
3. **Vertex colors** pra pelagem com gradiente: costas laranja → barriga/peito creme,
   "luvas" e "botas" chocolate, máscara facial, interior de orelha. Material único com
   `vertex_color` (glTF exporta; three lê `vertexColors: true`). Sem texturas de imagem
   (exceto a íris, abaixo).

## A lista da fofura (detalhes novos)

- **Cabeça:** testa mais alta e arredondada, focinho curto com ponte definida,
  **tufos de pelo nas bochechas** (3 pontas laterais, marca registrada de raposa),
  nariz formato coração invertido.
- **Olhos v2 (o upgrade que mais aparece):** maiores estilo Angela, globo com
  **textura de íris âmbar** (64px gerada por código: íris + pupila + 2 brilhos),
  **pálpebras superiores REAIS** (meshes curvas com ossos `lidL`/`lidR`) → piscada
  natural, meia-pálpebra de sono, olhar derretido no carinho.
- **Sobrancelhas:** patches escuros com ossos `browL`/`browR` → surpresa, tristeza,
  braveza fofa.
- **Boca v2:** cavidade interna de verdade, **língua** (osso `tongue` — lamber os
  beiços pós-comida, ofegar), 2 caninos minúsculos, morphs novos `sad`, `ooh`,
  `cheekPuff` (bochecha estufada no arrotinho!).
- **Corpo:** silhueta pêra suave, colinho de pelo no peito, braços com **mãozinhas de
  3 dedos** esculpidos por crease, pernas digitígradas com pezinhos.
- **Cauda v2:** malha única em S com tufos na ponta (adeus fileira de bolas), mesmos
  3 ossos.

## Contrato rig v2 (compatibilidade)

- **Mantém os 17 ossos atuais com os mesmos nomes** → `animations.ts` continua
  funcionando sem mudanças.
- Novos ossos OPCIONAIS: `lidL lidR browL browR tongue` — `rig.ts` ganha
  `OPTIONAL_BONES` (ausência não quebra a validação; v1 segue carregável).
- Morphs: `smile` mantém; piscada migra de morph para os ossos de pálpebra
  (`expressions.ts` adapta com fallback pros morphs se os bones não existirem);
  novos: `sad`, `ooh`, `cheekPuff`.
- Mesmo caminho `public/models/jujuba.glb`; durante a transição, flag `?fox=v2` e
  v1 preservada em `blender/jujuba_v1.py`.

## Fases (cada uma com gate visual seu)

| Fase | Entrega | Gate |
|---|---|---|
| **F1 — Spike da cabeça** | cage+subsurf de cabeça/focinho/orelhas + olhos com íris | closeup aprovado por você (a cara decide tudo) |
| **F2 — Corpo inteiro** | malha única com membros/mãos/cauda + vertex colors | turntable 4 ângulos |
| **F3 — Rosto completo** | pálpebras, sobrancelhas, boca interna, língua, dentes, morphs v2 | folha de expressões: feliz/triste/surpresa/sono/bravo |
| **F4 — Rig + runtime** | export v2, `rig.ts` opcionais, piscada por pálpebra, lamber/ofegar | 19/19 E2E + idle vivo no jogo |
| **F5 — Swap final** | troca definitiva + ajuste de luz/material | lado-a-lado v1×v2 no celular |

## Riscos e mitigação

- **Subsurf × shape keys:** aplicar modifiers antes dos keys (já é regra do nosso `lib.py`).
- **Peso:** alvo ≤ 25k triângulos pós-subdivisão (v1 tem ~15k); medir no gate F2 via
  `renderer.info` e reduzir nível de subdiv se passar.
- **Cage por código é verboso:** helpers de loft/bridge deixam declarativo (listas de
  anéis com raios/alturas — parecido com os dicts `P` da v1, só que gerando UMA malha).
- **Fofura é subjetiva:** por isso gates visuais curtos com você a cada fase, começando
  pela cabeça.

## Referências visuais

- Proporções bípedes e expressões: Talking Angela/Tom (memória visual, não asset)
- [Rigged Cute Fox (Sketchfab)](https://sketchfab.com/3d-models/rigged-cute-fox-character-ab556b01e9be4163888a9c1ac05675db) e
  [Cutie Fox (Sketchfab)](https://sketchfab.com/3d-models/cutie-fox-stylized-cartoon-animal-9ab180457fda4f04a2388c09a99d6e31) — referência de proporção/olhos
- [Poly Pizza](https://poly.pizza) / Quaternius — silhuetas low-poly CC0 pra comparar
