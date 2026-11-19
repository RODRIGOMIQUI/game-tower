// Variantes de lobby do térreo: básico, corporativo, átrio e grand lobby.
// Átrio e grand lobby têm pé-direito duplo: ocupam a célula do térreo e a do
// 1º andar (y = 1), sempre juntas.

import { Est, LARGURA, type Mundo } from './mundo';

/** Trecho contínuo mínimo de uma variante para os efeitos dela valerem. */
export const LOBBY_MIN_COLUNAS = 20;

/** Pessoas por minuto que cada porta da rua deixa entrar, pela melhor variante do trecho. */
export const VAZAO_PORTA: Record<number, number> = {
  [Est.Lobby]: 20,
  [Est.LobbyCorp]: 28,
  [Est.Atrio]: 20,
  [Est.Grand]: 28,
};

export const BONUS_CORPORATIVO = 5;
export const BONUS_ATRIO = 10;
/** Diárias de hotel com grand lobby. */
export const MULT_HOTEL_GRAND = 1.15;
/** Turistas por hora (10h–18h) atraídos pelo grand lobby. */
export const TURISTAS_POR_HORA = 12;
/** Movimento extra de comida/lojas no mezanino do átrio. */
export const MULT_MEZANINO = 1.5;

/** Qualquer célula de lobby (inclui sky lobby). */
export function ehLobby(c: number): boolean {
  return c === Est.Lobby || c === Est.LobbyCorp || c === Est.Atrio || c === Est.Grand;
}

/** Lobbies de pé-direito duplo (térreo + 1º andar). */
export function ehLobbyDuplo(c: number): boolean {
  return c === Est.Atrio || c === Est.Grand;
}

export interface EfeitosLobby {
  corporativo: boolean;
  atrio: boolean;
  grand: boolean;
}

/** Quais variantes têm um trecho de pelo menos LOBBY_MIN_COLUNAS no térreo. */
export function efeitosLobby(m: Mundo): EfeitosLobby {
  const r: EfeitosLobby = { corporativo: false, atrio: false, grand: false };
  let x = 0;
  while (x < LARGURA) {
    const c = m.est(x, 0);
    let fim = x + 1;
    while (fim < LARGURA && m.est(fim, 0) === c) fim++;
    if (fim - x >= LOBBY_MIN_COLUNAS) {
      if (c === Est.LobbyCorp) r.corporativo = true;
      else if (c === Est.Atrio) r.atrio = true;
      else if (c === Est.Grand) r.grand = true;
    }
    x = fim;
  }
  return r;
}

/** Célula do mezanino do átrio (1º andar), onde cabem comida e lojas. */
export function ehMezanino(m: Mundo, x: number, y: number): boolean {
  return y === 1 && m.est(x, y) === Est.Atrio;
}
