// Estado autoritativo do jogo. Puro: sem DOM, sem render, sem relógio real.
// Dado o mesmo seed e a mesma sequência de comandos por tick, o resultado é idêntico.

import { executarPlano, planejarConstrucao, planejarDemolicao, type Contexto, type Plano } from './construcao';
import { ehElevador, tipo } from './dados';
import { Est, LARGURA, Mundo, type SnapshotMundo } from './mundo';
import { Populacao, type Ambiente } from './pessoas';
import { inicioDeTrimestre, MIN_POR_DIA, TICK_INICIAL } from './relogio';
import { Rng } from './rng';
import { Roteador } from './rotas';
import { Transito, type ModoElevador } from './transito';

export const DINHEIRO_INICIAL = 2_000_000;
/** Caixa do modo sandbox (docs/gdd.md §12). */
export const DINHEIRO_SANDBOX = 1_000_000_000;
/** Ticks entre recálculos das rotas em cache. */
export const INTERVALO_ROTAS = 15;

export type Comando =
  | { tipo: 'construir'; item: string; x0: number; y0: number; x1: number; y1: number }
  | { tipo: 'demolir'; x0: number; y0: number; x1: number; y1: number }
  | { tipo: 'carros'; uid: number; delta: 1 | -1 }
  | { tipo: 'modo'; uid: number; modo: ModoElevador };

export interface ResultadoComando {
  ok: boolean;
  acao: Plano['acao'] | 'elevador';
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
  readonly transito = new Transito();
  readonly roteador = new Roteador();
  readonly populacao: Populacao;
  /** Unidades sem rota a partir da rua. */
  semAcesso: number[] = [];

  constructor(opts: OpcoesJogo = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.sandbox = opts.sandbox ?? false;
    this.dinheiro = opts.dinheiro ?? (this.sandbox ? DINHEIRO_SANDBOX : DINHEIRO_INICIAL);
    this.estrela = opts.estrela ?? 1;
    this.populacao = new Populacao(this.ambiente());
  }

  contexto(): Contexto {
    return { dinheiro: this.dinheiro, estrela: this.estrela, ignorarEstrela: this.sandbox };
  }

  private ambiente(): Ambiente {
    return {
      mundo: this.mundo,
      transito: this.transito,
      roteador: this.roteador,
      rng: this.rng,
      entradas: entradas(this.mundo),
      lanchonetes: [...this.mundo.unidades.values()].filter((u) => u.tipo === 'lanchonete'),
    };
  }

