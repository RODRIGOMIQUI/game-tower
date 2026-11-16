// Eventos especiais. Ver docs/gdd.md §10.
//
// Incêndio, pane de elevador, festival de ano novo e achado no subsolo ficam
// aqui. Pragas e hóspede VIP nascem na economia (inquilinos.ts) porque
// dependem do ciclo dos quartos de hotel.

import { tipo } from './dados';
import type { EventoInquilinos, Inquilinos } from './inquilinos';
import type { Mundo, Unidade } from './mundo';
import { centro, type Populacao } from './pessoas';
import { data } from './relogio';
import type { Rng } from './rng';
import type { Roteador } from './rotas';
import type { Transito } from './transito';

/** Chance diária de incêndio: base + altura do andar ocupado mais alto. */
export const CHANCE_INCENDIO_BASE = 0.02;
export const CHANCE_INCENDIO_POR_ANDAR = 1 / 2500;
/** A cada quantos ticks o fogo tenta se espalhar, e com que chance por vizinho. */
const INTERVALO_ESPALHAR = 20;
const CHANCE_ESPALHAR = 0.3;
const MAX_FOCOS = 25;
/** Brigada da segurança: tempo de chegada e ritmo de combate. */
const BRIGADA_TEMPO_MIN = 15;
const BRIGADA_TEMPO_MAX = 90;
const BRIGADA_INTERVALO = 10;
/** Sem brigada, bombeiros de fora chegam depois deste tempo e cobram caro. */
export const BOMBEIROS_TEMPO = 60;
export const BOMBEIROS_CUSTO_BASE = 100_000;
export const BOMBEIROS_CUSTO_POR_FOCO = 25_000;
/** Reparo de cada unidade atingida (fração do custo de construção). */
export const REPARO = 0.2;

/**
 * Pane: chance por hora por poço, cresce com o uso médio dos carros no dia.
 * Poço movimentado: ~2–3% ao dia; torre grande com 30 poços: ~1 pane a cada 1–2 dias.
 */
const CHANCE_PANE = 0.0004;
const PANE_MIN = 90;
const PANE_MAX = 180;
/** Estresse por tick de quem está preso no carro. */
const ESTRESSE_PANE = 0.3;

/** Achado: chance por célula escavada do B5 para baixo; uma vez por jogo. */
const CHANCE_ACHADO = 0.004;
const ANDAR_ACHADO = -5;

export type EventoEspecial =
  | { tipo: 'incendio'; uid: number; andar: number; brigada: boolean }
  | { tipo: 'incendio_fim'; danificadas: number; custo: number; bombeiros: boolean }
  | { tipo: 'pane'; uid: number; andar: number }
  | { tipo: 'pane_fim'; uid: number }
  | { tipo: 'achado'; valor: number; x: number; y: number }
  | { tipo: 'festival' }
  | EventoInquilinos;

export interface ContextoEventos {
  mundo: Mundo;
  populacao: Populacao;
  inquilinos: Inquilinos;
  transito: Transito;
  roteadorEquipe: Roteador;
  rng: Rng;
  estrela: number;
  /** Debita uma despesa de evento (bombeiros, reparos). */
  cobrar(valor: number): void;
  /** Credita uma receita extraordinária (achado). */
  creditar(valor: number): void;
}

export class Eventos {
  ligado = true;
  /** Unidades em chamas → tick em que pegaram fogo. */
  readonly focos = new Map<number, number>();
  private queimadas = new Set<number>();
  private brigadaChega: number | null = null;
  private bombeirosChegam = 0;
  festival = false;
  achadoFeito = false;
  /** Carros em pane: id do carro → uid do poço. */
  private readonly panes = new Map<number, number>();

  get emChamas(): boolean {
    return this.focos.size > 0;
  }

  get temPanes(): boolean {
    return this.panes.size > 0;
  }

  // ------------------------------------------------------------- por hora

