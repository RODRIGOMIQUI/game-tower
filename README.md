# GameTower

Simulador de construção e gestão de arranha-céu em corte lateral.
Stack: TypeScript + PixiJS + Vite.

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173  (menu inicial; sandbox direto: ?sandbox=1)
npm test             # testes da simulação
npm run typecheck
npm run sim          # cenários headless: 2.000 pessoas (hora a hora) e 2 anos de carreira
LONGO=1 npm run sim:partida   # partida completa ★1 → Lendária com construtor automático (minutos)
npm run data         # regenera src/data/unidades.json a partir de docs/dados/unidades.csv
```

**Controles:** arraste com o botão esquerdo para construir (linha ou retângulo) ·
botão direito/meio ou esquerdo sem ferramenta move a câmera · roda/`+`/`-` = zoom ·
setas movem a câmera · `Espaço` pausa · `1`–`4` = 1×/2×/4×/8× ·
`P` piso · `L` lobby · `E` escavação · `O` escritório · `A` apartamento · `V` elevador ·
`T` escada · `X` demolir · `Esc` cancela · `Ctrl+Z` desfaz · `C` camadas · `R` relatórios ·
`M` menu (salvar/carregar/exportar) · `?` atalhos.

Elevador: escolha a ferramenta e **arraste na vertical** para definir os andares.
Clique (sem ferramenta) num poço ou unidade para abrir o inspetor: lá se
adicionam carros e se muda o modo de despacho. Unidades com contorno vermelho
estão **sem acesso** (sem rota a partir do lobby).

Unidades novas ficam **vagas** (cinza, com placa) até um inquilino chegar. No
inspetor de uma unidade você vê situação, receita e satisfação (com o motivo de
cada ponto) e ajusta o **preço**. Marcador amarelo = satisfação baixa; laranja =
inquilino já recebeu aviso e pode sair no próximo fechamento. Caixa negativo em
dois fechamentos seguidos = falência (exceto no sandbox).

Clique numa pessoa para ver a ficha dela (nome, destino, estresse, histórico) e
**Seguir**. Incêndios, panes, pragas, VIP, achados e o festival de ano novo
aparecem como avisos; os que têm local levam a câmera até lá quando clicados.
No sandbox, o botão **Eventos** liga/desliga os eventos.

A barra ao lado das estrelas mostra o progresso para o próximo nível; passe o
mouse para ver cada requisito (população, unidades exigidas, satisfação média,
inspeção ou inauguração).

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
| 2 | Pessoas e transporte vertical | ✅ |
| 3 | Inquilinos e economia | ✅ |
| 4 | Progressão e infraestrutura (MVP) | ✅ |
| 5 | Eventos | ✅ |
| 6 | UX moderna: overlays, relatórios, save | ✅ |
| 7 | Arte e áudio finais | — |
| 8 | Performance e escala | — |
| 9 | Balanceamento, beta, lançamento | — |
