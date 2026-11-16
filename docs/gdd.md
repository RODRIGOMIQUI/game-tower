# GameTower — Game Design Document (v0.1)

> Status: rascunho da Fase 0. Valores numéricos são iniciais e vivem em
> [economia.md](economia.md) e [dados/unidades.csv](dados/unidades.csv).
> Direção visual e sonora em [direcao-de-arte.md](direcao-de-arte.md).

---

## 1. Resumo

**GameTower** é um simulador de construção e gestão de um arranha-céu visto em
**corte lateral**. O jogador é o incorporador: constrói andares, atrai
inquilinos e — principalmente — resolve o **fluxo de pessoas**. O gargalo
do jogo é o **transporte vertical**: elevadores, escadas e baldeações.

- **Gênero:** simulação / construção / gestão
- **Plataforma:** navegador (PC) primeiro; desktop (Tauri) depois
- **Stack:** TypeScript + PixiJS + Vite, simulação em Web Worker
- **Público:** fãs de city builders e jogos de otimização (Factorio-lite,
  Mini Metro, Project Highrise), sessões de 20 min a várias horas
- **Pilares:**
  1. **Um prédio vivo** — cada pessoa tem nome, agenda e humor visíveis.
  2. **O problema é o movimento** — dinheiro importa, mas o desafio real é
     levar milhares de pessoas aonde querem, na hora em que querem.
  3. **Diagnóstico claro** — o jogo sempre mostra *por que* algo vai mal
     (overlays, gráficos, fichas de pessoas).
  4. **Ritmo diário** — picos da manhã, almoço e fim de tarde criam ondas.

---

## 2. Loop de jogo

```
 construir ──► inquilinos chegam ──► pessoas circulam ──► receita / estresse
     ▲                                                          │
     └──────── diagnosticar (overlays) ◄── satisfação muda ◄────┘
```

- **Micro (segundos):** ver filas, ajustar um elevador, adicionar um carro.
- **Médio (um dia de jogo):** observar picos, redistribuir andares, abrir
  comércio para atender o almoço.
- **Macro (trimestres):** fechar contas, ajustar aluguéis, subir de estrela,
  desbloquear novos tipos de unidade.

---

## 3. Mundo e grade

| Elemento | Valor inicial |
|---|---|
| Andares acima do solo | 100 (térreo = andar 1) |
| Subsolos | 10 (B1–B10) |
| Largura do terreno | 360 colunas |
| Unidade de grade | 1 coluna × 1 andar |
| Altura de um andar | 1 célula (algumas unidades ocupam 2–3) |

**Regras de construção**
- Toda unidade precisa de **piso** sob si e de **estrutura** no andar abaixo
  (não há balanço: um andar não pode ser mais largo que o de baixo, exceto
  no térreo/subsolo, que seguem o limite do terreno).
- O **lobby** só pode ser construído no térreo e em **sky lobbies**
  (qualquer andar ≥ 15, ★3).
- Subsolo exige escavação (custo extra por célula).
- Unidades não se sobrepõem; poços de elevador/escada atravessam andares
  e reservam a coluna em todos eles.
- Demolir devolve 0% do custo (estrutura) e 25% (unidades vazias).

---

## 4. Tempo

| Elemento | Valor |
|---|---|
| Tick de simulação | 1 minuto de jogo |
| Dia de jogo | 1440 ticks ≈ 4 min reais em 1× |
| Velocidades | pausa, 1×, 2×, 4×, 8× (8× só sem eventos ativos) |
| Trimestre | 4 dias: 3 úteis + 1 fim de semana |
| Ano | 4 trimestres (primavera, verão, outono, inverno) |

Dia/noite e estação mudam o fundo, a iluminação e alguns comportamentos
(ex.: fim de semana não tem expediente nos escritórios; comércio lota).

---

## 5. Pessoas (agentes)

### 5.1 Categorias
| Tipo | Origem | Agenda típica (dia útil) |
|---|---|---|
| Funcionário de escritório | entra pelo lobby/metrô/estacionamento | 07:00–09:45 chega · 11:30–13:00 almoça (30 min) · 16:30–19:00 sai |
| Morador | mora no apartamento | 07:00–08:30 sai · 17:30–20:00 volta · fim de semana almoça na torre |
| Hóspede de hotel | chega à tarde | 15–19h check-in · noite sai para comer · 09–11h check-out |
| Visitante | de fora | vem por comércio, cinema, eventos |
| Equipe | limpeza, segurança, médicos | turnos fixos; usam elevador de serviço |