  hora(tick: number, ctx: ContextoEventos): EventoEspecial[] {
    const ev: EventoEspecial[] = [];
    const d = data(tick);
    // Festival: última noite do ano (fim de semana do inverno), a partir das 18h.
    if (d.trimestre === 4 && d.fimDeSemana && d.hora === 18 && this.ligado) {
      this.festival = true;
      ev.push({ tipo: 'festival' });
    }
    if (!this.ligado) return ev;
    if (d.hora >= 8 && d.hora < 21 && !this.emChamas && ctx.estrela >= 2) {
      const chance = (CHANCE_INCENDIO_BASE + alturaMax(ctx.mundo) * CHANCE_INCENDIO_POR_ANDAR) / 13;
      if (ctx.rng.proximo() < chance) {
        const r = this.iniciarIncendio(tick, ctx);
        if (r) ev.push(r);
      }
    }
    if (d.hora >= 7 && d.hora < 22) ev.push(...this.sortearPanes(ctx));
    return ev;
  }

  diario(transito: Transito): void {
    this.festival = false;
    for (const p of transito.pocos.values()) for (const c of p.carros) c.viagensHoje = 0;
  }

  // ------------------------------------------------------------ por tick

  passo(tick: number, ctx: ContextoEventos): EventoEspecial[] {
    const ev: EventoEspecial[] = [];
    if (this.panes.size) ev.push(...this.acompanharPanes(ctx));
    if (this.emChamas) ev.push(...this.acompanharIncendio(tick, ctx));
    return ev;
  }

  // ------------------------------------------------------------ incêndio

  /** Começa um incêndio numa unidade sorteada (ou na indicada, para testes). */
  iniciarIncendio(tick: number, ctx: ContextoEventos, uid?: number): EventoEspecial | null {
    const candidatas = queimaveis(ctx.mundo).filter((u) => u.y >= 1);
    const u = uid ? ctx.mundo.unidades.get(uid) : candidatas[ctx.rng.inteiro(0, candidatas.length - 1)];
    if (!u) return null;
    this.focos.clear();
    this.queimadas.clear();
    this.acender(u.uid, tick, ctx);
    this.brigadaChega = this.tempoBrigada(u, ctx);
    this.brigadaChega = this.brigadaChega === null ? null : tick + this.brigadaChega;
    this.bombeirosChegam = tick + BOMBEIROS_TEMPO;
    return { tipo: 'incendio', uid: u.uid, andar: u.y, brigada: this.brigadaChega !== null };
  }

  /** Ticks até a brigada da segurança mais próxima chegar (null se nenhuma alcança). */
  private tempoBrigada(alvo: Unidade, ctx: ContextoEventos): number | null {
    let melhor: number | null = null;
    for (const s of ctx.mundo.unidades.values()) {
      if (s.tipo !== 'seguranca') continue;
      if (!ctx.roteadorEquipe.rota(centro(s), s.y, centro(alvo), alvo.y)) continue;
      const t = Math.min(BRIGADA_TEMPO_MAX, BRIGADA_TEMPO_MIN + Math.abs(alvo.y - s.y));
      if (melhor === null || t < melhor) melhor = t;
    }
    return melhor;
  }

  private acender(uid: number, tick: number, ctx: ContextoEventos): void {
    this.focos.set(uid, tick);
    this.queimadas.add(uid);
    ctx.populacao.bloqueadas.add(uid);
    ctx.populacao.evacuar(new Set([uid]));
  }

  private apagar(uid: number, ctx: ContextoEventos): void {
    this.focos.delete(uid);
    ctx.populacao.bloqueadas.delete(uid);
  }

  private acompanharIncendio(tick: number, ctx: ContextoEventos): EventoEspecial[] {
    // Focos de unidades demolidas somem.
    for (const uid of [...this.focos.keys()]) if (!ctx.mundo.unidades.has(uid)) this.apagar(uid, ctx);

    const inicio = Math.min(...this.focos.values());
    if ((tick - inicio) % INTERVALO_ESPALHAR === 0 && tick > inicio) this.espalhar(tick, ctx);

    let bombeiros = false;
    if (this.brigadaChega !== null) {
      if (tick >= this.brigadaChega && (tick - this.brigadaChega) % BRIGADA_INTERVALO === 0) {
        let equipes = 0;
        for (const u of ctx.mundo.unidades.values()) if (u.tipo === 'seguranca') equipes++;
        const ordem = [...this.focos.entries()].sort((a, b) => a[1] - b[1]).map(([uid]) => uid);
        for (const uid of ordem.slice(0, Math.max(1, equipes))) this.apagar(uid, ctx);
      }
    } else if (tick >= this.bombeirosChegam) {
      bombeiros = true;
      for (const uid of [...this.focos.keys()]) this.apagar(uid, ctx);
    }
    if (this.emChamas) return [];

    // Fim: danos, reparos e (se vieram) a conta dos bombeiros.
    let custo = 0;
    for (const uid of this.queimadas) {
      const u = ctx.mundo.unidades.get(uid);
      if (!u) continue;
      ctx.inquilinos.danificar(uid, ctx.populacao);
      custo += Math.round(tipo(u.tipo).custo * REPARO);
    }
    if (bombeiros) custo += BOMBEIROS_CUSTO_BASE + BOMBEIROS_CUSTO_POR_FOCO * this.queimadas.size;
    ctx.cobrar(custo);
    const danificadas = this.queimadas.size;
    this.queimadas.clear();
    this.brigadaChega = null;
    return [{ tipo: 'incendio_fim', danificadas, custo, bombeiros }];
  }

