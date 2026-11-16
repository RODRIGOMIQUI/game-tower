// Fase 9: cada cenário tem pelo menos uma solução que cumpre o objetivo,
// respeitando as restrições (dinheiro de sobra para isolar a viabilidade).
import { describe, expect, it } from 'vitest';
import { Jogo, type EventoJogo } from './jogo';
import { construir } from './teste-util';

function encher(j: Jogo, item: string, y: number, x0: number, x1: number): void {
  j.comando({ tipo: 'construir', item, x0, y0: y, x1, y1: y });
}

function ateConcluir(j: Jogo, dias: number): EventoJogo | undefined {
  for (let d = 0; d < dias; d++) {
    const e = j.avancar(1440).find((ev) => ev.tipo === 'cenario');
    if (e) return e;
  }
  return undefined;
}

describe('cenários são viáveis', () => {
  it('Lote estreito: um poço por zona, empilhados, passa de 1.500 pessoas', () => {
    const j = new Jogo({ cenario: 'lote_estreito', seed: 4, dinheiro: 1e9 });
    construir(j, 'lobby', 150, 0, 209, 0);
    construir(j, 'piso', 150, 1, 209, 58);
    // Um poço por zona, encostados na borda: sobram 52 colunas (5 escritórios) por andar.
    // Zona A (0–29) e zona B (29–58), baldeação no andar 30.
    construir(j, 'elevador_padrao', 150, 0, 150, 29);
    construir(j, 'elevador_padrao', 154, 29, 154, 58);
    for (const p of j.resumoPocos()) for (let i = 0; i < 7; i++) j.comando({ tipo: 'carros', uid: p.uid, delta: 1 });
    for (let y = 1; y <= 58; y++) {
      if (y === 29) continue;
      if (y % 10 === 3) construir(j, 'lanchonete', 158, y);
      encher(j, 'escritorio', y, 158, 209);
    }
    j.ocuparTodas();
    expect(j.semAcesso).toEqual([]);
    expect(j.populacaoTotal()).toBeGreaterThanOrEqual(1500);
    expect(ateConcluir(j, 3)).toMatchObject({ nome: 'Lote estreito' });
  }, 60_000);

  it('Quatro poços: 2.000 pessoas com só quatro elevadores', () => {
    const j = new Jogo({ cenario: 'quatro_pocos', seed: 4, dinheiro: 1e9 });
    construir(j, 'lobby', 0, 0, 359, 0);
    construir(j, 'piso', 0, 1, 359, 12);
    for (const x of [60, 140, 220, 300]) construir(j, 'elevador_padrao', x, 0, x, 12);
    for (const p of j.resumoPocos()) for (let i = 0; i < 7; i++) j.comando({ tipo: 'carros', uid: p.uid, delta: 1 });
    for (let y = 1; y <= 12; y++) {
      if (y % 4 === 2) for (const x of [0, 180]) construir(j, 'lanchonete', x, y);
      encher(j, 'escritorio', y, 0, 359);
    }
    j.ocuparTodas();
    expect(j.populacaoTotal()).toBeGreaterThanOrEqual(2000);
    expect(ateConcluir(j, 3)).toMatchObject({ nome: 'Quatro poços' });
  }, 60_000);

  it('Hotel de luxo: 300 hóspedes numa noite com satisfação ≥ 80', () => {
    const j = new Jogo({ cenario: 'hotel_luxo', seed: 4, dinheiro: 1e9 });
    construir(j, 'lobby', 0, 0, 359, 0);
    construir(j, 'piso', 0, 1, 359, 12);
    for (const x of [60, 140, 220, 300]) construir(j, 'elevador_padrao', x, 0, x, 12);
    for (const p of j.resumoPocos()) for (let i = 0; i < 7; i++) j.comando({ tipo: 'carros', uid: p.uid, delta: 1 });
    // Serviços longe dos quartos (ruído) e restaurantes para o jantar
    for (const x of [0, 30, 120, 200, 280, 330]) construir(j, 'limpeza', x, 1);
    for (const x of [64, 144, 224]) construir(j, 'restaurante', x, 1);
    for (let y = 2; y <= 12; y++) encher(j, 'hotel_duplo', y, 0, 359);
    const ev = ateConcluir(j, 12);
    expect(ev).toMatchObject({ nome: 'Hotel de luxo' });
  }, 120_000);
});
