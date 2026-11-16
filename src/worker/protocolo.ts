// Mensagens entre o thread principal (render/UI) e o Worker da simulação.
import type { Comando, EventoJogo, ResultadoComando, ResumoPoco } from '../sim/jogo';
import type { Estatisticas } from '../sim/pessoas';
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
  pessoas: Estatisticas;
}

/** Estado que muda a cada tick (posições). Enviado junto com 'estado'. */
export interface Dinamico {
  tick: number;
  /** [id, x, y, humor] por pessoa visível. */
  pessoas: Float32Array;
  /** [uid do poço, andar, carga, capacidade] por carro. */
  carros: Float32Array;
  pocos: ResumoPoco[];
  semAcesso: number[];
}

export type DaSim =
  | { tipo: 'estado'; estado: EstadoResumo }
  | { tipo: 'mundo'; versao: number; mundo: SnapshotMundo }
  | ({ tipo: 'dinamico' } & Dinamico)
  | { tipo: 'resultado'; id: number; resultado: ResultadoComando }
  | { tipo: 'eventos'; eventos: EventoJogo[] };