  private espalhar(tick: number, ctx: ContextoEventos): void {
    if (this.focos.size >= MAX_FOCOS) return;
    const unidades = queimaveis(ctx.mundo);
    for (const uid of [...this.focos.keys()]) {
      const u = ctx.mundo.unidades.get(uid);
      if (!u) continue;
      for (const v of unidades) {
        if (this.focos.has(v.uid) || this.focos.size >= MAX_FOCOS) continue;
        const gap = Math.max(v.x - (u.x + u.largura), u.x - (v.x + v.largura));
        const mesmoAndar = v.y === u.y && gap <= 1;
        const acima = v.y === u.y + u.altura && gap < 0;
        if ((mesmoAndar || acima) && ctx.rng.proximo() < CHANCE_ESPALHAR) this.acender(v.uid, tick, ctx);
      }
    }
  }

  // ---------------------------------------------------------------- pane

  private sortearPanes(ctx: ContextoEventos): EventoEspecial[] {
    const ev: EventoEspecial[] = [];
    for (const p of ctx.transito.pocos.values()) {
      if (!p.carros.length || p.carros.some((c) => c.pane > 0)) continue; // uma pane por poço de cada vez
      const uso = p.carros.reduce((s, c) => s + c.viagensHoje, 0) / p.carros.length;
      if (ctx.rng.proximo() >= CHANCE_PANE * (1 + uso / 25)) continue;
      const c = p.carros[ctx.rng.inteiro(0, p.carros.length - 1)]!;
      c.pane = ctx.rng.inteiro(PANE_MIN, PANE_MAX);
      this.panes.set(c.id, p.uid);
      ev.push({ tipo: 'pane', uid: p.uid, andar: c.pos });
    }
    return ev;
  }

  private acompanharPanes(ctx: ContextoEventos): EventoEspecial[] {
    const ev: EventoEspecial[] = [];
    for (const [carroId, uid] of [...this.panes]) {
      const c = ctx.transito.pocos.get(uid)?.carros.find((c) => c.id === carroId);
      if (!c || c.pane === 0) {
        this.panes.delete(carroId);
        ev.push({ tipo: 'pane_fim', uid });
      } else ctx.populacao.estressarPassageiros(c.passageiros, ESTRESSE_PANE);
    }
    return ev;
  }

  // -------------------------------------------------------------- achado

  aoEscavar(celulas: { x: number; y: number }[], ctx: ContextoEventos): EventoEspecial | null {
    if (this.achadoFeito || !this.ligado) return null;
    for (const c of celulas) {
      if (c.y > ANDAR_ACHADO || ctx.rng.proximo() >= CHANCE_ACHADO) continue;
      this.achadoFeito = true;
      const valor = 300_000 + Math.round(ctx.rng.proximo() * 400) * 1_000;
      ctx.creditar(valor);
      return { tipo: 'achado', valor, x: c.x, y: c.y };
    }
    return null;
  }
}

/** Unidades que podem pegar fogo: tudo que não é estrutura nem transporte. */
function queimaveis(m: Mundo): Unidade[] {
  return [...m.unidades.values()].filter((u) => {
    const c = tipo(u.tipo).categoria;
    return c !== 'transito' && c !== 'estrutura';
  });
}

function alturaMax(m: Mundo): number {
  let h = 0;
  for (const u of m.unidades.values()) h = Math.max(h, u.y + u.altura - 1);
  return h;
}
