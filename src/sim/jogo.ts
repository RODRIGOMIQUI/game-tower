// Estado autoritativo do jogo. Puro: sem DOM, sem render, sem relógio real.
// Dado o mesmo seed e a mesma sequência de comandos por tick, o resultado é idêntico.

import { executarPlano, planejarConstrucao, planejarDemolicao, type Contexto, type Plano } from './construcao';
import { ehElevador, tipo } from './dados';
import { Est, LARGURA, Mundo, type SnapshotMundo } from './mundo';
import { Inquilinos, type CategoriaReceita, type NivelPreco } from './inquilinos';
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
  | { tipo: 'modo'; uid: number; modo: ModoElevador }
  | { tipo: 'preco'; uid: number; nivel: NivelPreco };

export interface ResultadoComando {
  ok: boolean;
  acao: Plano['acao'] | 'elevador' | 'preco';
  feitos: number;
  /** Positivo = gasto; negativo = reembolso. */
  custo: number;
  motivo?: string;
}

/** Receitas e despesas acumuladas no trimestre corrente. */
export interface Livro {
  receitas: Record<CategoriaReceita, number>;
  construcao: number;
  manutencao: number;
}

export type EventoJogo =
  | { tipo: 'trimestre'; tick: number; manutencao: number; livro: Livro; saidas: number; caixa: number }
  | { tipo: 'falencia'; tick: number };

/** Trimestres seguidos com caixa negativo até a falência (modo carreira). */
export const TRIMESTRES_ATE_FALENCIA = 2;

function livroVazio(): Livro {
  return { receitas: { aluguel: 0, vendas: 0, hotel: 0, comida: 0 }, construcao: 0, manutencao: 0 };
}

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
  readonly inquilinos: Inquilinos;
  /** Unidades sem rota a partir da rua. */
  semAcesso: number[] = [];
  private semAcessoSet = new Set<number>();
  livro: Livro = livroVazio();
  trimestresNegativos = 0;
  /** Fim de jogo por falência: a simulação para. */
  encerrado = false;

  constructor(opts: OpcoesJogo = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.sandbox = opts.sandbox ?? false;
    this.dinheiro = opts.dinheiro ?? (this.sandbox ? DINHEIRO_SANDBOX : DINHEIRO_INICIAL);
    this.estrela = opts.estrela ?? 1;
    this.inquilinos = new Inquilinos({ creditar: (c, v) => this.creditar(c, v) });
    this.populacao = new Populacao(this.ambiente());
  }

  private creditar(categoria: CategoriaReceita, valor: number): void {
    this.dinheiro += valor;
    this.livro.receitas[categoria] += valor;
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
      comidas: [...this.mundo.unidades.values()].filter((u) => tipo(u.tipo).categoria === 'comida'),
      eventos: {
        cliente: (uid, p) => this.inquilinos.cliente(uid, p, this.mundo),
        partiu: (p) => this.inquilinos.partiu(p, this.populacao),
      },
    };
  }

  comando(cmd: Comando): ResultadoComando {
    if (cmd.tipo === 'carros') return this.mudarCarros(cmd.uid, cmd.delta);
    if (cmd.tipo === 'preco') {
      const ok = this.inquilinos.mudarPreco(cmd.uid, cmd.nivel);
      return { ok, acao: 'preco', feitos: ok ? 1 : 0, custo: 0, motivo: ok ? undefined : 'Esta unidade não tem preço' };
    }
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
      this.livro.construcao += plano.custoTotal;
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
      this.livro.construcao += preco;
      return r(true, preco);
    }
    const passageiros = p.removerCarro();
    if (!passageiros) return r(false, 0, 'Mínimo de 1 carro');
    this.populacao.replanejarEmMovimento(passageiros);
    const reembolso = -Math.round(preco * 0.25);
    this.dinheiro -= reembolso;
    this.livro.construcao += reembolso;
    return r(true, reembolso);
  }

  /** Sincroniza transporte, rotas e população depois de construir/demolir. */
  private mundoMudou(): void {
    this.versaoMundo++;
    const despejadas = this.transito.sincronizar(this.mundo);
    this.roteador.reconstruir(this.mundo, this.transito);
    this.populacao.atualizarAmbiente(this.ambiente());
    this.inquilinos.sincronizar(this.mundo);
    this.populacao.sincronizarUnidades();
    this.populacao.replanejarEmMovimento(despejadas);
    this.semAcesso = this.populacao.unidadesSemAcesso();
    this.semAcessoSet = new Set(this.semAcesso);
    this.inquilinos.atualizarVizinhanca(this.mundo, this.roteador);
  }

  private contextoEconomia() {
    return { mundo: this.mundo, populacao: this.populacao, rng: this.rng, semAcesso: this.semAcessoSet };
  }

  /** Ocupa todas as unidades vagas (testes/cenários). */
  ocuparTodas(): void {
    this.inquilinos.ocuparTodas(this.tick, this.contextoEconomia());
  }

  /** Avança `n` ticks (minutos de jogo). */
  avancar(n: number): EventoJogo[] {
    const eventos: EventoJogo[] = [];
    for (let i = 0; i < n && !this.encerrado; i++) {
      this.tick++;
      const minuto = this.tick % MIN_POR_DIA;
      if (minuto === 0) {
        this.inquilinos.fimDoDia(this.populacao);
        this.populacao.novoDia(this.tick);
      }
      if (inicioDeTrimestre(this.tick)) eventos.push(...this.fecharTrimestre());
      if (minuto % 60 === 0) this.inquilinos.hora(this.tick, this.contextoEconomia());
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

  private fecharTrimestre(): EventoJogo[] {
    const saidas = this.inquilinos.fecharTrimestre(this.populacao, this.mundo);
    const manutencao = this.manutencaoTrimestral();
    this.dinheiro -= manutencao;
    this.livro.manutencao += manutencao;
    const eventos: EventoJogo[] = [
      { tipo: 'trimestre', tick: this.tick, manutencao, livro: this.livro, saidas: saidas.length, caixa: this.dinheiro },
    ];
    this.livro = livroVazio();
    if (this.sandbox) return eventos;
    this.trimestresNegativos = this.dinheiro < 0 ? this.trimestresNegativos + 1 : 0;
    if (this.trimestresNegativos >= TRIMESTRES_ATE_FALENCIA) {
      this.encerrado = true;
      eventos.push({ tipo: 'falencia', tick: this.tick });
    }
    return eventos;
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
