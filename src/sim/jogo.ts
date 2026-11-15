// Estado autoritativo do jogo. Puro: sem DOM, sem render, sem relógio real.
// Dado o mesmo seed e a mesma sequência de comandos por tick, o resultado é idêntico.

import { executarPlano, planejarConstrucao, planejarDemolicao, type Contexto, type Plano } from './construcao';
import { tipo } from './dados';
import { Mundo, type SnapshotMundo } from './mundo';
import { inicioDeTrimestre, TICK_INICIAL } from './relogio';
import { Rng } from './rng';

export const DINHEIRO_INICIAL = 2_000_000;

export type Comando =
  | { tipo: 'construir'; item: string; x0: number; y0: number; x1: number; y1: number }
  | { tipo: 'demolir'; x0: number; y0: number; x1: number; y1: number };

export interface ResultadoComando {
  ok: boolean;
  acao: Plano['acao'];
  feitos: number;
  /** Positivo = gasto; negativo = reembolso. */
  custo: number;
  motivo?: string;
}

export type EventoJogo = { tipo: 'trimestre'; tick: number; manutencao: number };

export interface OpcoesJogo {
  seed?: number;
  dinheiro?: number;
  estrela?: number;
  sandbox?: boolean;
}

export class Jogo {
  mundo = new Mundo();
  tick = TICK_INICIAL;
  dinheiro: number;
  estrela: number;
  sandbox: boolean;
  rng: Rng;
  /** Incrementa sempre que o mundo muda; o render usa para saber quando redesenhar. */
  versaoMundo = 0;

  constructor(opts: OpcoesJogo = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.dinheiro = opts.dinheiro ?? DINHEIRO_INICIAL;
    this.estrela = opts.estrela ?? 1;
    this.sandbox = opts.sandbox ?? false;
  }

  contexto(): Contexto {
    return { dinheiro: this.dinheiro, estrela: this.estrela, ignorarEstrela: this.sandbox };
  }

  comando(cmd: Comando): ResultadoComando {
    const plano =
      cmd.tipo === 'construir'
        ? planejarConstrucao(this.mundo, cmd.item, cmd.x0, cmd.y0, cmd.x1, cmd.y1, this.contexto())
        : planejarDemolicao(this.mundo, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
    if (plano.validos > 0) {
      executarPlano(this.mundo, plano);
      this.dinheiro -= plano.custoTotal;
      this.versaoMundo++;
    }
    return {
      ok: plano.validos > 0,
      acao: plano.acao,
      feitos: plano.validos,
      custo: plano.custoTotal,
      motivo: plano.motivo,
    };
  }

  /** Avança `n` ticks (minutos de jogo). */
  avancar(n: number): EventoJogo[] {
    const eventos: EventoJogo[] = [];
    for (let i = 0; i < n; i++) {
      this.tick++;
      if (inicioDeTrimestre(this.tick)) eventos.push(this.fecharTrimestre());
    }
    return eventos;
  }

  manutencaoTrimestral(): number {
    let total = 0;
    for (const u of this.mundo.unidades.values()) total += tipo(u.tipo).manutencao_tri;
    return total;
  }

  /** População = moradores + funcionários + hóspedes. Sem agentes ainda (Fase 2), é 0. */
  populacao(): number {
    return 0;
  }

  private fecharTrimestre(): EventoJogo {
    const manutencao = this.manutencaoTrimestral();
    this.dinheiro -= manutencao;
    return { tipo: 'trimestre', tick: this.tick, manutencao };
  }

  snapshotMundo(): SnapshotMundo {
    return this.mundo.snapshot();
  }
}
