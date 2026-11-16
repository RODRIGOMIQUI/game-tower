// Torre grande (~12 mil pessoas em 100 andares) usada pela partida completa
// e pelo benchmark de desempenho. Layout de cada andar (360 colunas): blocos
// de 27 colunas (3 escritórios) separados por poços padrão (4 col) ou por
// pares de expressos (2 × 6 col).
import { tipo } from './dados';
import type { Jogo } from './jogo';
import { Est, LARGURA } from './mundo';
import { construir } from './teste-util';

export const PADRAO = [27, 97, 167, 237, 307, 338];
export const EXPRESSOS = [58, 64, 128, 134, 268, 274];
/** Estes dois vão até o topo (97) para a Coroa. */
export const EXPRESSOS_TOPO = [198, 204];
export const TOPO = { x0: 150, x1: 209 }; // ponta da torre, andares 97–99
const RESERVADAS = new Set<number>();
for (const x of PADRAO) for (let c = x; c < x + 4; c++) RESERVADAS.add(c);
for (const x of [...EXPRESSOS, ...EXPRESSOS_TOPO]) for (let c = x; c < x + 6; c++) RESERVADAS.add(c);

/** Ladrilha cada trecho livre (com piso, sem unidade, fora das colunas reservadas). */
export function preencher(j: Jogo, y: number, item: string, x0 = 0, x1 = LARGURA - 1): void {
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

export function elevador(j: Jogo, item: string, x: number, y0: number, y1: number, carros = 8): void {
  construir(j, item, x, y0, x, y1);
  const uid = j.mundo.unidadeEm(x, y0)!.uid;
  for (let i = 1; i < carros; i++) j.comando({ tipo: 'carros', uid, delta: 1 });
  j.comando({ tipo: 'modo', uid, modo: 'pico_manha' });
}

/** Zona de escritórios acima de `base` (lobby ou sky lobby), com elevadores locais. */
export function zona(j: Jogo, base: number, andares = 13): void {
  for (const x of PADRAO) elevador(j, 'elevador_padrao', x, base, base + andares);
  for (let y = base + 1; y <= base + andares; y++) {
    if ((y - base) % 4 === 2) construir(j, (y - base) % 8 === 6 && j.estrela >= 3 ? 'restaurante' : 'lanchonete', 0, y);
    // No 27º andar, a ponta direita fica para as suítes (3ª estrela).
    preencher(j, y, 'escritorio', 0, y === 27 ? 310 : LARGURA - 1);
  }
}


/**
 * Monta direto (sem progressão) a torre de 5 zonas de escritórios com sky
 * lobbies e expressos, e ocupa tudo. Precisa de um jogo em sandbox.
 */
export function montarTorreGrande(j: Jogo): void {
  construir(j, 'lobby', 0, 0, LARGURA - 1, 0);
  construir(j, 'piso', 0, 1, LARGURA - 1, 84);
  for (const y of [14, 28, 42, 56]) construir(j, 'sky_lobby', 0, y, LARGURA - 1, y);
  for (const x of EXPRESSOS) elevador(j, 'elevador_expresso', x, 0, 84);
  for (const b of [0, 14, 28, 42, 56]) zona(j, b);
  j.ocuparTodas();
}
