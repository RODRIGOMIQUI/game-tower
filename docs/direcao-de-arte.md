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
| `interior-vazio` | `#9BA1AD` | andar sem unidade (corredor); claro para as pessoas aparecerem |
| `poco` | `#2E323B` | poço de elevador |
| `carro` / `carro-carga` | `#F2F2F2` / `#E3C25B` | carro de elevador / quanto está cheio |
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

## 8. Implementação (Fase 7)

Toda a arte e o áudio são **gerados por código**, sem arquivos de imagem ou som:
nada a licenciar, e o visual muda junto com o código.

**Arte** (`src/render/arte.ts`, `fundo.ts`, `cena.ts`, `dinamica.ts`):
- Cada tipo de unidade tem um interior em pixel art (mesas e monitores,
  camas, mesas com toalha e lustres, prateleiras, leitos com cortina, carros
  estacionados, vagões de metrô, cúpula da Coroa…), com 3 variações por tipo e
  versões vaga (sala vazia com placa), suja e com pragas. Cada combinação vira
  uma textura gerada uma vez e reaproveitada.
- Andares vazios mostram janelas da fachada; o lobby tem colunas, piso
  quadriculado e portas de vidro nas entradas; o topo de cada trecho tem
  platibanda. Poços têm cabos, batentes e luz de chamada (amarela no de serviço;
  faixa dourada no expresso).
- Pessoas: roupa, calça, tom de pele e cabelo variam por pessoa; pernas
  alternam ao andar. Humor = balão acima da cabeça (rosa "!" irritado, vermelho
  "!!" furioso). VIP: roupa dourada e coroa.
- Carros de elevador: luz interna e as cabeças dos passageiros.
- Fundo: sol e lua em arco, estrelas piscando, nuvens, duas camadas de cidade
  com paralaxe e janelas que acendem à noite. Unidades ocupadas ganham luz
  acesa à noite (desenhada acima da camada de escuridão).

**Áudio** (`src/audio/`), todo WebAudio, liberado no primeiro clique/tecla:
- Trilha generativa original de jazz suave/bossa: piano elétrico (FM), baixo,
  chocalho e vibrafone esparso, em 4 progressões que trocam de tom; à noite
  fica mais lenta, esparsa e escura.
- Ambiente: murmúrio proporcional às pessoas visíveis, trânsito perto do chão,
  vento nos andares altos.
- Efeitos: clique de interface, construir, demolir, "ding" quando um carro
  visível para (no máximo 1 a cada 300 ms), caixa registradora no fechamento,
  jingle de estrela, alarme de incêndio, pane, fogos e erro.
- Volume geral, música, efeitos e ambiente no menu (Áudio); botão de mudo na
  barra superior. Preferências ficam guardadas no navegador.
