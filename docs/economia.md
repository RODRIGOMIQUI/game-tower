# GameTower — Economia e Balanceamento (v0.1)

> Tabela de unidades: [dados/unidades.csv](dados/unidades.csv).
> Na Fase 1 o CSV vira `packages/data/unidades.json`, a fonte única usada pelo jogo.
> Todos os valores abaixo são **iniciais** e serão ajustados com a simulação headless.

## 1. Regras gerais

- Moeda: `$`, valores inteiros.
- Caixa inicial (carreira): **$ 3.000.000** (era $2 milhões até a Fase 9).
- Trimestre = 4 dias de jogo (3 úteis + 1 fim de semana).
- **Fechamento do trimestre** (00:00 do 1º dia): cobra manutenção, credita
  aluguéis, gera relatório e autosave.
- Diárias, receita por cliente e estacionamento entram **na hora** em que
  acontecem.
- Venda de apartamento entra quando o comprador se muda.

## 2. Fórmulas

### Receita por unidade
```
aluguel_tri   = receita_valor × mult_preço × (ocupada ? 1 : 0)
diaria        = receita_valor × mult_preço × noites_ocupadas
por_cliente   = receita_valor × mult_preço × clientes_atendidos
venda         = receita_valor × mult_preço            (uma vez)
por_vaga_dia  = receita_valor × vagas_usadas_no_dia
```

### Níveis de preço
| Nível | Multiplicador | Efeito na satisfação |
|---|---|---|
| Baixo | 0,8 | +10 |
| Normal | 1,0 | 0 |
| Alto | 1,25 | −10 |
| Premium | 1,6 | −20 |

O efeito é somado à satisfação da unidade (GDD §7.1), então preços altos só
se sustentam em unidades bem servidas.

### Manutenção
```
manutencao_tri = Σ unidades.manutencao_tri + Σ carros × custo_carro_tri
```
Custo por carro: padrão $2.000, expresso $4.000, serviço $1.500.

### Demolição
- Estrutura (piso, lobby, escavação): reembolso 0%.
- Unidade vazia: reembolso 25% do custo.
- Unidade ocupada: não pode ser demolida sem antes despejar o ocupante
  (−5 de satisfação em todo o andar por 1 trimestre).

## 3. Retorno esperado (preço normal)

Em trimestres até pagar o custo de construção, numa ocupação "saudável":

| Unidade | Custo | Receita/tri estimada | Retorno (tri) | Papel no design |
|---|---|---|---|---|
| Escritório | 40.000 | 10.000 | 4 | renda estável, cria pico de tráfego |
| Apartamento | 80.000 | 150.000 (única) | imediato | caixa rápido no começo, sem renda recorrente |
| Quarto simples | 20.000 | ~7.000 (70% ocupação) | ~3 | bom, mas exige limpeza e gera risco de pragas |
| Suíte | 100.000 | ~24.000 (60%) | ~4 | caro; puxa o VIP |
| Lanchonete | 100.000 | ~24.000 (150 clientes/dia) | ~4 | resolve o almoço; dá bônus de serviço |
| Restaurante | 200.000 | ~40.000 | ~5 | almoço e jantar; atrai visitantes |
| Loja | 100.000 | 18.000 | ~5,5 | atrai visitantes |
| Cinema | 500.000 | ~58.000 − 10.000 | ~10 | âncora de lazer; vale pelos visitantes |
| Salão de eventos | 800.000 | ~150.000 − 15.000 | ~6 | picos enormes à noite: teste de transporte |
| Estacionamento (10) | 60.000 | ~6.000 − 2.000 | ~15 | vale como porta de entrada, não pela renda |

**Intenção:** nenhuma unidade sozinha "quebra" o jogo. Apartamentos dão caixa
cedo, mas não renda recorrente. Escritórios dão renda, mas sobrecarregam os
elevadores no pico. Hotel rende bem, mas exige serviço.

## 4. Curva de progressão alvo

Ritmo-alvo para um jogador mediano no modo carreira:

| Marco | Tempo de jogo | Tempo real (1×–2×) |
|---|---|---|
| ★2 (250 pop.) | ~3 trimestres | 25–45 min |
| ★3 (1.200) | ~ano 2 | 1,5–2,5 h |
| ★4 (4.000) | ~ano 4 | 4–6 h |
| ★5 (8.000) | ~ano 6 | 7–10 h |
| Lendária (12.000) | ~ano 8 | 10–14 h |

### Sanidade do começo do jogo
Um começo "típico" com $2.000.000:

