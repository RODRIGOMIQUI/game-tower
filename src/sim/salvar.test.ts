import { describe, expect, it } from 'vitest';
import { Jogo, VERSAO_SAVE } from './jogo';
import { avancarAte, construir } from './teste-util';

function torre() {
  const j = new Jogo({ seed: 21, dinheiro: 1e9, estrela: 3 });
  construir(j, 'piso', 0, 0, 59, 9);
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'elevador_padrao', 28, 0, 28, 9);
  j.comando({ tipo: 'carros', uid: j.mundo.unidadeEm(28, 0)!.uid, delta: 1 });
  construir(j, 'lanchonete', 0, 1);
  construir(j, 'hotel_simples', 32, 1, 59, 1);
  construir(j, 'limpeza', 32, 2);
  for (let y = 3; y <= 9; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 59, y1: y });
  j.ocuparTodas();
  return j;
}

/** Fotografia comparável do estado do jogo. */
function estado(j: Jogo) {
  return {
    tick: j.tick,
    dinheiro: j.dinheiro,
    rng: j.rng.estado,
    estrela: j.estrela,
    livro: j.livro,
    pessoas: [...j.populacao.pessoas.values()].map((p) => [p.id, p.estado, p.x, p.y, p.estresse, p.local]),
    carros: [...j.transito.pocos.values()].flatMap((p) => p.carros.map((c) => [c.pos, c.dir, c.passageiros.length])),
    unidades: [...j.inquilinos.estados.values()].map((e) => [e.uid, e.situacao, Math.round(e.satisfacao * 1000)]),
  };
}

describe('salvar e carregar', () => {
  it('um jogo carregado continua idêntico ao original', () => {
    const a = torre();
    avancarAte(a, 8);
    a.avancar(37); // pico da manhã: gente em filas e dentro de carros
    const save = JSON.parse(JSON.stringify(a.salvar()));
    expect(save.versao).toBe(VERSAO_SAVE);
    const b = Jogo.carregar(save);
    expect(estado(b)).toEqual(estado(a));
    a.avancar(1440 + 300);
    b.avancar(1440 + 300);
    expect(estado(b)).toEqual(estado(a));
  });

  it('o save cabe com folga e recusa versões desconhecidas', () => {
    const a = torre();
    avancarAte(a, 10);
    const texto = JSON.stringify(a.salvar());
    expect(texto.length).toBeLessThan(2_000_000);
    expect(() => Jogo.carregar({ ...JSON.parse(texto), versao: 999 })).toThrow(/versão/);
  });
});

describe('desfazer', () => {
  it('desfaz construções em ordem e devolve o dinheiro', () => {
    const j = new Jogo({ seed: 1 });
    const inicio = j.dinheiro;
    construir(j, 'piso', 0, 0, 19, 2);
    construir(j, 'escritorio', 0, 1);
    expect(j.comando({ tipo: 'desfazer' })).toMatchObject({ ok: true, custo: -40_000 });
    expect(j.mundo.unidadeEm(0, 1)).toBeUndefined();
    expect(j.comando({ tipo: 'desfazer' })).toMatchObject({ ok: true });
    expect(j.mundo.est(0, 0)).toBe(0);
    expect(j.dinheiro).toBe(inicio);
    expect(j.comando({ tipo: 'desfazer' })).toMatchObject({ ok: false, motivo: 'Nada para desfazer' });
  });

  it('desfazer demolição reconstrói (vago) e cobra o reembolso de volta', () => {
    const j = new Jogo({ seed: 1 });
    construir(j, 'piso', 0, 0, 19, 2);
    construir(j, 'escritorio', 0, 1);
    const antes = j.dinheiro;
    j.comando({ tipo: 'demolir', x0: 0, y0: 1, x1: 0, y1: 1 });
    expect(j.dinheiro).toBe(antes + 10_000);
    expect(j.comando({ tipo: 'desfazer' }).ok).toBe(true);
    expect(j.dinheiro).toBe(antes);
    expect(j.mundo.unidadeEm(0, 1)?.tipo).toBe('escritorio');
    expect(j.inquilinos.get(j.mundo.unidadeEm(0, 1)!.uid)!.situacao).toBe('vaga');
  });

  it('desfazer em sequência funciona mesmo após reconstruir uma unidade demolida', () => {
    const j = new Jogo({ seed: 1 });
    construir(j, 'piso', 0, 0, 19, 0);
    construir(j, 'piso', 0, 1, 19, 1);
    construir(j, 'escritorio', 0, 1);
    j.comando({ tipo: 'demolir', x0: 0, y0: 1, x1: 0, y1: 1 }); // tira o escritório
    j.comando({ tipo: 'desfazer' }); // volta o escritório
    j.comando({ tipo: 'desfazer' }); // tira o escritório (construção)
    expect(j.mundo.unidadeEm(0, 1)).toBeUndefined();
    expect(j.comando({ tipo: 'desfazer' }).ok).toBe(true); // piso do andar 2
    expect(j.comando({ tipo: 'desfazer' }).ok).toBe(true); // piso do térreo
    expect(j.mundo.unidades.size).toBe(0);
  });
});

