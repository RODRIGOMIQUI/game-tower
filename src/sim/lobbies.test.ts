import { describe, expect, it } from 'vitest';
import { Jogo } from './jogo';
import { BONUS_ATRIO, BONUS_CORPORATIVO, VAZAO_PORTA } from './lobbies';
import { Est } from './mundo';
import type { Entrada } from './pessoas';
import { avancarAte, construir, jogoRico } from './teste-util';

function carreira(estrela: number) {
  return new Jogo({ seed: 3, dinheiro: 1e10, estrela });
}

const entradas = (j: Jogo) => (j.populacao as unknown as { amb: { entradas: Entrada[] } }).amb.entradas;
const estado = (j: Jogo, x: number, y: number) => j.inquilinos.get(j.mundo.unidadeEm(x, y)!.uid)!;

describe('construção das variantes', () => {
  it('respeitam a estrela de cada uma', () => {
    const j = carreira(1);
    expect(j.comando({ tipo: 'construir', item: 'lobby_corporativo', x0: 0, y0: 0, x1: 9, y1: 0 }).motivo).toBe('Requer 2★');
    expect(j.comando({ tipo: 'construir', item: 'atrio', x0: 0, y0: 0, x1: 9, y1: 0 }).motivo).toBe('Requer 3★');
    expect(j.comando({ tipo: 'construir', item: 'grand_lobby', x0: 0, y0: 0, x1: 9, y1: 0 }).motivo).toBe('Requer 4★');
  });

  it('corporativo troca o lobby básico e cobra manutenção por coluna', () => {
    const j = carreira(2);
    construir(j, 'lobby', 0, 0, 29, 0);
    const antes = j.manutencaoTrimestral();
    construir(j, 'lobby_corporativo', 0, 0, 29, 0);
    expect(j.mundo.est(0, 0)).toBe(Est.LobbyCorp);
    expect(j.manutencaoTrimestral() - antes).toBe(30 * 300);
    expect(j.comando({ tipo: 'construir', item: 'lobby_corporativo', x0: 0, y0: 1, x1: 5, y1: 1 }).motivo).toBe('Lobby só no térreo');
  });

  it('átrio ocupa térreo e 1º andar; o 2º andar se apoia nele', () => {
    const j = carreira(3);
    const r = j.comando({ tipo: 'construir', item: 'atrio', x0: 0, y0: 0, x1: 19, y1: 0 });
    expect(r.ok).toBe(true);
    expect(r.custo).toBe(20 * 8000);
    expect(j.mundo.est(5, 0)).toBe(Est.Atrio);
    expect(j.mundo.est(5, 1)).toBe(Est.Atrio);
    construir(j, 'piso', 0, 2, 19, 2);
    expect(j.mundo.est(5, 2)).toBe(Est.Piso);
  });

  it('não cobre unidades do 1º andar, exceto comida e lojas no mezanino do átrio', () => {
    const j = carreira(4);
    construir(j, 'piso', 0, 0, 59, 2);
    construir(j, 'escritorio', 0, 1);
    expect(j.comando({ tipo: 'construir', item: 'atrio', x0: 0, y0: 0, x1: 19, y1: 0 }).motivo).toBe('Libere o 1º andar antes');
    construir(j, 'atrio', 20, 0, 59, 0);
    construir(j, 'lanchonete', 20, 1);
    expect(j.comando({ tipo: 'construir', item: 'escritorio', x0: 40, y0: 1, x1: 40, y1: 1 }).motivo).toBe('Não pode ficar no lobby');
    // Grand lobby não tem mezanino.
    expect(j.comando({ tipo: 'construir', item: 'grand_lobby', x0: 20, y0: 0, x1: 39, y1: 0 }).motivo).toBe('Libere o 1º andar antes');
  });

  it('demolir uma metade leva a outra; desfazer devolve o lobby anterior', () => {
    const j = carreira(3);
    construir(j, 'lobby', 0, 0, 19, 0);
    construir(j, 'atrio', 0, 0, 19, 0);
    j.comando({ tipo: 'demolir', x0: 5, y0: 0, x1: 5, y1: 0 });
    expect(j.mundo.est(5, 0)).toBe(Est.Vazio);
    expect(j.mundo.est(5, 1)).toBe(Est.Vazio);
    j.comando({ tipo: 'desfazer' });
    expect(j.mundo.est(5, 1)).toBe(Est.Atrio);
    j.comando({ tipo: 'desfazer' }); // desfaz o átrio: volta o lobby básico
    expect(j.mundo.est(5, 0)).toBe(Est.Lobby);
    expect(j.mundo.est(5, 1)).toBe(Est.Vazio);
  });

  it('lobby simples sobre o átrio devolve piso ao 1º andar', () => {
    const j = carreira(3);
    construir(j, 'atrio', 0, 0, 19, 0);
    construir(j, 'lobby', 0, 0, 19, 0);
    expect(j.mundo.est(3, 0)).toBe(Est.Lobby);
    expect(j.mundo.est(3, 1)).toBe(Est.Piso);
  });

  it('a Coroa exige um grand lobby de 20 colunas', () => {
    const j = carreira(5);
    construir(j, 'piso', 0, 0, 59, 99);
    construir(j, 'grand_lobby', 0, 0, 9, 0);
    expect(j.comando({ tipo: 'construir', item: 'coroa', x0: 0, y0: 97, x1: 0, y1: 97 }).motivo).toMatch(/Grand lobby/);
    construir(j, 'grand_lobby', 10, 0, 29, 0);
    construir(j, 'coroa', 0, 97);
  });
});

