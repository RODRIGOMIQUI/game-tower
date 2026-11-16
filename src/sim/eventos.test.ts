import { describe, expect, it } from 'vitest';
import { Jogo, type EventoJogo } from './jogo';
import { Estado } from './pessoas';
import { avancarAte, construir } from './teste-util';

function torre(opts: { seguranca?: boolean; eventos?: boolean } = {}) {
  const j = new Jogo({ seed: 9, dinheiro: 1e9, estrela: 3, eventos: opts.eventos ?? true });
  construir(j, 'piso', 0, 0, 59, 9);
  construir(j, 'lobby', 0, 0, 59, 0);
  construir(j, 'elevador_padrao', 28, 0, 28, 9);
  for (let y = 2; y <= 9; y++) j.comando({ tipo: 'construir', item: 'escritorio', x0: 0, y0: y, x1: 26, y1: y });
  if (opts.seguranca) construir(j, 'seguranca', 32, 1);
  j.ocuparTodas();
  return j;
}

const ctx = (j: Jogo) => (j as unknown as { contextoEventos(): Parameters<Jogo['eventos']['iniciarIncendio']>[1] }).contextoEventos();
const achar = <T extends EventoJogo['tipo']>(ev: EventoJogo[], t: T) => ev.find((e) => e.tipo === t) as Extract<EventoJogo, { tipo: T }> | undefined;

describe('incêndio', () => {
  it('com segurança, a brigada apaga e só os reparos são cobrados', () => {
    const j = torre({ seguranca: true });
    const uid = j.mundo.unidadeEm(0, 5)!.uid;
    const ini = j.eventos.iniciarIncendio(j.tick, ctx(j), uid)!;
    expect(ini).toMatchObject({ tipo: 'incendio', brigada: true });
    const ev = j.avancar(240);
    const fim = achar(ev, 'incendio_fim')!;
    expect(fim.bombeiros).toBe(false);
    expect(fim.custo).toBe(fim.danificadas * 8_000); // 20% de $40.000 por escritório
    expect(j.eventos.emChamas).toBe(false);
  });

  it('sem segurança, o fogo se espalha e os bombeiros de fora cobram caro', () => {
    const j = torre();
    const uid = j.mundo.unidadeEm(9, 5)!.uid;
    expect(j.eventos.iniciarIncendio(j.tick, ctx(j), uid)).toMatchObject({ brigada: false });
    const ev = j.avancar(120);
    const fim = achar(ev, 'incendio_fim')!;
    expect(fim.bombeiros).toBe(true);
    expect(fim.danificadas).toBeGreaterThan(1);
    expect(fim.custo).toBeGreaterThan(100_000);
  });

  it('a unidade em chamas é evacuada e o inquilino vai embora', () => {
    const j = torre({ seguranca: true });
    avancarAte(j, 11);
    const u = j.mundo.unidadeEm(0, 5)!;
    expect(j.populacao.ocupantes(u.uid).some((p) => p.estado === Estado.NaUnidade)).toBe(true);
    j.eventos.iniciarIncendio(j.tick, ctx(j), u.uid);
    j.avancar(1);
    expect(j.populacao.ocupantes(u.uid).some((p) => p.estado === Estado.NaUnidade)).toBe(false);
    // Logo que o fogo acaba, a unidade está vaga (depois pode ser alugada de novo).
    for (let t = 0; t < 240 && !j.avancar(1).some((e) => e.tipo === 'incendio_fim'); t++);
    expect(j.inquilinos.get(u.uid)!.situacao).toBe('vaga');
    expect(j.populacao.ocupantes(u.uid)).toHaveLength(0);
  });
});