| Item | Qtde | Custo |
|---|---|---|
| Lobby 60 colunas | 60 | 180.000 |
| Pisos andares 2–6 (60 col) | 300 | 150.000 |
| Elevador padrão + 2 carros | 1 | 250.000 |
| Escritórios (6 por andar × 5) | 30 | 1.200.000 |
| Lanchonete | 1 | 100.000 |
| **Total** | | **1.880.000** |

Resultado: 180 de população, cerca de $300.000/tri em aluguel, cerca de
$12.000/tri de manutenção. O jogador recupera o caixa em ~6 trimestres, ou
acelera vendendo alguns apartamentos. **★2 deve vir no 1º ano**, como
planejado.

## 4.1 Resultado da simulação (Fase 3)

`npm run sim` roda dois anos de carreira com $2.000.000:

| Layout | Resultado |
|---|---|
| Começo típico (lobby, 5 andares, 33 escritórios, lanchonete, 1 elevador com 2 carros) | caixa vai de $240 mil após construir para **$2,37 milhões** em 8 trimestres; ~$270 mil/tri de aluguel; nenhum inquilino sai |
| Escritórios sem acesso + elevadores inúteis com 8 carros | caixa negativo no 1º trimestre, **falência no 2º** |

Lanchonete fatura ~$11 mil/tri nesse prédio, abaixo da estimativa de ~$24 mil
da §3: só 33 escritórios e um elevador limitam o movimento. Revisar na Fase 9.

## 4.2 Partida completa (Fase 4)

`LONGO=1 npm run sim:partida`: um construtor automático joga a carreira com
as metas reais de população e **dinheiro ilimitado** (isola a progressão).

| Nível | Dia de jogo | População |
|---|---|---|
| 2★ | 2 | 1.194 |
| 3★ | 3 | 1.854 |
| 4★ | 4 (fim de semana) | 4.680 |
| 5★ (inspeção aprovada, estresse 0) | 7 | 9.242 |
| Lendária (150/150 convidados) | 9 | 13.464 |

Com dinheiro ilimitado tudo acontece em ~9 dias; na carreira real o caixa é o
freio. Pontos para a Fase 9: a inspeção às 10h é fácil demais (o prédio está
calmo) e a simulação com ~12 mil pessoas roda perto de 45 minutos de jogo por
segundo, no limite da velocidade 8× (alvo da Fase 8).

## 4.3 Carreira com dinheiro real (Fase 9)

`LONGO=1 npm run sim:bot`: um jogador automático começa com o caixa da
carreira, só constrói quando sobra dinheiro além de uma reserva de $250 mil,
põe carros onde a espera passa de 15 min e constrói os requisitos de cada
estrela assim que liberados.

| Nível | Meta (§4) | Com $2 milhões | **Com $3 milhões (atual)** |
|---|---|---|---|
| 2★ | ~3 trimestres | ano 2 (dia 22) | **dia 9** |
| 3★ | ~ano 2 | ano 5 | **ano 3 (dia 45)** |
| 4★ | ~ano 4 | ano 6 | **ano 6 (dia 85)** |
| 5★ | ~ano 6 | ano 7 | **ano 7 (dia 106)**, 1 inspeção reprovada antes |
| Lendária | ~ano 8 | — | **ano 8 (dia 118)** |

Ajustes feitos com base nesses números: caixa inicial de $2 para $3 milhões;
meta da 3★ de 1.200 para 1.000 pessoas; inspetor às 08h30 com paciência de
10 min (antes passava sempre com estresse 0); mais visitantes na lanchonete.
O meio do jogo (3★–4★) ainda é o trecho mais lento; é o principal ponto a
observar no beta (`docs/beta.md`). No fim, o caixa passa de dezenas de milhões
sem ter onde gastar: novas unidades/objetivos de fim de jogo ficam para depois
da 1.0.

## 5. Balanceamento: como vamos ajustar

1. Todo número fica em `packages/data/*.json`, sem constantes mágicas no código.
2. O **simulador headless** (`tools/sim-headless`) roda N anos com um
   "bot construtor" scriptado e exporta CSV de caixa, população, estresse
   médio e espera média por poço.
3. Os critérios de alerta são estes:
   - caixa nunca negativo no roteiro "típico";
   - nenhuma unidade de renda recorrente com retorno < 2 trimestres
     (a venda única de apartamento é a exceção intencional);
   - espera média no pico da manhã entre 1 e 4 min num prédio "bem montado".
4. Cada ajuste de valores vai num commit próprio, com o antes e depois do
   CSV de simulação.
