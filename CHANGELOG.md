# Changelog

## Não lançado

### Jogo
- Quatro lobbies no térreo: básico, corporativo (★2), átrio (★3) e grand
  lobby (★4). O corporativo deixa as portas mais rápidas e melhora os
  escritórios; o átrio ocupa dois andares, melhora a satisfação de todo o
  prédio e tem mezanino para comida e lojas; o grand lobby traz turistas,
  rende mais nos hotéis e passa a ser exigido para construir a Coroa.
- As portas da rua têm vazão: com o lobby lotado, quem chega espera na
  calçada.
- Desfazer uma construção sobre piso ou lobby devolve o que havia antes, em
  vez de deixar o terreno vazio.

### Visual
- Iluminação dinâmica sobre a pixel art: cones de luz das luminárias,
  brilho de telas, velas e cabines de elevador, sombra suave nos cantos
  das salas e sob as pessoas, noite mais escura e tom dourado no nascer e
  no pôr do sol. Salas vagas, sujas ou com pragas ficam apagadas.
- Centro médico mais detalhado: recepção com balcão, computador, relógio e
  cadeiras de espera; leitos hospitalares com cortina, soro e monitor
  cardíaco (que brilha à noite); farmácia com armário de frascos e pia.

## 1.0.0-beta.1

Primeira versão jogável completa, pronta para beta fechado.

### Jogo
- Construção em corte lateral de até 100 andares e 10 subsolos, com arrastar
  para construir, prévia de custo e motivo, demolição e desfazer (Ctrl+Z).
- Pessoas com agenda (funcionários, moradores, hóspedes, visitantes) e estresse;
  elevadores padrão, expresso e de serviço com despacho coletivo; escadas e
  escadas rolantes; sky lobbies; rotas com baldeação.
- Inquilinos, aluguel, vendas, hotel com limpeza, comida, lojas, preço por
  unidade, satisfação com motivos; falência na carreira.
- Progressão de 1★ a Lendária: inspetor no pico da manhã e inauguração da Coroa.
- Eventos: incêndio, pane de elevador, pragas, hóspede VIP, achado no subsolo e
  festival de ano novo.
- Modos: carreira, sandbox e três cenários.
- Salvar/carregar (3 espaços + automático), exportar/importar `.gametower`.
- Camadas de diagnóstico, relatórios dia a dia, ficha da pessoa, tutorial.
- Pixel art e trilha/efeitos gerados por código; dia e noite.
- Instalável como aplicativo (PWA) e jogável offline.

### Balanceamento (Fase 9)
- Fechadas brechas de dinheiro infinito: desfazer uma unidade já vendida ou
  alugada, e construir/vender/demolir com reembolso.
- Inquilino com preço alto exige satisfação maior para ficar
  (baixo 15, normal 25, alto 40, premium 55).
- Inspeção da 5ª estrela passou para as 08h30, no pico da manhã.
- Mais visitantes na lanchonete no almoço.

### Desempenho
- 12 mil pessoas a 8× sem perder ritmo; 1 ano de jogo simulado em ~15 s.
