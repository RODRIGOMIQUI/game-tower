import { describe, expect, it } from 'vitest';
import { planejarConstrucao } from './construcao';
import { Jogo, type EventoJogo } from './jogo';
import { Estado } from './pessoas';
import { avancarAte, construir } from './teste-util';

/** Carreira com dinheiro de sobra (as travas de estrela continuam valendo). */
function carreira(estrela = 1, escalaPopulacao = 1) {
  return new Jogo({ seed: 5, dinheiro: 1e10, estrela, escalaPopulacao });
}

/** Torre de 10 andares com elevador, lanchonete e escritórios ocupados. */
function torre(j: Jogo, escritorios = true) {
  construir(j, 'piso', 0, 0, 59, 9);
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'elevador_padrao', 28, 0, 28, 9);
  j.comando({ tipo: 'carros', uid: j.mundo.unidadeEm(28, 0)!.uid, delta: 1 });
  construir(j, 'lanchonete', 0, 1);
  if (escritorios) {
    for (let y = 2; y <= 9; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 26, y1: y });
  }
  j.ocuparTodas();
  return j;
}

const tipos = (ev: EventoJogo[]) => ev.map((e) => e.tipo);

describe('sky lobby e expresso', () => {
  it('sky lobby só a partir do 15º andar', () => {
    const j = carreira(3);
    construir(j, 'piso', 0, 0, 30, 20);
    expect(planejarConstrucao(j.mundo, 'sky_lobby', 0, 10, 10, 10, j.contexto()).motivo).toBe('Sky lobby só a partir do 15º andar');
    construir(j, 'sky_lobby', 0, 14, 30, 14);
  });

  it('sky lobby construído depois do expresso vira parada', () => {
    const j = carreira(3);
    construir(j, 'piso', 0, 0, 59, 29);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'elevador_expresso', 10, 0, 10, 20);
    const poco = j.transito.pocos.get(j.mundo.unidadeEm(10, 0)!.uid)!;
    expect(poco.paraEm(14)).toBe(false);
    construir(j, 'sky_lobby', 0, 14, 59, 14);
    expect(poco.paraEm(14)).toBe(true);
  });

  it('expresso leva ao sky lobby e o padrão segue dali', () => {
    const j = carreira(3);
    construir(j, 'piso', 0, 0, 59, 29);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'sky_lobby', 0, 14, 59, 14);
    construir(j, 'elevador_expresso', 10, 0, 10, 14);
    construir(j, 'elevador_padrao', 40, 14, 40, 29);
    const r = j.roteador.rota(1, 0, 50, 25)!;
    expect(r.filter((p) => p.tipo === 'elevador').map((p) => p.tipo === 'elevador' && [p.de, p.para])).toEqual([
      [0, 14],
      [14, 25],
    ]);
  });
});

describe('estrelas', () => {
  it('2ª estrela com 250 de população, à meia-noite, liberando o hotel', () => {
    const j = carreira();
    torre(j);
    construir(j, 'escritorio', 32, 2, 59, 9); // 8 andares × 3 = 24 escritórios a mais
    j.ocuparTodas();
    expect(j.populacaoTotal()).toBeGreaterThanOrEqual(250);
    const ev = j.avancar(1440);
    const e = ev.find((e) => e.tipo === 'estrela');
    expect(e).toMatchObject({ nivel: 2 });
    expect(e && 'desbloqueios' in e && e.desbloqueios).toContain('Quarto simples');
    expect(j.estrela).toBe(2);
  });

  it('3ª estrela exige segurança', () => {
    const j = carreira(2, 0.05); // meta de população: 60
    torre(j);
    j.avancar(1440);
    expect(j.estrela).toBe(2);
    expect(j.progresso().requisitos.find((r) => r.texto === 'Segurança')?.ok).toBe(false);
    construir(j, 'seguranca', 32, 1);
    j.avancar(1440);
    expect(j.estrela).toBe(3);
  });

  it('4ª estrela exige centro médico, suíte e satisfação média', () => {
    const j = carreira(3, 0.02);
    torre(j);
    construir(j, 'centro_medico', 32, 1);
    j.avancar(1440);
    expect(j.estrela).toBe(3);
    construir(j, 'hotel_suite', 32, 2);
    j.avancar(1440);
    expect(j.estrela).toBe(4);
  });
});

