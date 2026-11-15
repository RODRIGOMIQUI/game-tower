import { describe, expect, it } from 'vitest';
import { data, formatarHora, inicioDeTrimestre, MIN_POR_DIA, TICK_INICIAL } from './relogio';

describe('relógio', () => {
  it('começa no ano 1, T1, dia 1, 06:00', () => {
    const d = data(TICK_INICIAL);
    expect(d).toMatchObject({ ano: 1, trimestre: 1, diaNoTri: 1, hora: 6, minuto: 0, fimDeSemana: false });
    expect(formatarHora(TICK_INICIAL)).toBe('06:00');
  });

  it('o 4º dia do trimestre é fim de semana', () => {
    expect(data(3 * MIN_POR_DIA).fimDeSemana).toBe(true);
    expect(data(2 * MIN_POR_DIA).fimDeSemana).toBe(false);
  });

  it('um ano tem 16 dias e 4 trimestres', () => {
    expect(data(4 * MIN_POR_DIA)).toMatchObject({ trimestre: 2, diaNoTri: 1, ano: 1 });
    expect(data(16 * MIN_POR_DIA)).toMatchObject({ trimestre: 1, ano: 2 });
  });

  it('detecta início de trimestre só à meia-noite do dia 1', () => {
    expect(inicioDeTrimestre(0)).toBe(false);
    expect(inicioDeTrimestre(4 * MIN_POR_DIA)).toBe(true);
    expect(inicioDeTrimestre(4 * MIN_POR_DIA + 1)).toBe(false);
    expect(inicioDeTrimestre(MIN_POR_DIA)).toBe(false);
  });
});