describe('efeitos', () => {
  /** Térreo com a variante, escritórios no 3º andar e escada até lá. */
  function predio(variante: string, colunas = 40) {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 59, 4);
    construir(j, variante, 0, 0, colunas - 1, 0);
    construir(j, 'elevador_padrao', 50, 0, 50, 4);
    construir(j, 'escritorio', 0, 3, 26, 3);
    construir(j, 'apartamento', 0, 4);
    return j;
  }

  it('portas mais rápidas no corporativo', () => {
    expect(entradas(predio('lobby')).map((e) => e.vazao)).toEqual([VAZAO_PORTA[Est.Lobby], VAZAO_PORTA[Est.Lobby]]);
    expect(entradas(predio('lobby_corporativo'))[0]!.vazao).toBe(VAZAO_PORTA[Est.LobbyCorp]);
  });

  it('corporativo melhora só escritórios; átrio melhora todos', () => {
    const corp = predio('lobby_corporativo');
    expect(estado(corp, 0, 3).componentes.lobby).toBe(BONUS_CORPORATIVO);
    expect(estado(corp, 0, 4).componentes.lobby).toBe(0);
    const atrio = predio('atrio');
    expect(estado(atrio, 0, 3).componentes.lobby).toBe(BONUS_ATRIO);
    expect(estado(atrio, 0, 4).componentes.lobby).toBe(BONUS_ATRIO);
  });

  it('trecho curto não conta', () => {
    expect(estado(predio('atrio', 10), 0, 3).componentes.lobby).toBe(0);
  });

  it('grand lobby traz turistas para as lojas', () => {
    const visitantes = (variante: string) => {
      const j = predio(variante);
      construir(j, 'loja', 30, 3);
      j.ocuparTodas();
      avancarAte(j, 12);
      return [...j.populacao.pessoas.values()].filter((p) => p.tipo === 'visitante').length;
    };
    expect(visitantes('grand_lobby')).toBeGreaterThan(visitantes('lobby') + 10);
  });

  it('portas lotadas seguram a entrada e quem espera se irrita', () => {
    const j = predio('lobby');
    for (let y = 1; y <= 2; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 45, y1: y });
    j.ocuparTodas();
    avancarAte(j, 7);
    for (const e of entradas(j)) e.vazao = 0; // portas travadas
    j.avancar(120);
    const naFila = () => [...j.populacao.pessoas.values()].filter((p) => p.fila).length;
    expect(naFila()).toBeGreaterThan(20);
    expect([...j.populacao.pessoas.values()].some((p) => p.historico.some((h) => h.includes('fila para entrar')))).toBe(true);
    for (const e of entradas(j)) e.vazao = VAZAO_PORTA[Est.Lobby];
    j.avancar(5);
    expect(naFila()).toBe(0);
  });
});
