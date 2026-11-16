// Cenário headless de referência (Fase 2): ~2.000 funcionários num prédio de
// 30 andares. Mede desempenho da simulação e o comportamento dos picos.
// Rode com `npm run sim` para ver a tabela hora a hora.
import { expect, it } from 'vitest';
import { avancarAte, construir, contarEstados, jogoRico } from './teste-util';
import { formatarHora } from './relogio';

// 4 trechos de 27 colunas (3 escritórios cada) separados por 3 poços.
const TRECHO = 27;
const POCOS_X = [27, 58, 89];
const LARGURA_PREDIO = 4 * TRECHO + 3 * 4;
const ANDARES = 30;
const CARROS = 8;

export function montarCenario() {
  const j = jogoRico();
  construir(j, 'piso', 0, 0, LARGURA_PREDIO - 1, ANDARES - 1);
  construir(j, 'lobby', 0, 0, LARGURA_PREDIO - 1, 0);
  for (const [i, x] of POCOS_X.entries()) {
    construir(j, 'elevador_padrao', x, 0, x, ANDARES - 1);
    const uid = j.mundo.unidadeEm(x, 0)!.uid;
    for (let c = 1; c < CARROS; c++) j.comando({ tipo: 'carros', uid, delta: 1 });
    if (i % 2 === 0) j.comando({ tipo: 'modo', uid, modo: 'pico_manha' });
  }
  for (let y = 1; y < ANDARES; y++) {
    if (y % 10 === 5) construir(j, 'lanchonete', 0, y);
    for (const ini of [0, ...POCOS_X.map((x) => x + 4)]) {
      j.comando({ tipo: 'construir', item: 'escritorio', x0: ini, y0: y, x1: ini + TRECHO - 1, y1: y });
    }
  }
  return j;
}

it('cenário de 2.000 pessoas: um dia útil completo', () => {
  const j = montarCenario();
  const total = j.populacaoTotal();
  expect(total).toBeGreaterThanOrEqual(1900);
  expect(j.semAcesso).toEqual([]);

  const linhas: string[] = [];
  const inicio = performance.now();
  let chegaramAs11 = 0;
  for (let h = 7; h <= 23; h++) {
    avancarAte(j, h);
    const e = j.populacao.estatisticas();
    const esperas = j.resumoPocos().map((p) => p.esperaMedia.toFixed(0).padStart(3)).join(' ');
    const est = contarEstados(j);
    if (h === 11) chegaramAs11 = est.NaUnidade ?? 0;
    linhas.push(
      `${formatarHora(j.tick)}  no prédio ${String(e.noPredio).padStart(5)}  esperando ${String(e.esperando).padStart(4)}` +
        `  nos escritórios ${String(est.NaUnidade ?? 0).padStart(5)}  desistências ${String(e.desistenciasHoje).padStart(4)}` +
        `  estresse ${e.estresseMedio.toFixed(1).padStart(5)}  espera/poço [${esperas}]`,
    );
  }
  const ms = performance.now() - inicio;
  console.log(`\nPopulação: ${total} · ${POCOS_X.length} poços × ${CARROS} carros · rotas calculadas: ${j.roteador.calculadas}`);
  console.log(linhas.join('\n'));
  console.log(`Tempo: ${(ms / 1000).toFixed(2)} s para ${17 * 60} ticks (${((17 * 60) / (ms / 1000)).toFixed(0)} ticks/s)\n`);

  // Desempenho: precisa rodar bem acima de 48 ticks/s (velocidade 8×).
  expect((17 * 60) / (ms / 1000)).toBeGreaterThan(200);
  // A maioria chega ao trabalho depois do pico da manhã, poucos desistem,
  // e à noite o prédio esvazia.
  expect(chegaramAs11).toBeGreaterThan(total * 0.8);
  expect(j.populacao.desistenciasHoje).toBeLessThan(total * 0.15);
  expect(contarEstados(j).Fora).toBeGreaterThan(total * 0.95);
}, 60_000);
