# GameTower

Simulador de construção e gestão de arranha-céu em corte lateral.
Stack: TypeScript + PixiJS + Vite.

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173  (sandbox: http://localhost:5173/?sandbox=1)
npm test             # testes da simulação
npm run typecheck
npm run data         # regenera src/data/unidades.json a partir de docs/dados/unidades.csv
```

**Controles:** arraste com o botão esquerdo para construir (linha ou retângulo) ·
botão direito/meio ou esquerdo sem ferramenta move a câmera · roda/`+`/`-` = zoom ·
setas movem a câmera · `Espaço` pausa · `1`–`4` = 1×/2×/4×/8× ·
`P` piso · `L` lobby · `E` escavação · `O` escritório · `A` apartamento · `X` demolir · `Esc` cancela.

## Estrutura do código

```
src/
├── sim/      simulação pura e determinística (sem DOM/Pixi): mundo, construção, relógio, jogo
├── worker/   Worker que roda a simulação + protocolo de mensagens
├── render/   PixiJS: câmera, cena, paleta
├── ui/       HUD em DOM: barra superior, paleta de construção, status, avisos
└── data/     unidades.json (gerado)
```

## Documentação (Fase 0)

- [Game Design Document](docs/gdd.md): visão, regras, sistemas, progressão
- [Direção de arte e áudio](docs/direcao-de-arte.md): estilo, escala, paleta, som
- [Economia e balanceamento](docs/economia.md): fórmulas, retorno, curva de progressão
- [Tabela de unidades](docs/dados/unidades.csv): valores iniciais de todas as unidades

## Roadmap

| Fase | Conteúdo | Status |
|---|---|---|
| 0 | Pré-produção (GDD, arte, economia) | ✅ |
| 1 | Fundação técnica: grade, câmera, construção, relógio | ✅ |
| 2 | Pessoas e transporte vertical | — |
| 3 | Inquilinos e economia | — |
| 4 | Progressão e infraestrutura (MVP) | — |
| 5 | Eventos | — |
| 6 | UX moderna: overlays, relatórios, save | — |
| 7 | Arte e áudio finais | — |
| 8 | Performance e escala | — |
| 9 | Balanceamento, beta, lançamento | — |
