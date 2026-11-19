// Partida completa ★1 → Lendária com as metas reais do GDD (critério da Fase 4).
// Um "construtor automático" expande a torre a cada estrela. Dinheiro abundante
// isola a progressão: o ritmo econômico de uma carreira é ajuste da Fase 9.
// Lento (minutos): rode com `LONGO=1 npm run sim:partida`.
import { expect, it } from 'vitest';
import { Jogo, type EventoJogo } from './jogo';
import { LARGURA } from './mundo';
import { formatarData } from './relogio';
import { construir } from './teste-util';
import { elevador, EXPRESSOS, EXPRESSOS_TOPO, preencher, TOPO, zona } from './torre-grande';

const LONGO = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LONGO;

it.skipIf(!LONGO)('partida completa: ★1 até Lendária', () => {
  const j = new Jogo({ seed: 2026, dinheiro: 1e11 });
  const log: string[] = [];
  const inicio = performance.now();
  const registrar = (ev: EventoJogo[]) => {
    for (const e of ev) {
      if (e.tipo === 'trimestre') continue;
      const s = ((performance.now() - inicio) / 1000).toFixed(0);
      log.push(`${formatarData(j.tick)}  pop ${String(j.populacaoTotal()).padStart(6)}  [${s}s]  ${JSON.stringify(e)}`);
    }
  };
  const feito = new Set<number>();

  for (let dia = 0; dia < 60 && j.estrela < 6; dia++) {
    const s = j.estrela;
    if (!feito.has(1)) {
      feito.add(1);
      construir(j, 'lobby', 0, 0, LARGURA - 1, 0);
      construir(j, 'piso', 0, 1, LARGURA - 1, 13);
      construir(j, 'escavacao', 0, -1, LARGURA - 1, -3);
      zona(j, 0);
    }
    if (s >= 2 && !feito.has(2)) {
      feito.add(2);
      construir(j, 'seguranca', 0, -1);
      construir(j, 'limpeza', 16, -1);
    }
    if (s >= 3 && !feito.has(3)) {
      feito.add(3);
      construir(j, 'piso', 0, 14, LARGURA - 1, 84);
      construir(j, 'piso', TOPO.x0, 85, TOPO.x1, 99);
      for (const y of [14, 28]) construir(j, 'sky_lobby', 0, y, LARGURA - 1, y);
      for (const x of EXPRESSOS) elevador(j, 'elevador_expresso', x, -1, 84);
      for (const x of EXPRESSOS_TOPO) elevador(j, 'elevador_expresso', x, -1, 97);
      zona(j, 14);
      zona(j, 28);
      construir(j, 'centro_medico', 70, -1);
      construir(j, 'reciclagem', 100, -2);
      construir(j, 'rampa_estacionamento', 140, -1);
      for (const x of [155, 210]) construir(j, 'estacionamento', x, -1);
      preencher(j, 27, 'hotel_suite', 311, LARGURA - 1);
    }
    if (s >= 4 && !feito.has(4)) {
      feito.add(4);
      construir(j, 'metro', 280, -3);
      construir(j, 'sky_lobby', 0, 42, LARGURA - 1, 42);
      zona(j, 42);
    }
    if (s >= 5 && !feito.has(5)) {
      feito.add(5);
      for (const y of [56, 70]) construir(j, 'sky_lobby', 0, y, LARGURA - 1, y);
      zona(j, 56);
      zona(j, 70);
      construir(j, 'sky_lobby', 190, 97, TOPO.x1, 97);
      // A Coroa exige um grand lobby: libera o 1º andar de um trecho do térreo.
      j.comando({ tipo: 'demolir', x0: 150, y0: 1, x1: 179, y1: 1 });
      construir(j, 'grand_lobby', 150, 0, 179, 0);
      construir(j, 'coroa', TOPO.x0, 97);
    }
    registrar(j.avancar(1440));
  }
  const s = (performance.now() - inicio) / 1000;
  console.log(`\n${log.join('\n')}\nEstrela final: ${j.estrela} · população ${j.populacaoTotal()} · ${formatarData(j.tick)} · ${s.toFixed(0)} s\n`);
  expect(j.estrela).toBe(6);
}, 1_800_000);