### 5.2 Comportamento
- Cada agente tem uma **lista de compromissos** (destino + janela de horário).
- Ao sair, pede uma **rota** ao sistema de trânsito (ver §6).
- Caminhada horizontal: **2 colunas por minuto de jogo**; distância conta como
  tempo de deslocamento.
- Entrada e saída do prédio: pelas pontas de cada trecho do térreo que tenha
  lobby. Sem lobby, não há entrada.
- **Disposição para escadas:** até 2 andares a pé; escada rolante até 6
  andares encadeados; acima disso só elevador.

### 5.3 Estresse
- Valor 0–100. Sobe com: espera por elevador, elevador lotado, trajeto longo,
  ruído, sujeira, falta de serviço (sem lugar para almoçar).
- Desce com: chegar rápido, comer, lazer, dormir em casa/quarto limpo.
- Cor do sprite: **neutro** (< 40) · **irritado** (40–69) · **furioso** (≥ 70).
- Paciência de espera por elevador (minutos de jogo): **30** funcionário,
  **45** morador (hóspedes e visitantes nas próximas fases). Passou disso, o
  estresse sobe 1,5 por minuto e, a partir do dobro, a pessoa **desiste** e vai
  embora do prédio (perde o expediente ou a noite em casa).
- Estresse cai 5 ao chegar ao destino, 10 ao almoçar e pela metade à meia-noite.
- *Escala de tempo:* um dia dura ~4 min reais, então elevador e caminhada são
  "lentos" em minutos de jogo para que o movimento fique visível. Por isso as
  paciências são de dezenas de minutos, não de poucos minutos.

### 5.4 Ficha da pessoa
Clicar em alguém mostra: nome, tipo, unidade de vínculo, destino atual,
rota, estresse e histórico curto ("esperou 6 min no poço B às 08:42").
Botão **Seguir** prende a câmera nela.

---

## 6. Transporte vertical

### 6.1 Elementos
| Elemento | Alcance | Capacidade | Observação |
|---|---|---|---|
| Escada | 1 andar (encadeável) | ilimitada, lenta | barata; só trajetos curtos |
| Escada rolante | 1 andar (encadeável) | alta, contínua | ★3; ótima entre lobby e comércio |
| Elevador padrão | até 30 andares contíguos | 15 pessoas/carro, até 8 carros | 3 andares/min, 1 min de portas por parada |
| Elevador expresso | até 100 andares | 25 pessoas/carro, até 8 carros | ★3; só para em lobbies e subsolos |
| Elevador de serviço | até 30 andares | 10 pessoas/carro | ★2; só equipe e carga |

### 6.2 Roteamento
- O prédio vira um **grafo de trânsito**: nós = (andar, poço/escada),
  arestas = viagens possíveis + caminhada horizontal no andar.
- Custo da aresta = tempo estimado. A espera de um poço é o maior entre a
  média recente e o tempo para escoar a fila atual, então as pessoas se
  distribuem entre poços quando um lota.
- Rotas ficam em cache por (origem, destino), invalidadas a cada construção
  ou demolição e recalculadas a cada 15 minutos de jogo.
- Escadas: escada comum custa 3 de "esforço" por andar e a rolante 1; o
  limite por rota é 6 (até 2 andares a pé, ou 6 de escada rolante).
- Limite de **3 baldeações**. Sem rota → a unidade é marcada
  **"sem acesso"** (alerta vermelho no mapa).

### 6.3 Configuração de poço
- Andares atendidos (liga/desliga por andar).
- **Modo de despacho:**
  - *Coletivo* (padrão): atende chamadas na direção atual (algoritmo LOOK).
  - *Pico da manhã:* carros vazios voltam ao lobby das 07h às 10h.
  - *Zonas:* cada carro atende uma faixa de andares.
  - *Destino (★4, upgrade):* pessoas escolhem o andar no lobby; o sistema
    agrupa quem vai para andares próximos. Grande ganho em prédios altos.
- Andar de estacionamento do carro quando ocioso.

---

## 7. Unidades

Lista completa com custos em [dados/unidades.csv](dados/unidades.csv).

