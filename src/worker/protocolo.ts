// Mensagens entre o thread principal (render/UI) e o Worker da simulação.
import type { Comando, EventoJogo, Livro, RegistroDia, ResultadoComando, ResumoPoco } from '../sim/jogo';
import type { SlotSalvo } from './armazenamento';
import type { Contexto } from '../sim/construcao';
import type { EstadoUnidade } from '../sim/inquilinos';
import type { Progresso } from '../sim/progressao';
import type { FichaPessoa } from '../sim/pessoas';
import type { Estatisticas } from '../sim/pessoas';
import type { SnapshotMundo } from '../sim/mundo';
import type { Velocidade } from '../sim/relogio';

/** Como começar uma partida. */
export interface NovoJogo {
  seed: number;
  sandbox: boolean;
  cenario?: string;
}

export type ParaSim =
  | { tipo: 'iniciar'; novo: NovoJogo }
  | { tipo: 'salvar'; slot: string }
  | { tipo: 'carregar'; slot: string }
  | { tipo: 'listarSaves' }
  | { tipo: 'exportar' }
  | { tipo: 'importar'; dados: ArrayBuffer }
  | { tipo: 'relatorio' }
  | { tipo: 'comando'; id: number; cmd: Comando }
  | { tipo: 'velocidade'; v: Velocidade }
  | { tipo: 'inspecionar'; uid: number }
  | { tipo: 'inspecionarPessoa'; id: number }
  /** Só em desenvolvimento: dispara eventos para testar o visual. */
  | { tipo: 'depurar'; acao: 'incendio' | 'pane' | 'festival' };

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
  eventosLigados: boolean;
  podeDesfazer: number;
  /** Regras de construção atuais (estrela, sandbox, lote/poços do cenário), para a prévia. */
  contexto: Contexto;
  cenario: { nome: string; objetivo: string; progresso: string; concluido: boolean } | null;
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
  /** [uid do poço, andar, carga, capacidade, pane] por carro. */
  carros: Float32Array;
  pocos: ResumoPoco[];
  semAcesso: number[];
  /** [uid, situação, satisfação, avisos, ruído, estresse] por unidade com economia. */
  unidades: Float32Array;
  versaoUnidades: number;
  inspecao: Inspecao | null;
  /** Unidades em chamas. */
  focos: number[];
  festival: boolean;
  ficha: FichaPessoa | null;
}

export type DaSim =
  | { tipo: 'estado'; estado: EstadoResumo }
  | { tipo: 'mundo'; versao: number; mundo: SnapshotMundo }
  | ({ tipo: 'dinamico' } & Dinamico)
  | { tipo: 'resultado'; id: number; resultado: ResultadoComando }
  | { tipo: 'eventos'; eventos: EventoJogo[] }
  | { tipo: 'saves'; lista: SlotSalvo[] }
  | { tipo: 'salvo'; slot: string; ok: boolean; erro?: string }
  | { tipo: 'carregado'; ok: boolean; erro?: string }
  | { tipo: 'exportado'; dados: ArrayBuffer; nome: string }
  | { tipo: 'relatorio'; historico: RegistroDia[] };
