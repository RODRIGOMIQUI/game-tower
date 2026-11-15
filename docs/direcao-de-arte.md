# GameTower — Direção de Arte e Áudio (v0.1)

> Proposta inicial. Decisões marcadas com **[decidir]** precisam de aprovação.

## 1. Conceito visual

**"Maquete viva ao entardecer."** Uma torre em corte, legível como um
diagrama, mas aconchegante: janelas que acendem à noite, pessoas
minúsculas com cores claras de humor, céu que muda ao longo do dia.

Referências de *sensação* (não de estilo a copiar): maquetes
arquitetônicas, ilustrações isométricas de cidades, painéis de
controle de metrô.

## 2. Estilo **[decidir]**

**Proposta: pixel art moderna, em escala inteira (nearest-neighbor).**

| | Pixel art (proposta) | Vetor limpo |
|---|---|---|
| Leitura com milhares de agentes | ótima, sprites minúsculos continuam nítidos | boa |
| Custo de produção solo | baixo/médio | médio |
| Zoom livre | só múltiplos inteiros (1×–4×) + LOD | livre |
| Personalidade | alta, nostálgica | moderna, neutra |

## 3. Escala de grade (pixel art)

| Elemento | Tamanho base (zoom 1×) |
|---|---|
| Coluna | 8 px |
| Andar | 36 px de altura (30 px interior + 6 px laje) |
| Pessoa | 5 × 12 px (4 quadros de caminhada) |
| Carro de elevador | 4 colunas × 30 px |
| Escritório (9 col) | 72 × 36 px |

Zoom: 1×, 2×, 3×, 4×. Abaixo de 1× entra **LOD**: andares viram blocos de cor
por tipo, pessoas viram pontos de 1–2 px.

## 4. Paleta

Paleta limitada para consistência. Tokens usados no código (`render/palette.ts`).

| Token | Hex | Uso |
|---|---|---|
| `estrutura` | `#3B3F4A` | lajes, paredes externas |
| `estrutura-claro` | `#5A6070` | colunas, bordas |
| `lobby` | `#C9B48A` | piso de lobby, mármore |
| `escritorio` | `#7FA7C9` | interior de escritórios |
| `moradia` | `#D9A07A` | apartamentos |
| `hotel` | `#B98AC9` | quartos |
| `comida` | `#E3C25B` | lanchonete, restaurante |
| `comercio` | `#E38A6B` | lojas |
| `lazer` | `#6BC9B4` | cinema, eventos |
| `servico` | `#8E9AA6` | limpeza, segurança, médico |
| `transito` | `#F2F2F2` | poços e carros |
| `janela-noite` | `#FFD27A` | luz acesa |
| `humor-ok` | `#2B2B2B` | pessoa neutra |
| `humor-irritado` | `#E36BA0` | pessoa irritada |
| `humor-furioso` | `#E0393E` | pessoa furiosa |
| `alerta` | `#FF5A3C` | sem acesso, incêndio |

Humor usa **forma + cor** (furioso também ganha um ícone `!` acima da
cabeça) para acessibilidade a daltonismo.

### Céu por hora
| Hora | Topo | Horizonte |
|---|---|---|
| 06h | `#F6B38E` | `#FBE3C4` |
| 12h | `#6FB3E8` | `#CDE8F7` |
| 18h | `#E07A5F` | `#F2CC8F` |
| 22h | `#1B1F3B` | `#3D3B6E` |

Interpolação contínua; cada estação aplica um leve ajuste de matiz.

## 5. Iluminação e vida

- À noite, o interior das unidades escurece e as **janelas ocupadas acendem**
  (`janela-noite`), formando o "retrato" da torre ocupada.
- Unidades vazias mostram uma placa "Disponível"; unidades em risco mostram um
  ícone pulsando.
- Pequenas animações por unidade: monitores piscando no escritório, vapor
  na lanchonete, tela no cinema. Ficam desligadas no LOD.

## 6. Interface

- UI **flat e limpa**, separada da pixel art do mundo (não pixelada).
- Fonte de UI: **Inter** (texto) e **JetBrains Mono** (números, relógio).
- Painéis em vidro escuro (`#1E2129` a 92% de opacidade), cantos de 8 px.
- Ícones de construção: pixel art 16×16 em escala 2×, combinando com o mundo.
- Tema único escuro na v1; tema claro fica para depois.

## 7. Áudio

**Trilha:** jazz suave e bossa nova instrumental, com variação por hora
(manhã mais leve, noite mais lounge). As faixas são originais ou de licença
livre/comprada.

**Ambiente adaptativo:** camadas que sobem com a lotação.
- murmúrio de pessoas (volume ∝ agentes visíveis)
- "ding" de elevador (limitado a 1 a cada 300 ms para não virar ruído)
- trânsito da rua no térreo, vento nos andares altos
- passos no lobby

**UI:** cliques curtos, um som de "caixa registradora" ao fechar o trimestre e
um jingle ao subir de estrela.

## 8. Entregas de arte por fase

| Fase | Entrega |
|---|---|
| 1–4 | **arte provisória**: retângulos na cor da paleta + pessoas como pílulas coloridas |
| 6 | ícones de UI, overlays |
| 7 | sprites finais de unidades, pessoas (4 tipos × 3 humores × anim.), céu, efeitos, áudio |

A arte provisória já usa os tokens da paleta, para que a troca pela arte
final seja apenas de textura.