describe('pane de elevador', () => {
  it('carro em pane fica parado e estressa quem está dentro', () => {
    const j = torre({ eventos: false });
    avancarAte(j, 8);
    j.avancar(20);
    const poco = [...j.transito.pocos.values()][0]!;
    const carro = poco.carros.find((c) => c.passageiros.length) ?? poco.carros[0]!;
    carro.pane = 60;
    j.eventos.ligado = true;
    (j.eventos as unknown as { panes: Map<number, number> }).panes.set(carro.id, poco.uid);
    const pos = carro.pos;
    const presos = [...carro.passageiros];
    j.avancar(30);
    expect(carro.pos).toBe(pos);
    for (const id of presos) expect(j.populacao.pessoas.get(id)!.estresse).toBeGreaterThan(5);
    const ev = j.avancar(40);
    expect(achar(ev, 'pane_fim')).toBeDefined();
  });

  it('acontecem sozinhas, mas raramente (cerca de 1–3% ao dia por poço)', () => {
    const j = torre();
    let panes = 0;
    for (let d = 0; d < 200; d++) panes += j.avancar(1440).filter((e) => e.tipo === 'pane').length;
    expect(panes).toBeGreaterThan(0);
    expect(panes).toBeLessThan(12); // 1 poço: ~1–5 em 200 dias
  });
});

describe('pragas', () => {
  it('quarto sujo por mais de um dia pega pragas, que passam para o vizinho', () => {
    const j = new Jogo({ seed: 9, dinheiro: 1e9, estrela: 3 });
    construir(j, 'piso', 0, 0, 59, 5);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'elevador_padrao', 28, 0, 28, 5);
    construir(j, 'hotel_simples', 0, 3, 11, 3); // 3 quartos lado a lado
    const quartos = [0, 4, 8].map((x) => j.inquilinos.get(j.mundo.unidadeEm(x, 3)!.uid)!);
    quartos[0]!.situacao = 'suja';
    quartos[0]!.sujaDesde = 0;
    const ev: EventoJogo[] = [];
    for (let d = 0; d < 3; d++) ev.push(...j.avancar(1440));
    expect(achar(ev, 'pragas')).toBeDefined();
    expect(quartos[0]!.situacao).toBe('infestada');
    expect(quartos[1]!.situacao).toBe('infestada');
  });
});

describe('VIP, achado e festival', () => {
  it('estadia tranquila do VIP dá bônus de reputação a todas as unidades', () => {
    const j = new Jogo({ seed: 1, dinheiro: 1e9, estrela: 3 });
    construir(j, 'piso', 0, 0, 59, 5);
    construir(j, 'lobby', 0, 0, 59, 0);
    construir(j, 'elevador_padrao', 28, 0, 28, 5);
    construir(j, 'hotel_suite', 0, 3, 29, 3);
    construir(j, 'limpeza', 40, 3);
    construir(j, 'lanchonete', 40, 2);
    const ev: EventoJogo[] = [];
    for (let d = 0; d < 8 && !achar(ev, 'vip'); d++) ev.push(...j.avancar(1440));
    expect(achar(ev, 'vip_chegou')).toBeDefined();
    expect(achar(ev, 'vip')).toMatchObject({ boa: true });
    expect(j.inquilinos.reputacao).toBeGreaterThan(0);
  });

  it('escavar fundo pode render um achado, uma vez só', () => {
    const j = new Jogo({ seed: 4, dinheiro: 1e9 });
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const x0 = i * 60;
      j.comando({ tipo: 'construir', item: 'escavacao', x0, y0: -1, x1: x0 + 59, y1: -10 });
    }
    const ev = j.avancar(1);
    for (const e of ev) if (e.tipo === 'achado') total++;
    expect(total).toBe(1);
    expect(j.livro.receitas.outros).toBeGreaterThanOrEqual(300_000);
    expect(j.eventos.achadoFeito).toBe(true);
  });

  it('festival na última noite do ano', () => {
    const j = torre({ eventos: true });
    // Última noite do ano 1: dia 16 (fim de semana do inverno), 18h.
    j.avancar(15 * 1440 + 18 * 60 - j.tick);
    expect(j.eventos.festival).toBe(true);
  });

  it('sandbox pode desligar os eventos', () => {
    const j = torre({ seguranca: true });
    j.comando({ tipo: 'eventos', ligado: false });
    let qtd = 0;
    for (let d = 0; d < 4; d++) qtd += j.avancar(1440).filter((e) => ['incendio', 'pane', 'pragas'].includes(e.tipo)).length;
    expect(qtd).toBe(0);
  });
});
