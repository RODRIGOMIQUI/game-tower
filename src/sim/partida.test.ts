// Partida completa ★1 → Lendária com as metas reais do GDD (critério da Fase 4).
// Um "construtor automático" expande a torre a cada estrela. Dinheiro abundante
// isola a progressão: o ritmo econômico de uma carreira é ajuste da Fase 9.
// Lento (minutos): rode com `LONGO=1 npm run sim:partida`.
import { expect, it } from 'vitest';
import { tipo } from './dados';
import { Jogo, type EventoJogo } from './jogo';
import { Est, LARGURA } from './mundo';
import { formatarData } from './relogio';
import { construir } from './teste-util';

// Layout de cada andar (360 colunas): blocos de 27 colunas (3 escritórios)
// separados por poços padrão (4 col) ou por pares de expressos (2 × 6 col).
const PADRAO = [27, 97, 167, 237, 307, 338];
const EXPRESSOS = [58, 64, 128, 134, 268, 274];
/** Estes dois vão até o topo (97) para a Coroa. */
const EXPRESSOS_TOPO = [198, 204];
const TOPO = { x0: 150, x1: 209 }; // ponta da torre, andares 97–99
const RESERVADAS = new Set<number>();
for (const x of PADRAO) for (let c = x; c < x + 4; c++) RESERVADAS.add(c);
for (const x of [...EXPRESSOS, ...EXPRESSOS_TOPO]) for (let c = x; c < x + 6; c++) RESERVADAS.add(c);

/** Ladrilha cada trecho livre (com piso, sem unidade, fora das colunas reservadas). */
function preencher(j: Jogo, y: number, item: string, x0 = 0, x1 = LARGURA - 1): void {
  const livre = (c: number) => j.mundo.est(c, y) === Est.Piso && !j.mundo.uidEm(c, y) && !RESERVADAS.has(c);
  const largura = tipo(item).largura_col;
  let x = x0;
  while (x <= x1) {
    if (!livre(x)) {
      x++;
      continue;
    }
    let fim = x;
    while (fim + 1 <= x1 && livre(fim + 1)) fim++;
    if (fim - x + 1 >= largura) j.comando({ tipo: 'construir', item, x0: x, y0: y, x1: fim, y1: y });
    x = fim + 1;
  }
}

function elevador(j: Jogo, item: string, x: number, y0: number, y1: number, carros = 8): void {
  construir(j, item, x, y0, x, y1);
  const uid = j.mundo.unidadeEm(x, y0)!.uid;
  for (let i = 1; i < carros; i++) j.comando({ tipo: 'carros', uid, delta: 1 });
  j.comando({ tipo: 'modo', uid, modo: 'pico_manha' });
}

/** Zona de escritórios acima de `base` (lobby ou sky lobby), com elevadores locais. */
function zona(j: Jogo, base: number, andares = 13): void {
  for (const x of PADRAO) elevador(j, 'elevador_padrao', x, base, base + andares);
  for (let y = base + 1; y <= base + andares; y++) {
    if ((y - base) % 4 === 2) construir(j, (y - base) % 8 === 6 && j.estrela >= 3 ? 'restaurante' : 'lanchonete', 0, y);
    // No 27º andar, a ponta direita fica para as suítes (3ª estrela).
    preencher(j, y, 'escritorio', 0, y === 27 ? 310 : LARGURA - 1);
  }
}

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
      construir(j, 'coroa', TOPO.x0, 97);
    }
    registrar(j.avancar(1440));
  }
  const s = (performance.now() - inicio) / 1000;
  console.log(`\n${log.join('\n')}\nEstrela final: ${j.estrela} · população ${j.populacaoTotal()} · ${formatarData(j.tick)} · ${s.toFixed(0)} s\n`);
  expect(j.estrela).toBe(6);
}, 1_800_000);
