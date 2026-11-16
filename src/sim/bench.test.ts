// Benchmark de desempenho (Fase 8): ~12 mil pessoas em 85 andares.
// Mede minutos de jogo por segundo da simulação e o custo de publicar o
// estado para o render (como o Worker faz ~20×/s). Lento: `LONGO=1 npm run bench`.
import { expect, it } from 'vitest';
import { Jogo } from './jogo';
import { avancarAte } from './teste-util';
import { montarTorreGrande } from './torre-grande';

const LONGO = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LONGO;

it.skipIf(!LONGO)('benchmark: torre de ~12 mil pessoas', () => {
  const j = new Jogo({ sandbox: true, seed: 3, eventos: false });
  let t = performance.now();
  montarTorreGrande(j);
  const montar = performance.now() - t;
  const pop = j.populacaoTotal();

  const fases: string[] = [];
  const medir = (nome: string, ate: number) => {
    const tick0 = j.tick;
    const t0 = performance.now();
    avancarAte(j, ate);
    const s = (performance.now() - t0) / 1000;
    fases.push(`${nome.padEnd(22)} ${String(j.tick - tick0).padStart(5)} ticks em ${s.toFixed(2).padStart(6)} s → ${((j.tick - tick0) / s).toFixed(0).padStart(5)} ticks/s`);
    return (j.tick - tick0) / s;
  };
  const tarde = medir('06h→07h (calmo)', 7);
  const pico = medir('07h→10h (pico manhã)', 10);
  const meio = medir('10h→16h (meio do dia)', 16);
  const saida = medir('16h→20h (pico tarde)', 20);
  const noite = medir('20h→06h (noite)', 6);

  // Publicação para o render (o Worker faz isso ~20×/s)
  avancarAte(j, 9);
  t = performance.now();
  for (let i = 0; i < 20; i++) {
    j.populacao.visiveis();
    j.populacao.estatisticas();
    j.inquilinos.resumo();
    j.carros();
    j.resumoPocos();
    j.progresso();
  }
  const publicar = (performance.now() - t) / 20;

  console.log(
    `\nPopulação ${pop} · montagem ${(montar / 1000).toFixed(1)} s · rotas calculadas ${j.roteador.calculadas}\n` +
      fases.join('\n') +
      `\nPublicar estado (1×): ${publicar.toFixed(2)} ms\n`,
  );
  expect(pop).toBeGreaterThan(11_000);
  expect(Math.min(tarde, pico, meio, saida, noite)).toBeGreaterThan(0);
}, 1_800_000);