describe('inspeção (5ª estrela)', () => {
  function pronta() {
    const j = carreira(4, 0.01);
    torre(j);
    construir(j, 'escavacao', 0, -1, 59, -3);
    construir(j, 'metro', 30, -3);
    return j;
  }

  it('o inspetor percorre a torre e aprova', () => {
    const j = pronta();
    const ev = [...j.avancar(1440 - (j.tick % 1440))]; // meia-noite: agenda
    expect(tipos(ev)).toContain('inspecao_agendada');
    avancarAte(j, 10);
    const inspetor = [...j.populacao.pessoas.values()].find((p) => p.tipo === 'inspetor');
    expect(inspetor).toBeDefined();
    ev.push(...j.avancar(8 * 60));
    expect(ev.find((e) => e.tipo === 'inspecao')).toMatchObject({ aprovada: true });
    expect(j.estrela).toBe(5);
  });

  it('reprova se o inspetor não consegue chegar, e tenta de novo um trimestre depois', () => {
    const j = pronta();
    j.avancar(1440 - (j.tick % 1440));
    avancarAte(j, 10);
    j.avancar(1);
    // Sem elevador, ele não sai do térreo.
    j.comando({ tipo: 'demolir', x0: 28, y0: 5, x1: 28, y1: 5 });
    const ev = j.avancar(8 * 60);
    expect(ev.find((e) => e.tipo === 'inspecao')).toMatchObject({ aprovada: false });
    expect(j.estrela).toBe(4);
    construir(j, 'elevador_padrao', 28, 0, 28, 9);
    const depois = j.avancar(5 * 1440);
    expect(tipos(depois)).toContain('inspecao_agendada');
  });
});

describe('Lendária', () => {
  it('Coroa no topo + inauguração bem-sucedida', () => {
    const j = carreira(5, 0.0001);
    construir(j, 'piso', 0, 0, 59, 99);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'sky_lobby', 40, 97, 59, 97);
    construir(j, 'elevador_expresso', 50, 0, 50, 97);
    for (let i = 0; i < 5; i++) j.comando({ tipo: 'carros', uid: j.mundo.unidadeEm(50, 0)!.uid, delta: 1 });
    construir(j, 'coroa', 0, 97);
    construir(j, 'escritorio', 0, 1);
    j.ocuparTodas();
    const ev = j.avancar(1440 - (j.tick % 1440));
    expect(tipos(ev)).toContain('inauguracao_agendada');
    ev.push(...avancarAte(j, 23));
    expect(ev.find((e) => e.tipo === 'inauguracao')).toMatchObject({ sucesso: true });
    expect(j.estrela).toBe(6);
  });
});

describe('entradas e serviços', () => {
  it('estacionamento com rampa: parte dos funcionários vem de carro e paga a vaga', () => {
    const j = carreira();
    construir(j, 'escavacao', 0, -1, 59, -1);
    torre(j, false);
    // Estacionamento é ★3: libera direto no estado.
    j.progressao.estrela = 3;
    construir(j, 'rampa_estacionamento', 0, -1);
    construir(j, 'estacionamento', 15, -1);
    construir(j, 'elevador_padrao', 50, -1, 50, 9);
    for (let y = 2; y <= 9; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 26, y1: y });
    j.ocuparTodas();
    avancarAte(j, 10);
    const deCarro = [...j.populacao.pessoas.values()].filter((p) => p.vaga).length;
    expect(deCarro).toBe(10); // 10 vagas, todas tomadas
    j.avancar(1440 - (j.tick % 1440));
    expect(j.livro.receitas.estacionamento).toBe(10 * 150);
  });

  it('metrô sozinho já dá acesso à torre', () => {
    const j = carreira(5);
    construir(j, 'piso', 0, 0, 59, 5);
    construir(j, 'escavacao', 0, -1, 59, -3);
    construir(j, 'metro', 0, -3);
    construir(j, 'elevador_padrao', 40, -1, 40, 5);
    construir(j, 'escritorio', 0, 3);
    expect(j.semAcesso).toEqual([]);
    j.ocuparTodas();
    avancarAte(j, 11);
    expect([...j.populacao.pessoas.values()].filter((p) => p.estado === Estado.NaUnidade).length).toBe(6);
  });

  it('elevador de serviço leva a limpeza a quartos que os hóspedes alcançam por outro caminho', () => {
    const j = carreira(3);
    construir(j, 'piso', 0, 0, 59, 9);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'elevador_padrao', 28, 0, 28, 5);
    construir(j, 'hotel_simples', 0, 5);
    construir(j, 'limpeza', 0, 8);
    const quarto = j.inquilinos.get(j.mundo.unidadeEm(0, 5)!.uid)!;
    expect(quarto.limpavel).toBe(false);
    construir(j, 'elevador_servico', 50, 5, 50, 8);
    expect(quarto.limpavel).toBe(true);
  });

  it('acima de 3.000 pessoas, sem reciclagem a satisfação cai', () => {
    const j = carreira();
    torre(j);
    const e = [...j.inquilinos.estados.values()].find((e) => e.tipo === 'escritorio')!;
    j.inquilinos.fimDoDia(j.populacao, true, 0);
    expect(e.componentes.sujeira).toBe(15);
    j.inquilinos.fimDoDia(j.populacao, false, 0);
    expect(e.componentes.sujeira).toBe(0);
  });
});
