// Critério da Fase 3: com o mesmo caixa ($2.000.000), um layout sensato prospera e um layout
// ruim vai à falência. Rode `npm run sim` para ver as tabelas.
import { expect, it } from 'vitest';
import { Jogo, type EventoJogo } from './jogo';
import { construir } from './teste-util';
import { dinheiro as fmt } from '../ui/formato';

function simular(j: Jogo, trimestres: number) {
  const linhas: string[] = [];
  const eventos: EventoJogo[] = [];
  for (let t = 0; t < trimestres && !j.encerrado; t++) {
    const ev = j.avancar(4 * 1440);
    eventos.push(...ev);
    for (const e of ev) {
      if (e.tipo !== 'trimestre') continue;
      const r = e.livro.receitas;
      linhas.push(
        `T${String(t + 1).padStart(2)}  caixa ${fmt(e.caixa).padStart(14)}  aluguel ${fmt(r.aluguel).padStart(10)}` +
          `  vendas ${fmt(r.vendas).padStart(10)}  comida ${fmt(r.comida).padStart(9)}  manutenção ${fmt(-e.manutencao).padStart(10)}` +
          `  pop. ${String(j.populacaoTotal()).padStart(4)}  saídas ${e.saidas}`,
      );
    }
  }
  return { linhas, eventos };
}

it('layout sensato prospera em 2 anos', () => {
  // Começo "típico" de docs/economia.md §4
  const j = new Jogo({ seed: 11, dinheiro: 2_000_000 });
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'piso', 0, 1, 59, 5);
  construir(j, 'elevador_padrao', 28, 0, 28, 5);
  const poco = j.mundo.unidadeEm(28, 0)!.uid;
  j.comando({ tipo: 'carros', uid: poco, delta: 1 });
  construir(j, 'lanchonete', 0, 1);
  construir(j, 'escritorio', 32, 1, 59, 1);
  for (let y = 2; y <= 5; y++) {
    construir(j, 'escritorio', 0, y, 26, y);
    construir(j, 'escritorio', 32, y, 59, y);
  }
  const depoisDeConstruir = j.dinheiro;
  const { linhas, eventos } = simular(j, 8);
  console.log(`\nLayout sensato (caixa após construir: ${fmt(depoisDeConstruir)})\n${linhas.join('\n')}`);
  expect(eventos.some((e) => e.tipo === 'falencia')).toBe(false);
  expect(j.dinheiro).toBeGreaterThan(depoisDeConstruir + 1_000_000);
  expect(j.populacaoTotal()).toBeGreaterThan(150);
});

it('layout ruim (escritórios sem acesso, elevadores caros) vai à falência', () => {
  const j = new Jogo({ seed: 11, dinheiro: 2_000_000 });
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'piso', 0, 1, 59, 5);
  // Elevadores que não levam a lugar nenhum útil, cheios de carros
  for (const x of [10, 40]) {
    construir(j, 'elevador_padrao', x, 0, x, 1);
    const uid = j.mundo.unidadeEm(x, 0)!.uid;
    for (let c = 0; c < 7; c++) j.comando({ tipo: 'carros', uid, delta: 1 });
  }
  // Escritórios nos andares 3–6, sem elevador que chegue lá
  for (let y = 2; y <= 5; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 59, y1: y });
  const { linhas, eventos } = simular(j, 12);
  console.log(`\nLayout ruim\n${linhas.join('\n')}`);
  expect(eventos.some((e) => e.tipo === 'falencia')).toBe(true);
});