describe('histórico e cenários', () => {
  it('registra um ponto por dia com caixa, receitas e população', () => {
    const j = torre();
    j.avancar(3 * 1440);
    expect(j.historico).toHaveLength(3);
    const d = j.historico[1]!;
    expect(d.populacao).toBeGreaterThan(0);
    expect(d.receitas).toBeGreaterThan(0);
    // caixa de hoje = caixa de ontem + receitas − despesas
    expect(j.historico[2]!.caixa).toBe(d.caixa + j.historico[2]!.receitas - j.historico[2]!.despesas);
  });

  it('lote estreito recusa construção fora das colunas permitidas', () => {
    const j = new Jogo({ cenario: 'lote_estreito', seed: 1 });
    expect(j.dinheiro).toBe(3_000_000);
    expect(j.comando({ tipo: 'construir', item: 'piso', x0: 100, y0: 0, x1: 100, y1: 0 }).motivo).toBe('Fora do lote');
    expect(j.comando({ tipo: 'construir', item: 'piso', x0: 140, y0: 0, x1: 219, y1: 0 }).feitos).toBe(60);
  });

  it('quatro poços: o quinto é recusado', () => {
    const j = new Jogo({ cenario: 'quatro_pocos', seed: 1 });
    construir(j, 'piso', 0, 0, 59, 3);
    for (const x of [0, 10, 20, 30]) construir(j, 'elevador_padrao', x, 0, x, 3);
    expect(j.comando({ tipo: 'construir', item: 'elevador_padrao', x0: 40, y0: 0, x1: 40, y1: 3 }).motivo).toBe(
      'Limite de poços do cenário',
    );
  });

  it('avalia o objetivo e vira evento quando cumprido (e sobrevive ao save)', () => {
    const j = new Jogo({ cenario: 'lote_estreito', seed: 1, dinheiro: 1e9 });
    construir(j, 'piso', 150, 0, 209, 5);
    construir(j, 'lobby', 150, 0, 209, 0);
    construir(j, 'elevador_padrao', 176, 0, 176, 5);
    for (let y = 1; y <= 5; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 150, y0: y, x1: 175, y1: y });
    j.ocuparTodas();
    expect(j.avaliarCenario()).toEqual({ ok: false, progresso: '60 / 1.500 pessoas' });
    // Força o objetivo para testar o disparo do evento às 23h.
    j.avaliarCenario = () => ({ ok: true, progresso: '' });
    const ev = avancarAte(j, 23);
    expect(ev.find((e) => e.tipo === 'cenario')).toMatchObject({ nome: 'Lote estreito' });
    expect(avancarAte(j, 23).some((e) => e.tipo === 'cenario')).toBe(false); // só uma vez
    const b = Jogo.carregar(JSON.parse(JSON.stringify(j.salvar())));
    expect(b.cenario?.id).toBe('lote_estreito');
    expect(b.cenarioConcluido).toBe(true);
  });
});
