// Mensagens entre o thread principal (render/UI) e o Worker da simulação.
import type { Comando, EventoJogo, Livro, ResultadoComando, ResumoPoco } from '../sim/jogo';
import type { EstadoUnidade } from '../sim/inquilinos';
import type { Progresso } from '../sim/progressao';
import type { Estatisticas } from '../sim/pessoas';
import type { SnapshotMundo } from '../sim/mundo';
import type { Velocidade } from '../sim/relogio';

export type ParaSim =
  | { tipo: 'iniciar'; seed: number; sandbox: boolean }
  | { tipo: 'comando'; id: number; cmd: Comando }
  | { tipo: 'velocidade'; v: Velocidade }
  | { tipo: 'inspecionar'; uid: number };

export interface EstadoResumo {
  tick: number;
  dinheiro: number;
  estrela: number;
  populacao: number;
  velocidade: Velocidade;
  sandbox: boolean;
  pessoas: Estatisticas;
  /** Receitas e despesas do trimestre corrente. */
  livro: Livro;
  encerrado: boolean;
  progresso: Progresso;
}

/** Detalhes da unidade inspecionada. */
export interface Inspecao {
  estado: EstadoUnidade | null;
  expectativa: number;
  ocupantes: number;
  lotacao: number;
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
  /** [uid, situação, satisfação, avisos] por unidade com economia. */
  unidades: Float32Array;
  versaoUnidades: number;
  inspecao: Inspecao | null;
}

export type DaSim =
  | { tipo: 'estado'; estado: EstadoResumo }
  | { tipo: 'mundo'; versao: number; mundo: SnapshotMundo }
  | ({ tipo: 'dinamico' } & Dinamico)
  | { tipo: 'resultado'; id: number; resultado: ResultadoComando }
  | { tipo: 'eventos'; eventos: EventoJogo[] };
