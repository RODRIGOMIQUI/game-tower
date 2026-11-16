import { describe, expect, it } from 'vitest';
import { planejarConstrucao } from './construcao';
import { Estado } from './pessoas';
import { avancarAte, construir, contarEstados, jogoRico } from './teste-util';

/** Prédio de 10 andares, lobby, 1 elevador no meio e escritórios no 5º andar (y=4). */
function predioBasico() {
  const j = jogoRico();
  construir(j, 'piso', 0, 0, 39, 9);
  construir(j, 'lobby', 0, 0, 39, 0);
  construir(j, 'elevador_padrao', 18, 0, 18, 9);
  construir(j, 'escritorio', 0, 4, 17, 4); // 2 escritórios à esquerda do poço
  j.ocuparTodas();
  return j;
}

describe('construção de transporte', () => {
  it('elevador exige arrasto vertical e respeita o alcance', () => {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 20, 40);
    const ctx = j.contexto();
    expect(planejarConstrucao(j.mundo, 'elevador_padrao', 0, 3, 0, 3, ctx).motivo).toBe('Arraste na vertical para definir os andares');
    expect(planejarConstrucao(j.mundo, 'elevador_padrao', 0, 0, 0, 30, ctx).motivo).toBe('Alcance máximo: 30 andares');
    const ok = planejarConstrucao(j.mundo, 'elevador_padrao', 0, 0, 0, 29, ctx);
    expect(ok.validos).toBe(1);
    expect(ok.custoTotal).toBe(200_000); // poço + 1 carro
  });

  it('elevador e escada podem ficar no lobby; escada precisa de piso em cima', () => {
    const j = jogoRico();
    construir(j, 'lobby', 0, 0, 30, 0);
    expect(planejarConstrucao(j.mundo, 'escada', 0, 0, 0, 0, j.contexto()).motivo).toBe('Precisa de piso no andar de cima');
    construir(j, 'piso', 0, 1, 30, 1);
    construir(j, 'escada', 0, 0);
    construir(j, 'elevador_padrao', 10, 0, 10, 1);
  });
});

describe('rotas', () => {
  it('usa o elevador para mudar de andar e caminha no mesmo andar', () => {
    const j = predioBasico();
    expect(j.roteador.rota(1, 0, 30, 0)).toEqual([{ tipo: 'andar', x: 30 }]);
    const r = j.roteador.rota(1, 0, 4.5, 4)!;
    expect(r.map((p) => p.tipo)).toEqual(['andar', 'elevador', 'andar']);
    expect(r[1]).toMatchObject({ de: 0, para: 4 });
  });

  it('escada comum: no máximo 2 andares a pé', () => {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 39, 3);
    construir(j, 'lobby', 0, 0, 39, 0);
    construir(j, 'escada', 0, 0, 0, 2); // arrasto vertical: escadas em 0→1, 1→2, 2→3
    expect(j.roteador.rota(20, 0, 20, 2)!.filter((p) => p.tipo === 'escada')).toHaveLength(2);
    expect(j.roteador.rota(20, 0, 20, 3)).toBeNull();
  });

  it('sem piso contínuo não há rota', () => {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 9, 0);
    construir(j, 'piso', 20, 0, 29, 0);
    expect(j.roteador.rota(1, 0, 25, 0)).toBeNull();
  });

  it('marca unidades sem acesso quando não há lobby ou elevador', () => {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 39, 9);
    construir(j, 'escritorio', 0, 4);
    expect(j.semAcesso).toHaveLength(1);
    construir(j, 'lobby', 0, 0, 39, 0);
    expect(j.semAcesso).toHaveLength(1); // ainda falta o elevador
    construir(j, 'elevador_padrao', 20, 0, 20, 9);
    expect(j.semAcesso).toHaveLength(0);
  });
});

describe('dia de trabalho', () => {
  it('funcionários chegam de manhã pelo elevador, almoçam e vão embora', () => {
    const j = predioBasico();
    construir(j, 'lanchonete', 22, 4);
    expect(j.populacaoTotal()).toBe(12);
    avancarAte(j, 10);
    expect(contarEstados(j).NaUnidade).toBe(12);
    const poco = [...j.transito.pocos.values()][0]!;
    expect(poco.atendidos).toBeGreaterThanOrEqual(12);
    avancarAte(j, 14);
    expect(j.populacao.estatisticas().desistenciasHoje).toBe(0);
    avancarAte(j, 20);
    expect(contarEstados(j).Fora).toBe(12);
  });

  it('é determinístico com o mesmo seed', () => {
    const a = predioBasico();
    const b = predioBasico();
    avancarAte(a, 9);
    avancarAte(b, 9);
    expect([...a.populacao.pessoas.values()].map((p) => [p.estado, p.x, p.y])).toEqual(
      [...b.populacao.pessoas.values()].map((p) => [p.estado, p.x, p.y]),
    );
  });

  it('demolir o elevador com gente dentro não quebra a simulação', () => {
    const j = predioBasico();
    avancarAte(j, 8);
    j.avancar(40);
    const poco = [...j.transito.pocos.values()][0]!;
    const r = j.comando({ tipo: 'demolir', x0: poco.x, y0: 5, x1: poco.x, y1: 5 });
    expect(r.ok).toBe(true);
    j.avancar(120);
    for (const p of j.populacao.pessoas.values()) {
      expect([Estado.Fora, Estado.NaUnidade, Estado.Andando]).toContain(p.estado);
    }
  });

  it('mais carros levam mais gente ao trabalho no pico e reduzem desistências', () => {
    const pico = (carros: number) => {
      const j = jogoRico();
      construir(j, 'piso', 0, 0, 59, 19);
      construir(j, 'lobby', 0, 0, 59, 0);
      construir(j, 'elevador_padrao', 28, 0, 28, 19);
      const uid = [...j.transito.pocos.keys()][0]!;
      for (let i = 1; i < carros; i++) j.comando({ tipo: 'carros', uid, delta: 1 });
      for (let y = 1; y < 20; y++) {
        construir(j, 'escritorio', 0, y, 26, y);
        construir(j, 'escritorio', 33, y, 59, y);
      }
      j.ocuparTodas();
      avancarAte(j, 10);
      return { chegaram: contarEstados(j).NaUnidade ?? 0, desistiram: j.populacao.desistenciasHoje };
    };
    const um = pico(1);
    const quatro = pico(4);
    expect(quatro.chegaram).toBeGreaterThan(um.chegaram * 2);
    expect(quatro.desistiram).toBeLessThan(um.desistiram);
  });
});
