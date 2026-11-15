// Mensagens entre o thread principal (render/UI) e o Worker da simulação.
import type { Comando, EventoJogo, ResultadoComando } from '../sim/jogo';
import type { SnapshotMundo } from '../sim/mundo';
import type { Velocidade } from '../sim/relogio';

export type ParaSim =
  | { tipo: 'iniciar'; seed: number; sandbox: boolean }
  | { tipo: 'comando'; id: number; cmd: Comando }
  | { tipo: 'velocidade'; v: Velocidade };

export interface EstadoResumo {
  tick: number;
  dinheiro: number;
  estrela: number;
  populacao: number;
  velocidade: Velocidade;
  sandbox: boolean;
}

export type DaSim =
  | { tipo: 'estado'; estado: EstadoResumo }
  | { tipo: 'mundo'; versao: number; mundo: SnapshotMundo }
  | { tipo: 'resultado'; id: number; resultado: ResultadoComando }
  | { tipo: 'eventos'; eventos: EventoJogo[] };
