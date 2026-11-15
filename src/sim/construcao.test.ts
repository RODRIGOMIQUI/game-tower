import { describe, expect, it } from 'vitest';
import { planejarConstrucao, planejarDemolicao } from './construcao';
import { Jogo } from './jogo';
import { Est } from './mundo';

const RICO = { dinheiro: 1e12, estrela: 1 };

describe('estrutura', () => {
  it('piso no térreo não precisa de apoio; no andar 2 precisa', () => {
    const j = new Jogo();
    expect(planejarConstrucao(j.mundo, 'piso', 10, 1, 10, 1, RICO).motivo).toBe('Sem apoio no andar de baixo');
    expect(j.comando({ tipo: 'construir', item: 'piso', x0: 10, y0: 0, x1: 19, y1: 0 }).feitos).toBe(10);
    expect(j.comando({ tipo: 'construir', item: 'piso', x0: 10, y0: 1, x1: 25, y1: 1 })).toMatchObject({
      feitos: 10,
      motivo: 'Sem apoio no andar de baixo',
    });
  });

  it('arrasto vertical constrói vários andares de uma vez, apoiando-se no próprio plano', () => {
    const j = new Jogo();
    const r = j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 4, x1: 4, y1: 0 });
    expect(r).toMatchObject({ ok: true, feitos: 25, custo: 25 * 500 });
    expect(j.mundo.est(4, 4)).toBe(Est.Piso);
  });

  it('células já construídas são ignoradas sem erro nem custo', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 4, y1: 0 });
    const p = planejarConstrucao(j.mundo, 'piso', 0, 0, 9, 0, RICO);
    expect(p.validos).toBe(5);
    expect(p.motivo).toBeUndefined();
  });

  it('lobby só no térreo e pode substituir piso', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 0, y1: 1 });
    expect(j.comando({ tipo: 'construir', item: 'lobby', x0: 0, y0: 1, x1: 0, y1: 1 }).motivo).toBe('Lobby só no térreo');
    expect(j.comando({ tipo: 'construir', item: 'lobby', x0: 0, y0: 0, x1: 0, y1: 0 }).ok).toBe(true);
    expect(j.mundo.est(0, 0)).toBe(Est.Lobby);
  });

  it('escavação desce a partir do B1', () => {
    const j = new Jogo();
    expect(j.comando({ tipo: 'construir', item: 'escavacao', x0: 0, y0: -2, x1: 0, y1: -2 }).motivo).toBe(
      'Escave o andar de cima primeiro',
    );
    expect(j.comando({ tipo: 'construir', item: 'escavacao', x0: 0, y0: -1, x1: 0, y1: -3 }).feitos).toBe(3);
    expect(j.comando({ tipo: 'construir', item: 'escavacao', x0: 1, y0: 0, x1: 1, y1: 0 }).motivo).toBe(
      'Escavação só no subsolo',
    );
  });

  it('para quando o dinheiro acaba', () => {
    const j = new Jogo({ dinheiro: 1_200 });
    const r = j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 9, y1: 0 });
    expect(r).toMatchObject({ feitos: 2, custo: 1_000, motivo: 'Dinheiro insuficiente' });
    expect(j.dinheiro).toBe(200);
  });
});