| Categoria | Unidades | Papel |
|---|---|---|
| Estrutura | piso, lobby, sky lobby, escavação | base para tudo |
| Trabalho | escritório | aluguel trimestral estável; cria pico de manhã/tarde |
| Moradia | apartamento | venda única alta; moradores exigentes com ruído |
| Hotel | quarto simples, duplo, suíte | diária; precisa de limpeza |
| Comida | lanchonete, restaurante | receita por cliente; resolve o almoço |
| Comércio | loja | aluguel; atrai visitantes |
| Lazer | cinema (2 andares), salão de eventos (2 andares) | receita por sessão/evento; picos à noite e no fim de semana |
| Serviços | limpeza, segurança, centro médico, reciclagem | exigidos para subir de estrela e para eventos |
| Acesso | estacionamento, metrô | novas portas de entrada além do lobby |
| Marco | **Coroa da Torre** (observatório nos andares 98–100) | condição final do jogo |

### 7.0 Ocupação

Toda unidade nasce **vaga**. Interessados aparecem por hora (8h–20h) se a
unidade tiver acesso pela rua; a chance cresce com preço baixo e boa
satisfação esperada (ruído, onde comer, preço).

| Unidade | Como ocupa | Receita |
|---|---|---|
| Escritório, loja | inquilino aluga | aluguel no fechamento do trimestre |
| Apartamento | comprador se muda | venda única (revenda vale 70% se o morador sair) |
| Hotel | reserva às 14h; hóspedes chegam 15–19h, jantam, saem 9–11h | diária na reserva |
| Lanchonete, restaurante | administrados pela torre | por cliente (funcionários, moradores, hóspedes e visitantes) |

- Quarto fica **sujo** após o check-out e só volta a ser alugado depois da
  limpeza. Cada unidade de Limpeza arruma até 20 quartos por dia (10h–17h).
  Por enquanto a limpeza é abstrata; camareiras andando pelo prédio vêm depois.
- Visitantes de fora vêm comer e comprar: lanchonete 11–14h, restaurante
  11–14h e 18–21h, loja 10–20h (×1,5 no fim de semana).
- Loja com menos de 5 clientes no dia: satisfação −20 (o lojista reclama).

### 7.1 Satisfação da unidade
Cada unidade ocupada tem satisfação 0–100 (média móvel por trimestre):

```
satisfação = 100
           − média_estresse_ocupantes × 0.6
           − ruído_vizinhança         (residencial/hotel ao lado de comércio/escritório)
           − penalidade_sujeira       (hotel sem limpeza, falta de reciclagem)
           + bônus_serviços           (comida/loja a ≤ 1 baldeação)
```

- Atualizada à meia-noite (média móvel diária). O estresse vem dos ocupantes
  (escritório, apartamento) ou dos clientes e hóspedes (hotel, comida, loja).
- **≥ 70:** ótima, aguenta preço mais alto.
- **40–69:** ok.
- **< 40:** em risco, com marcador amarelo.
- **< 25 num fechamento:** aviso (marcador laranja). **2 avisos seguidos:**
  inquilino sai (apartamento volta à venda com 30% de desconto).
- Ruído: +4 por ponto de ruído de vizinho no mesmo andar a até 10 colunas,
  +2 se estiver logo acima ou abaixo; máximo 40.
- Onde comer: +10 se houver lanchonete/restaurante alcançável.

### 7.2 Ruído
Escritórios, comércio, lazer e reciclagem emitem ruído; moradia e hotel
sofrem. Afeta o mesmo andar (até 10 colunas de distância) e o andar
imediatamente acima/abaixo. Overlay de ruído mostra isso em calor.

---

## 8. Progressão (estrelas)

| Nível | População | Requisitos extras | Desbloqueia |
|---|---|---|---|
| ★1 | — | — | piso, lobby, escada, elevador padrão, escritório, apartamento, lanchonete |
| ★2 | 250 | — | hotel simples, limpeza, elevador de serviço, segurança |
| ★3 | 1.200 | segurança construída | duplo, suíte, restaurante, loja, cinema, escada rolante, expresso, sky lobby, estacionamento, reciclagem, centro médico |
| ★4 | 4.000 | centro médico · suíte · satisfação média ≥ 55 | salão de eventos, metrô, despacho por destino |
| ★5 | 8.000 | metrô · **inspeção aprovada** | Coroa da Torre |
| **Lendária** | 12.000 | Coroa no topo (andares 98–100) + evento de inauguração bem-sucedido | fim da campanha; segue em modo livre |

**População** = moradores + funcionários + hóspedes da noite atual.

