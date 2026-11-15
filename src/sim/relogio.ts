// Tempo de jogo: 1 tick = 1 minuto. Ver docs/gdd.md §4.

export const MIN_POR_DIA = 1440;
export const DIAS_POR_TRI = 4; // 3 úteis + 1 fim de semana
export const TRI_POR_ANO = 4;
/** Ticks por segundo real em velocidade 1× (1 dia ≈ 4 min reais). */
export const TICKS_POR_SEGUNDO_1X = 6;
/** O jogo começa às 06:00 do dia 1. */
export const TICK_INICIAL = 6 * 60;

export const VELOCIDADES = [0, 1, 2, 4, 8] as const;
export type Velocidade = (typeof VELOCIDADES)[number];

export interface Data {
  minutoDoDia: number;
  hora: number;
  minuto: number;
  diaTotal: number;
  /** 1–4 dentro do trimestre. */
  diaNoTri: number;
  /** 1–4. */
  trimestre: number;
  /** começa em 1. */
  ano: number;
  fimDeSemana: boolean;
}

export function data(tick: number): Data {
  const minutoDoDia = tick % MIN_POR_DIA;
  const diaTotal = Math.floor(tick / MIN_POR_DIA);
  const diaNoTri0 = diaTotal % DIAS_POR_TRI;
  const triTotal = Math.floor(diaTotal / DIAS_POR_TRI);
  return {
    minutoDoDia,
    hora: Math.floor(minutoDoDia / 60),
    minuto: minutoDoDia % 60,
    diaTotal,
    diaNoTri: diaNoTri0 + 1,
    trimestre: (triTotal % TRI_POR_ANO) + 1,
    ano: Math.floor(triTotal / TRI_POR_ANO) + 1,
    fimDeSemana: diaNoTri0 === DIAS_POR_TRI - 1,
  };
}

/** True quando este tick é 00:00 do primeiro dia de um trimestre (exceto o início do jogo). */
export function inicioDeTrimestre(tick: number): boolean {
  return tick > 0 && tick % (MIN_POR_DIA * DIAS_POR_TRI) === 0;
}

const ESTACOES = ['Primavera', 'Verão', 'Outono', 'Inverno'];

export function formatarData(tick: number): string {
  const d = data(tick);
  const dia = d.fimDeSemana ? 'Fim de semana' : `Dia ${d.diaNoTri}`;
  return `Ano ${d.ano} · T${d.trimestre} ${ESTACOES[d.trimestre - 1]} · ${dia}`;
}

export function formatarHora(tick: number): string {
  const d = data(tick);
  return `${String(d.hora).padStart(2, '0')}:${String(d.minuto).padStart(2, '0')}`;
}