describe('unidades', () => {
  function comPiso() {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 59, y1: 2 });
    return j;
  }

  it('escritório precisa de piso em toda a largura', () => {
    const j = comPiso();
    expect(j.comando({ tipo: 'construir', item: 'escritorio', x0: 55, y0: 1, x1: 55, y1: 1 }).motivo).toBe('Precisa de piso');
    expect(j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: 1, x1: 0, y1: 1 }).ok).toBe(true);
  });

  it('não sobrepõe unidades', () => {
    const j = comPiso();
    j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: 1, x1: 0, y1: 1 });
    expect(j.comando({ tipo: 'construir', item: 'escritorio', x0: 5, y0: 1, x1: 5, y1: 1 }).motivo).toBe('Espaço ocupado');
  });

  it('não fica sobre o lobby', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'lobby', x0: 0, y0: 0, x1: 20, y1: 0 });
    expect(j.comando({ tipo: 'construir', item: 'lanchonete', x0: 0, y0: 0, x1: 0, y1: 0 }).motivo).toBe(
      'Não pode ficar no lobby',
    );
  });

  it('arrastar repete lado a lado sem passar do fim, nos dois sentidos', () => {
    const j = comPiso();
    const dir = planejarConstrucao(j.mundo, 'escritorio', 0, 1, 30, 1, RICO);
    expect(dir.itens.map((i) => i.x)).toEqual([0, 9, 18]);
    const esq = planejarConstrucao(j.mundo, 'escritorio', 40, 1, 20, 1, RICO);
    expect(esq.itens.map((i) => i.x)).toEqual([40, 31, 22]);
  });

  it('bloqueia tipos acima da estrela atual, exceto no sandbox', () => {
    const j = comPiso();
    expect(j.comando({ tipo: 'construir', item: 'loja', x0: 0, y0: 1, x1: 0, y1: 1 }).motivo).toBe('Requer 3★');
    const s = new Jogo({ sandbox: true });
    s.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 20, y1: 1 });
    expect(s.comando({ tipo: 'construir', item: 'loja', x0: 0, y0: 1, x1: 0, y1: 1 }).ok).toBe(true);
  });

  it('transporte ainda não está disponível', () => {
    const j = comPiso();
    expect(j.comando({ tipo: 'construir', item: 'escada', x0: 0, y0: 1, x1: 0, y1: 1 }).motivo).toBe(
      'Ainda não disponível',
    );
  });
});

describe('demolição', () => {
  it('remove a unidade primeiro e devolve 25%', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 20, y1: 1 });
    j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: 1, x1: 0, y1: 1 });
    const antes = j.dinheiro;
    const r = j.comando({ tipo: 'demolir', x0: 3, y0: 1, x1: 3, y1: 1 });
    expect(r).toMatchObject({ ok: true, feitos: 1, custo: -10_000 });
    expect(j.dinheiro).toBe(antes + 10_000);
    expect(j.mundo.uidEm(3, 1)).toBe(0);
    expect(j.mundo.est(3, 1)).toBe(Est.Piso);
  });

  it('não remove piso que sustenta o andar de cima, a menos que remova os dois', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 0, y1: 2 });
    expect(planejarDemolicao(j.mundo, 0, 1, 0, 1).motivo).toBe('Sustenta o andar de cima');
    expect(j.comando({ tipo: 'demolir', x0: 0, y0: 0, x1: 0, y1: 2 }).feitos).toBe(3);
    expect(j.mundo.est(0, 0)).toBe(Est.Vazio);
  });

  it('escavação: só remove de baixo para cima', () => {
    const j = new Jogo();
    j.comando({ tipo: 'construir', item: 'escavacao', x0: 0, y0: -1, x1: 0, y1: -2 });
    expect(planejarDemolicao(j.mundo, 0, -1, 0, -1).motivo).toBe('Há escavação abaixo');
    expect(j.comando({ tipo: 'demolir', x0: 0, y0: -2, x1: 0, y1: -2 }).ok).toBe(true);
  });
});

describe('tempo e trimestre', () => {
  it('cobra manutenção no fechamento do trimestre', () => {
    const j = new Jogo({ sandbox: true });
    j.comando({ tipo: 'construir', item: 'piso', x0: 0, y0: 0, x1: 20, y1: 0 });
    j.comando({ tipo: 'construir', item: 'seguranca', x0: 0, y0: 0, x1: 0, y1: 0 });
    const antes = j.dinheiro;
    const eventos = j.avancar(4 * 1440); // passa da meia-noite do dia 1 do T2
    expect(eventos).toEqual([{ tipo: 'trimestre', tick: 4 * 1440, manutencao: 20_000 }]);
    expect(j.dinheiro).toBe(antes - 20_000);
  });

  it('é determinístico com o mesmo seed', () => {
    const a = new Jogo({ seed: 42 });
    const b = new Jogo({ seed: 42 });
    expect([a.rng.proximo(), a.rng.proximo()]).toEqual([b.rng.proximo(), b.rng.proximo()]);
  });
});