**Inspeção:** ao cumprir os números, um inspetor visita a torre num dia
sorteado. Ele percorre unidades aleatórias; se o estresse médio dele for
< 50 ao fim da visita, aprova. Reprovado → nova visita em 1 trimestre.

---

## 9. Economia (resumo)

- Dinheiro inicial: **$ 2.000.000**. Sem empréstimos na campanha.
- **Receitas:** aluguel trimestral (escritório, loja), venda de apartamento,
  diárias de hotel, receita por cliente (comida, cinema, eventos),
  estacionamento.
- **Despesas:** construção, manutenção trimestral (elevadores, serviços),
  escavação.
- **Preço ajustável** por unidade em 4 níveis (baixo, normal, alto, premium):
  mais caro = mais receita e menos tolerância de satisfação.
- Saldo negativo → construção bloqueada; 2 trimestres negativos → fim de jogo
  (apenas no modo carreira).

Detalhes, fórmulas e curva de balanceamento em [economia.md](economia.md).

---

## 10. Eventos

| Evento | Quando | Resposta |
|---|---|---|
| **Incêndio** | ★2+, chance por trimestre cresce com a altura | segurança envia brigada; sem segurança, incêndio se espalha e você paga bombeiros externos |
| **Pane de elevador** | aleatório, mais em poços muito usados | carro para por algumas horas; manutenção maior reduz chance |
| **Pragas** | quarto de hotel sujo por > 1 dia | quartos vizinhos ficam indisponíveis até limpeza |
| **Inspeção** | gatilho de estrela | ver §8 |
| **Hóspede VIP** | ★3+, ao ter suíte | se a estadia for boa, bônus de reputação (+satisfação geral temporária) |
| **Achado no subsolo** | ao escavar B5+ | bônus em dinheiro único |
| **Festival de ano novo** | fim do ano 1+ | visitantes extras; fogos no céu |

Eventos podem ser desligados no modo sandbox.

---

## 11. Interface

- **Barra superior:** dinheiro, população, estrela + progresso, data/hora,
  velocidade.
- **Paleta de construção** (esquerda): categorias com ícones; bloqueados
  mostram o requisito.
- **Inspetor** (direita): ficha da unidade/poço/pessoa selecionada.
- **Overlays** (tecla `O`): estresse, tempo de espera por poço, tráfego,
  ruído, satisfação, ocupação, sem acesso.
- **Relatórios** (tecla `R`): gráficos de receita, população, satisfação e
  espera por trimestre.
- **Qualidade de vida:** arrastar para construir em linha, desfazer
  (`Ctrl+Z`) até 50 ações, autosave a cada trimestre, atalhos de teclado,
  tutorial guiado no início da carreira.

---

## 12. Modos de jogo

1. **Carreira:** ★1 até Lendária, com eventos e falência.
2. **Sandbox:** dinheiro infinito opcional, tudo desbloqueado, eventos
   configuráveis.
3. **Cenários:** mapas com objetivo e restrições (pós-MVP):
   - *Lote estreito* — terreno de 60 colunas.
   - *Quatro poços* — no máximo 4 elevadores.
   - *Hotel de luxo* — atingir 300 hóspedes com satisfação ≥ 80.

---

## 13. Escopo

**MVP (fim da Fase 4):** carreira completa ★1–★5 com arte provisória,
todos os tipos de unidade, elevadores padrão/expresso/serviço com
despacho coletivo e pico da manhã, economia, save/load.

**1.0:** + eventos, overlays completos, relatórios, despacho por destino,
sandbox, arte/áudio finais, 12k+ agentes a 60 fps.

**Pós-1.0:** cenários, mods via JSON, conquistas, clima, desastres extras.

**Fora de escopo:** multiplayer, 3D, mobile (reavaliar depois).

---

## 14. Metas técnicas (referência)

- 60 fps com 12.000 agentes e 100 andares em PC médio.
- Simulação determinística (RNG com seed) → saves e replays reproduzíveis.
- Simulação headless roda 1 ano de jogo em < 30 s para balanceamento.

---

## 15. Questões em aberto

- [ ] Estilo final da arte: pixel art (proposta) vs. vetor limpo — ver
      [direcao-de-arte.md](direcao-de-arte.md).
- [ ] Haverá idioma inglês desde o início? (afeta estrutura de i18n)
- [ ] Limite de 100 andares é fixo ou cresce em cenários?
- [ ] Empréstimos no sandbox/cenários?
- [ ] Nome do marco final ("Coroa da Torre") é definitivo?