  comando(cmd: Comando): ResultadoComando {
    if (cmd.tipo === 'carros') return this.mudarCarros(cmd.uid, cmd.delta);
    if (cmd.tipo === 'modo') {
      const p = this.transito.pocos.get(cmd.uid);
      if (p) p.modo = cmd.modo;
      return { ok: !!p, acao: 'elevador', feitos: p ? 1 : 0, custo: 0, motivo: p ? undefined : 'Poço não encontrado' };
    }
    const plano =
      cmd.tipo === 'construir'
        ? planejarConstrucao(this.mundo, cmd.item, cmd.x0, cmd.y0, cmd.x1, cmd.y1, this.contexto())
        : planejarDemolicao(this.mundo, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
    if (plano.validos > 0) {
      executarPlano(this.mundo, plano);
      this.dinheiro -= plano.custoTotal;
      this.mundoMudou();
    }
    return {
      ok: plano.validos > 0,
      acao: plano.acao,
      feitos: plano.validos,
      custo: plano.custoTotal,
      motivo: plano.motivo,
    };
  }

  private mudarCarros(uid: number, delta: 1 | -1): ResultadoComando {
    const p = this.transito.pocos.get(uid);
    const r = (ok: boolean, custo: number, motivo?: string): ResultadoComando => ({
      ok, acao: 'elevador', feitos: ok ? 1 : 0, custo, motivo,
    });
    if (!p) return r(false, 0, 'Poço não encontrado');
    const preco = tipo(p.tipo).custo_extra;
    if (delta > 0) {
      if (preco > this.dinheiro) return r(false, 0, 'Dinheiro insuficiente');
      if (!p.adicionarCarro()) return r(false, 0, 'Máximo de carros');
      this.dinheiro -= preco;
      return r(true, preco);
    }
    const passageiros = p.removerCarro();
    if (!passageiros) return r(false, 0, 'Mínimo de 1 carro');
    this.populacao.replanejarEmMovimento(passageiros);
    const reembolso = -Math.round(preco * 0.25);
    this.dinheiro -= reembolso;
    return r(true, reembolso);
  }

  /** Sincroniza transporte, rotas e população depois de construir/demolir. */
  private mundoMudou(): void {
    this.versaoMundo++;
    const despejadas = this.transito.sincronizar(this.mundo);
    this.roteador.reconstruir(this.mundo, this.transito);
    this.populacao.atualizarAmbiente(this.ambiente());
    this.populacao.sincronizarUnidades(this.tick);
    this.populacao.replanejarEmMovimento(despejadas);
    this.semAcesso = this.populacao.unidadesSemAcesso();
  }

  /** Avança `n` ticks (minutos de jogo). */
  avancar(n: number): EventoJogo[] {
    const eventos: EventoJogo[] = [];
    for (let i = 0; i < n; i++) {
      this.tick++;
      const minuto = this.tick % MIN_POR_DIA;
      if (minuto === 0) this.populacao.novoDia(this.tick);
      if (inicioDeTrimestre(this.tick)) eventos.push(this.fecharTrimestre());
      // Filas mudam ao longo do dia: rotas são recalculadas a cada 15 minutos.
      if (minuto % INTERVALO_ROTAS === 0) this.roteador.limparCache();
      this.transito.passo(this.tick, Math.floor(minuto / 60), this.populacao);
      this.populacao.passo(this.tick);
    }
    return eventos;
  }

  manutencaoTrimestral(): number {
    let total = this.transito.manutencaoTrimestral();
    for (const u of this.mundo.unidades.values()) total += tipo(u.tipo).manutencao_tri;
    return total;
  }

  /** População = moradores + funcionários (+ hóspedes nas próximas fases). */
  populacaoTotal(): number {
    return this.populacao.total;
  }

  private fecharTrimestre(): EventoJogo {
    const manutencao = this.manutencaoTrimestral();
    this.dinheiro -= manutencao;
    return { tipo: 'trimestre', tick: this.tick, manutencao };
  }

  snapshotMundo(): SnapshotMundo {
    return this.mundo.snapshot();
  }

  /** Posições dos carros para o render: [uid, pos, carga, capacidade] por carro. */
  carros(): Float32Array {
    const r: number[] = [];
    for (const p of this.transito.pocos.values()) {
      for (const c of p.carros) r.push(p.uid, c.pos, c.passageiros.length, p.capacidade);
    }
    return new Float32Array(r);
  }

  resumoPocos(): ResumoPoco[] {
    return [...this.transito.pocos.values()].map((p) => ({
      uid: p.uid,
      carros: p.carros.length,
      modo: p.modo,
      esperaMedia: p.esperaMedia,
      aguardando: p.aguardando(),
      atendidos: p.atendidos,
    }));
  }

  /** Total de elevadores (para testes). */
  get numPocos(): number {
    let n = 0;
    for (const u of this.mundo.unidades.values()) if (ehElevador(u.tipo)) n++;
    return n;
  }
}

export interface ResumoPoco {
  uid: number;
  carros: number;
  modo: ModoElevador;
  esperaMedia: number;
  aguardando: number;
  atendidos: number;
}

/** Entradas do prédio: pontas de cada trecho do térreo que tenha lobby. */
function entradas(m: Mundo): number[] {
  const r: number[] = [];
  let ini = -1;
  let temLobby = false;
  for (let x = 0; x <= LARGURA; x++) {
    const e = x < LARGURA ? m.est(x, 0) : Est.Vazio;
    if (e !== Est.Vazio) {
      if (ini < 0) ini = x;
      if (e === Est.Lobby) temLobby = true;
    } else if (ini >= 0) {
      if (temLobby) r.push(ini + 0.5, x - 0.5);
      ini = -1;
      temLobby = false;
    }
  }
  return r;
}
