import { describe, expect, it } from 'vitest';
import { Jogo } from './jogo';
import { avancarAte, construir, jogoRico } from './teste-util';

/** Torre simples: lobby, 10 andares, elevador no meio, lanchonete no 2º andar. */
function torre(j: Jogo = jogoRico()) {
  construir(j, 'piso', 0, 0, 59, 9);
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'elevador_padrao', 28, 0, 28, 9);
  construir(j, 'lanchonete', 0, 1);
  return j;
}

const estado = (j: Jogo, x: number, y: number) => j.inquilinos.get(j.mundo.unidadeEm(x, y)!.uid)!;

describe('ocupação', () => {
  it('unidades começam vagas e são ocupadas com o tempo, se houver acesso', () => {
    const j = torre();
    construir(j, 'escritorio', 0, 5, 26, 5);
    expect(j.populacaoTotal()).toBe(0);
    expect(estado(j, 0, 5).situacao).toBe('vaga');
    j.avancar(3 * 1440);
    const ocupados = [0, 9, 18].filter((x) => estado(j, x, 5).situacao === 'ocupada').length;
    expect(ocupados).toBeGreaterThanOrEqual(2);
    expect(j.populacaoTotal()).toBe(ocupados * 6);
  });

  it('sem acesso ninguém se muda', () => {
    const j = jogoRico();
    construir(j, 'piso', 0, 0, 59, 9);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'escritorio', 0, 5);
    j.avancar(4 * 1440);
    expect(estado(j, 0, 5).situacao).toBe('vaga');
  });

  it('apartamento é vendido uma vez; se o morador sai, a revenda vale 70%', () => {
    const j = torre();
    construir(j, 'apartamento', 0, 6);
    const e = estado(j, 0, 6);
    const antes = j.dinheiro;
    j.ocuparTodas();
    expect(j.dinheiro - antes).toBe(150_000);
    // Força a saída: satisfação crítica por dois trimestres.
    e.satisfacao = 0;
    j.inquilinos.fecharTrimestre(j.populacao, j.mundo);
    e.satisfacao = 0;
    j.inquilinos.fecharTrimestre(j.populacao, j.mundo);
    expect(e.situacao).toBe('vaga');
    expect(j.populacaoTotal()).toBe(0);
    const antes2 = j.dinheiro;
    j.ocuparTodas();
    expect(j.dinheiro - antes2).toBe(105_000);
  });
});

describe('aluguel e preço', () => {
  it('cobra aluguel no fechamento do trimestre conforme o nível de preço', () => {
    const j = torre();
    construir(j, 'escritorio', 0, 5, 17, 5); // 2 escritórios
    j.ocuparTodas();
    j.comando({ tipo: 'preco', uid: j.mundo.unidadeEm(9, 5)!.uid, nivel: 'premium' });
    const eventos = j.avancar(4 * 1440 - (j.tick % (4 * 1440)));
    const tri = eventos.find((e) => e.tipo === 'trimestre');
    expect(tri).toMatchObject({ livro: { receitas: { aluguel: 10_000 + 16_000 } } });
  });

  it('preço premium reduz a satisfação esperada; baixo aumenta', () => {
    const j = torre();
    construir(j, 'escritorio', 0, 5, 26, 5);
    const [a, b] = [estado(j, 0, 5), estado(j, 9, 5)];
    j.comando({ tipo: 'preco', uid: a.uid, nivel: 'premium' });
    j.comando({ tipo: 'preco', uid: b.uid, nivel: 'baixo' });
    // premium −20 vs baixo +10 (a expectativa é limitada a 100)
    expect(j.inquilinos.expectativa(a)).toBeLessThanOrEqual(j.inquilinos.expectativa(b) - 20);
  });
});

describe('satisfação', () => {
  it('apartamento ao lado de escritório sofre com ruído', () => {
    const j = torre();
    construir(j, 'apartamento', 0, 6);
    construir(j, 'apartamento', 40, 7);
    construir(j, 'escritorio', 17, 6);
    expect(estado(j, 0, 6).componentes.ruido).toBeGreaterThan(0);
    expect(estado(j, 40, 7).componentes.ruido).toBe(0);
  });

  it('ter onde comer dá bônus de serviços', () => {
    const j = torre();
    construir(j, 'escritorio', 0, 5);
    expect(estado(j, 0, 5).componentes.servicos).toBe(10);
    const sem = jogoRico();
    construir(sem, 'piso', 0, 0, 59, 9);
    construir(sem, 'lobby', 0, 0, 59, 0);
    construir(sem, 'elevador_padrao', 28, 0, 28, 9);
    construir(sem, 'escritorio', 0, 5);
    expect(estado(sem, 0, 5).componentes.servicos).toBe(0);
  });
});

describe('comida e visitantes', () => {
  it('lanchonete fatura com funcionários e visitantes no almoço', () => {
    const j = torre();
    construir(j, 'escritorio', 0, 5, 26, 5);
    j.ocuparTodas();
    avancarAte(j, 15);
    expect(j.livro.receitas.comida).toBeGreaterThan(18 * 40); // 18 funcionários + visitantes
    expect(estado(j, 0, 1).clientesHoje).toBeGreaterThan(18);
  });
});

describe('hotel', () => {
  function hotel() {
    const j = torre();
    construir(j, 'hotel_simples', 40, 5, 55, 5); // 4 quartos
    return j;
  }

  it('reserva às 14h, cobra a diária e o quarto fica sujo depois do check-out', () => {
    const j = hotel();
    avancarAte(j, 15);
    const quartos = [40, 44, 48, 52].map((x) => estado(j, x, 5));
    const reservados = quartos.filter((q) => q.situacao === 'hospedada').length;
    expect(reservados).toBeGreaterThan(0);
    expect(j.livro.receitas.hotel).toBe(reservados * 2_500);
    avancarAte(j, 13); // dia seguinte, depois do check-out
    expect(quartos.filter((q) => q.situacao === 'suja').length).toBe(reservados);
  });

  it('sem limpeza os quartos sujos não voltam a ser alugados; com limpeza voltam', () => {
    const j = hotel();
    avancarAte(j, 15);
    avancarAte(j, 13); // dia 2: check-out pela manhã, sem limpeza
    const quartos = [40, 44, 48, 52].map((x) => estado(j, x, 5));
    expect(quartos.some((q) => q.situacao === 'suja')).toBe(true);
    construir(j, 'limpeza', 0, 8);
    avancarAte(j, 17); // limpeza trabalha até as 17h
    expect(quartos.some((q) => q.situacao === 'suja')).toBe(false);
  });
});

describe('falência', () => {
  it('dois trimestres com caixa negativo encerram a carreira', () => {
    const j = new Jogo({ seed: 3, dinheiro: 1_000_000 });
    construir(j, 'piso', 0, 0, 30, 0);
    construir(j, 'lobby', 0, 0, 30, 0);
    j.dinheiro = -50_000;
    const eventos = j.avancar(9 * 1440);
    expect(eventos.some((e) => e.tipo === 'falencia')).toBe(true);
    expect(j.encerrado).toBe(true);
    const t = j.tick;
    j.avancar(100);
    expect(j.tick).toBe(t);
  });

  it('o sandbox nunca vai à falência', () => {
    const j = jogoRico();
    j.dinheiro = -1;
    expect(j.avancar(9 * 1440).some((e) => e.tipo === 'falencia')).toBe(false);
  });
});
