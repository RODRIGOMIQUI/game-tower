// Estado autoritativo do jogo. Puro: sem DOM, sem render, sem relógio real.
// Dado o mesmo seed e a mesma sequência de comandos por tick, o resultado é idêntico.

import {
  desfazerConstrucao,
  desfazerDemolicao,
  executarPlano,
  planejarConstrucao,
  planejarDemolicao,
  type Contexto,
  type ItemPlano,
  type Plano,
} from './construcao';
import { ehElevador, tipo } from './dados';
import { Est, ESTRUTURA_POR_TIPO, LARGURA, Mundo, type SnapshotMundo } from './mundo';
import { ehLobby, VAZAO_PORTA } from './lobbies';
import { Inquilinos, POPULACAO_EXIGE_RECICLAGEM, type CategoriaReceita, type NivelPreco } from './inquilinos';
import { centro, Populacao, type Ambiente, type Entrada, type Estacionamento } from './pessoas';
import { Progressao, type EventoProgressao, type Progresso } from './progressao';
import { Eventos, type ContextoEventos, type EventoEspecial, type EventosSalvos } from './eventos';
import type { InquilinosSalvos } from './inquilinos';
import type { PopulacaoSalva } from './pessoas';
import type { ProgressaoSalva } from './progressao';
import type { PocoSalvo } from './transito';
import { avaliar, cenario, type CenarioDef } from './cenarios';
import { Estado } from './pessoas';
import { data, inicioDeTrimestre, MIN_POR_DIA, TICK_INICIAL } from './relogio';
import { Rng } from './rng';
import { Roteador } from './rotas';
import { Transito, type ModoElevador } from './transito';

/** Caixa inicial da carreira (Fase 9: era $2 milhões; o começo ficava lento demais). */
export const DINHEIRO_INICIAL = 3_000_000;
/** Caixa do modo sandbox (docs/gdd.md §12). */
export const DINHEIRO_SANDBOX = 1_000_000_000;
/** Ticks entre recálculos das rotas em cache. */
export const INTERVALO_ROTAS = 15;

export type Comando =
  | { tipo: 'construir'; item: string; x0: number; y0: number; x1: number; y1: number }
  | { tipo: 'demolir'; x0: number; y0: number; x1: number; y1: number }
  | { tipo: 'carros'; uid: number; delta: 1 | -1 }
  | { tipo: 'modo'; uid: number; modo: ModoElevador }
  | { tipo: 'preco'; uid: number; nivel: NivelPreco }
  | { tipo: 'eventos'; ligado: boolean }
  | { tipo: 'desfazer' };

export interface ResultadoComando {
  ok: boolean;
  acao: Plano['acao'] | 'elevador' | 'preco' | 'eventos' | 'desfazer';
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
  /** Despesas de eventos: bombeiros e reparos. */
  eventos: number;
}

export type EventoJogo =
  | { tipo: 'trimestre'; tick: number; manutencao: number; livro: Livro; saidas: number; caixa: number }
  | { tipo: 'falencia'; tick: number }
  | EventoProgressao
  | EventoEspecial
  | { tipo: 'cenario'; nome: string };

/** Trimestres seguidos com caixa negativo até a falência (modo carreira). */
export const TRIMESTRES_ATE_FALENCIA = 2;

function livroVazio(): Livro {
  return {
    receitas: { aluguel: 0, vendas: 0, hotel: 0, comida: 0, estacionamento: 0, outros: 0 },
    construcao: 0,
    manutencao: 0,
    eventos: 0,
  };
}

export interface OpcoesJogo {
  seed?: number;
  dinheiro?: number;
  estrela?: number;
  sandbox?: boolean;
  /** Multiplica as metas de população das estrelas (testes). */
  escalaPopulacao?: number;
  /** Eventos especiais (incêndio, pane, pragas...). Padrão: ligados. */
  eventos?: boolean;
  /** Id do cenário (docs/gdd.md §12). */
  cenario?: string;
}

/** Um ponto por dia para os relatórios. */
export interface RegistroDia {
  dia: number;
  caixa: number;
  receitas: number;
  despesas: number;
  populacao: number;
  satisfacao: number;
  espera: number;
  estresse: number;
  desistencias: number;
}
export const MAX_HISTORICO = 512;

/** Versão do formato de save; mude ao quebrar compatibilidade. */
export const VERSAO_SAVE = 1;

/** Resumo exibido na lista de jogos salvos. */
export interface MetaSave {
  tick: number;
  dinheiro: number;
  estrela: number;
  populacao: number;
  sandbox: boolean;
}

export interface Save {
  versao: number;
  meta: MetaSave;
  tick: number;
  dinheiro: number;
  sandbox: boolean;
  rng: number;
  versaoMundo: number;
  livro: Livro;
  trimestresNegativos: number;
  encerrado: boolean;
  mundo: { estrutura: string; unidades: import('./mundo').Unidade[]; proximoUid: number };
  pocos: PocoSalvo[];
  populacao: PopulacaoSalva;
  inquilinos: InquilinosSalvos;
  progressao: ProgressaoSalva;
  eventos: EventosSalvos;
  cenario?: string;
  cenarioConcluido: boolean;
  historico: RegistroDia[];
  receitasAcumuladas: number;
  ultimoRegistro: { caixa: number; receitas: number };
}

/** Ações de construir/demolir guardadas para o desfazer (docs/gdd.md §11). */
interface AcaoDesfazer {
  acao: 'construir' | 'demolir';
  itens: ItemPlano[];
  /** Unidades criadas pela construção. */
  uids: number[];
  custo: number;
}
export const MAX_DESFAZER = 50;

export class Jogo {
  mundo = new Mundo();
  tick = TICK_INICIAL;
  dinheiro: number;
  sandbox: boolean;
  rng: Rng;
  /** Incrementa sempre que o mundo muda; o render usa para saber quando redesenhar. */
  versaoMundo = 0;
  readonly transito = new Transito();
  readonly roteador = new Roteador();
  /** Rotas da equipe (podem usar elevador de serviço). */
  readonly roteadorEquipe = new Roteador(true);
  readonly progressao: Progressao;
  readonly eventos = new Eventos();
  /** Eventos gerados dentro de callbacks, entregues no fim de `avancar`. */
  private pendentes: EventoJogo[] = [];
  readonly populacao: Populacao;
  readonly inquilinos: Inquilinos;
  /** Unidades sem rota a partir da rua. */
  semAcesso: number[] = [];
  private semAcessoSet = new Set<number>();
  livro: Livro = livroVazio();
  private desfazerPilha: AcaoDesfazer[] = [];
  readonly cenario: CenarioDef | undefined;
  cenarioConcluido = false;
  historico: RegistroDia[] = [];
  private receitasAcumuladas = 0;
  private ultimoRegistro = { caixa: 0, receitas: 0 };
  trimestresNegativos = 0;
  /** Fim de jogo por falência: a simulação para. */
  encerrado = false;

  constructor(opts: OpcoesJogo = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.cenario = cenario(opts.cenario);
    if (this.cenario) {
      opts = { ...opts, dinheiro: opts.dinheiro ?? this.cenario.dinheiro, estrela: opts.estrela ?? this.cenario.estrela };
    }
    this.sandbox = opts.sandbox ?? false;
    this.dinheiro = opts.dinheiro ?? (this.sandbox ? DINHEIRO_SANDBOX : DINHEIRO_INICIAL);
    this.progressao = new Progressao(opts.escalaPopulacao ?? 1);
    this.progressao.estrela = opts.estrela ?? 1;
    this.eventos.ligado = opts.eventos ?? true;
    this.inquilinos = new Inquilinos({ creditar: (c, v) => this.creditar(c, v) });
    this.populacao = new Populacao(this.ambiente());
    this.ultimoRegistro = { caixa: this.dinheiro, receitas: 0 };
  }

  get estrela(): number {
    return this.progressao.estrela;
  }

  progresso(): Progresso {
    return this.progressao.progresso(this.contextoProgressao());
  }

  private contextoProgressao() {
    return {
      mundo: this.mundo,
      populacao: this.populacao,
      estados: this.inquilinos.estados.values(),
      semAcesso: this.semAcessoSet,
      rng: this.rng,
    };
  }

  private creditar(categoria: CategoriaReceita, valor: number): void {
    this.dinheiro += valor;
    this.receitasAcumuladas += valor;
    this.livro.receitas[categoria] += valor;
  }

  contexto(): Contexto {
    const c = this.cenario;
    return {
      dinheiro: this.dinheiro,
      estrela: this.estrela,
      ignorarEstrela: this.sandbox,
      lote: c?.lote,
      pocosRestantes: c?.maxPocos !== undefined ? c.maxPocos - this.numPocos : undefined,
    };
  }

  private ambiente(): Ambiente {
    return {
      mundo: this.mundo,
      transito: this.transito,
      roteador: this.roteador,
      rng: this.rng,
      entradas: entradas(this.mundo),
      estacionamentos: estacionamentos(this.mundo),
      comidas: [...this.mundo.unidades.values()].filter((u) => tipo(u.tipo).categoria === 'comida'),
      eventos: {
        cliente: (uid, p) => {
          this.inquilinos.cliente(uid, p, this.mundo);
          this.progressao.cliente(p);
        },
        partiu: (p) => {
          this.inquilinos.partiu(p, this.populacao, data(this.tick).diaTotal);
          this.pendentes.push(...this.progressao.partiu(p, this.tick));
        },
      },
    };
  }

  comando(cmd: Comando): ResultadoComando {
    if (cmd.tipo === 'carros') return this.mudarCarros(cmd.uid, cmd.delta);
    if (cmd.tipo === 'preco') {
      const ok = this.inquilinos.mudarPreco(cmd.uid, cmd.nivel);
      return { ok, acao: 'preco', feitos: ok ? 1 : 0, custo: 0, motivo: ok ? undefined : 'Esta unidade não tem preço' };
    }
    if (cmd.tipo === 'desfazer') return this.desfazer();
    if (cmd.tipo === 'eventos') {
      this.eventos.ligado = cmd.ligado;
      return { ok: true, acao: 'eventos', feitos: 1, custo: 0 };
    }
    if (cmd.tipo === 'modo') {
      const p = this.transito.pocos.get(cmd.uid);
      if (p) p.modo = cmd.modo;
      return { ok: !!p, acao: 'elevador', feitos: p ? 1 : 0, custo: 0, motivo: p ? undefined : 'Poço não encontrado' };
    }
    const plano =
      cmd.tipo === 'construir'
        ? planejarConstrucao(this.mundo, cmd.item, cmd.x0, cmd.y0, cmd.x1, cmd.y1, this.contexto())
        : planejarDemolicao(this.mundo, cmd.x0, cmd.y0, cmd.x1, cmd.y1, this.inquilinos.comInquilino());
    if (plano.validos > 0) {
      const uidAntes = this.mundo.proximoUid;
      executarPlano(this.mundo, plano);
      const uids: number[] = [];
      for (let u = uidAntes; u < this.mundo.proximoUid; u++) uids.push(u);
      this.desfazerPilha.push({ acao: plano.acao, itens: plano.itens.filter((i) => i.ok), uids, custo: plano.custoTotal });
      if (this.desfazerPilha.length > MAX_DESFAZER) this.desfazerPilha.shift();
      this.dinheiro -= plano.custoTotal;
      this.livro.construcao += plano.custoTotal;
      this.mundoMudou();
      if (cmd.tipo === 'construir' && cmd.item === 'escavacao') {
        const achado = this.eventos.aoEscavar(plano.itens.filter((i) => i.ok), this.contextoEventos());
        if (achado) this.pendentes.push(achado);
      }
    }
    return {
      ok: plano.validos > 0,
      acao: plano.acao,
      feitos: plano.validos,
      custo: plano.custoTotal,
      motivo: plano.motivo,
    };
  }

  get podeDesfazer(): number {
    return this.desfazerPilha.length;
  }

  /** Desfaz a última construção/demolição, devolvendo (ou cobrando de volta) o valor. */
  private desfazer(): ResultadoComando {
    const r = (ok: boolean, custo: number, motivo?: string): ResultadoComando => ({
      ok, acao: 'desfazer', feitos: ok ? 1 : 0, custo, motivo,
    });
    const a = this.desfazerPilha[this.desfazerPilha.length - 1];
    if (!a) return r(false, 0, 'Nada para desfazer');
    // Desfazer construção devolve o gasto; desfazer demolição cobra o reembolso de volta.
    const custo = -a.custo;
    if (custo > this.dinheiro) return r(false, 0, 'Dinheiro insuficiente para desfazer');
    let motivo: string | undefined;
    const ocupadas = this.inquilinos.comInquilino();
    if (a.acao === 'construir' && a.uids.some((u) => ocupadas.has(u))) {
      return r(false, 0, 'Já tem inquilino ou foi vendida: use Demolir');
    }
    if (a.acao === 'construir') motivo = desfazerConstrucao(this.mundo, a.itens, a.uids);
    else {
      const res = desfazerDemolicao(this.mundo, a.itens);
      motivo = res.motivo;
      // As unidades reconstruídas têm uid novo: atualiza as ações anteriores.
      for (const ant of this.desfazerPilha) {
        ant.uids = ant.uids.map((u) => res.uids.get(u) ?? u);
        for (const it of ant.itens) if (it.uid) it.uid = res.uids.get(it.uid) ?? it.uid;
      }
    }
    if (motivo) return r(false, 0, motivo);
    this.desfazerPilha.pop();
    this.dinheiro -= custo;
    this.livro.construcao += custo;
    this.mundoMudou();
    return r(true, custo);
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
    this.roteadorEquipe.reconstruir(this.mundo, this.transito);
    this.populacao.atualizarAmbiente(this.ambiente());
    this.inquilinos.sincronizar(this.mundo);
    this.populacao.sincronizarUnidades();
    this.populacao.replanejarEmMovimento(despejadas);
    this.semAcesso = this.populacao.unidadesSemAcesso();
    this.semAcessoSet = new Set(this.semAcesso);
    this.inquilinos.atualizarVizinhanca(this.mundo, this.roteador, this.roteadorEquipe);
  }

  private contextoEconomia() {
    return {
      mundo: this.mundo,
      populacao: this.populacao,
      rng: this.rng,
      semAcesso: this.semAcessoSet,
      estrela: this.estrela,
      eventos: this.eventos.ligado,
      festival: this.eventos.festival,
    };
  }

  private contextoEventos(): ContextoEventos {
    return {
      mundo: this.mundo,
      populacao: this.populacao,
      inquilinos: this.inquilinos,
      transito: this.transito,
      roteadorEquipe: this.roteadorEquipe,
      rng: this.rng,
      estrela: this.estrela,
      cobrar: (v) => {
        this.dinheiro -= v;
        this.livro.eventos += v;
      },
      creditar: (v) => this.creditar('outros', v),
    };
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
        const dia = data(this.tick).diaTotal;
        this.registrarDia(dia);
        this.inquilinos.fimDoDia(this.populacao, this.semReciclagem(), dia);
        this.inquilinos.pragas(this.mundo, dia, this.eventos.ligado);
        this.eventos.diario(this.transito);
        const carros = this.populacao.consumirUsosEstacionamento();
        if (carros) this.creditar('estacionamento', carros * tipo('estacionamento').receita_valor);
        this.populacao.novoDia(this.tick);
        eventos.push(...this.progressao.diario(this.tick, this.contextoProgressao()));
      }
      if (inicioDeTrimestre(this.tick)) eventos.push(...this.fecharTrimestre());
      if (minuto % 60 === 0) {
        eventos.push(...this.eventos.hora(this.tick, this.contextoEventos()));
        this.inquilinos.hora(this.tick, this.contextoEconomia());
        eventos.push(...this.progressao.hora(this.tick, this.contextoProgressao()));
        if (this.cenario && !this.cenarioConcluido && minuto === 23 * 60 && this.avaliarCenario().ok) {
          this.cenarioConcluido = true;
          eventos.push({ tipo: 'cenario', nome: this.cenario.nome });
        }
      }
      // Filas mudam ao longo do dia: rotas são recalculadas a cada 15 minutos.
      if (minuto % INTERVALO_ROTAS === 0) this.roteador.limparCache();
      this.transito.passo(this.tick, Math.floor(minuto / 60), this.populacao);
      this.populacao.passo(this.tick);
      if (this.eventos.emChamas || this.eventos.temPanes) eventos.push(...this.eventos.passo(this.tick, this.contextoEventos()));
      if (this.inquilinos.pendentes.length) {
        eventos.push(...this.inquilinos.pendentes);
        this.inquilinos.pendentes = [];
      }
      if (this.pendentes.length) {
        eventos.push(...this.pendentes);
        this.pendentes = [];
      }
    }
    return eventos;
  }

  avaliarCenario() {
    let hospedes = 0;
    for (const p of this.populacao.pessoas.values()) if (p.tipo === 'hospede' && p.estado === Estado.NaUnidade) hospedes++;
    return avaliar(this.cenario!, {
      populacao: this.populacaoTotal(),
      hospedesAgora: hospedes,
      estados: this.inquilinos.estados.values(),
    });
  }

  /** Meia-noite: um ponto do histórico para os relatórios. */
  private registrarDia(dia: number): void {
    const est = this.populacao.estatisticas();
    let satisfacao = 0;
    let n = 0;
    for (const e of this.inquilinos.estados.values()) {
      if (e.situacao === 'vaga') continue;
      satisfacao += e.satisfacao;
      n++;
    }
    const pocos = [...this.transito.pocos.values()];
    const receitas = this.receitasAcumuladas - this.ultimoRegistro.receitas;
    const variacao = this.dinheiro - this.ultimoRegistro.caixa;
    this.historico.push({
      dia: dia - 1,
      caixa: this.dinheiro,
      receitas,
      despesas: receitas - variacao,
      populacao: est.total,
      satisfacao: n ? satisfacao / n : 0,
      espera: pocos.length ? pocos.reduce((s, p) => s + p.esperaMedia, 0) / pocos.length : 0,
      estresse: est.estresseMedio,
      desistencias: est.desistenciasHoje,
    });
    if (this.historico.length > MAX_HISTORICO) this.historico.shift();
    this.ultimoRegistro = { caixa: this.dinheiro, receitas: this.receitasAcumuladas };
  }

  // ---------------------------------------------------------- salvar jogo

  meta(): MetaSave {
    return { tick: this.tick, dinheiro: this.dinheiro, estrela: this.estrela, populacao: this.populacaoTotal(), sandbox: this.sandbox };
  }

  /**
   * Estado completo, serializável em JSON. As rotas em cache não são salvas;
   * por isso o cache também é limpo aqui, e o jogo original e o carregado
   * continuam idênticos daqui em diante.
   */
  salvar(): Save {
    this.roteador.limparCache();
    this.roteadorEquipe.limparCache();
    return structuredClone({
      versao: VERSAO_SAVE,
      meta: this.meta(),
      tick: this.tick,
      dinheiro: this.dinheiro,
      sandbox: this.sandbox,
      rng: this.rng.estado,
      versaoMundo: this.versaoMundo,
      livro: this.livro,
      trimestresNegativos: this.trimestresNegativos,
      encerrado: this.encerrado,
      mundo: {
        estrutura: paraBase64(this.mundo.estrutura),
        unidades: [...this.mundo.unidades.values()],
        proximoUid: this.mundo.proximoUid,
      },
      pocos: this.transito.exportar(),
      populacao: this.populacao.exportar(),
      inquilinos: this.inquilinos.exportar(),
      progressao: this.progressao.exportar(),
      eventos: this.eventos.exportar(),
      cenario: this.cenario?.id,
      cenarioConcluido: this.cenarioConcluido,
      historico: this.historico,
      receitasAcumuladas: this.receitasAcumuladas,
      ultimoRegistro: this.ultimoRegistro,
    });
  }

  static carregar(s: Save): Jogo {
    if (s.versao !== VERSAO_SAVE) throw new Error(`Save da versão ${s.versao}; esta versão do jogo lê a ${VERSAO_SAVE}.`);
    const j = new Jogo({ sandbox: s.sandbox, escalaPopulacao: s.progressao.escala, dinheiro: s.dinheiro, cenario: s.cenario });
    j.cenarioConcluido = s.cenarioConcluido;
    j.historico = structuredClone(s.historico);
    j.receitasAcumuladas = s.receitasAcumuladas;
    j.ultimoRegistro = { ...s.ultimoRegistro };
    const ocupacao = new Int32Array(j.mundo.ocupacao.length);
    j.mundo = new Mundo({ estrutura: deBase64(s.mundo.estrutura), ocupacao, unidades: [], proximoUid: s.mundo.proximoUid });
    for (const u of s.mundo.unidades) {
      j.mundo.proximoUid = u.uid;
      j.mundo.adicionarUnidade(u.tipo, u.x, u.y, u.largura, u.altura);
    }
    j.mundo.proximoUid = s.mundo.proximoUid;
    j.tick = s.tick;
    j.rng.estado = s.rng;
    j.versaoMundo = s.versaoMundo;
    j.livro = structuredClone(s.livro);
    j.trimestresNegativos = s.trimestresNegativos;
    j.encerrado = s.encerrado;
    j.transito.sincronizar(j.mundo);
    j.transito.importar(s.pocos);
    j.roteador.reconstruir(j.mundo, j.transito);
    j.roteadorEquipe.reconstruir(j.mundo, j.transito);
    j.populacao.atualizarAmbiente(j.ambiente());
    j.populacao.importar(s.populacao);
    j.inquilinos.importar(s.inquilinos);
    j.progressao.importar(s.progressao);
    j.eventos.importar(s.eventos);
    j.inquilinos.atualizarLobby(j.mundo);
    j.semAcesso = j.populacao.unidadesSemAcesso();
    j.semAcessoSet = new Set(j.semAcesso);
    j.roteador.limparCache();
    j.roteadorEquipe.limparCache();
    return j;
  }

  /** Acima de 3.000 pessoas, a torre precisa de reciclagem (docs/gdd.md §7). */
  semReciclagem(): boolean {
    if (this.populacao.total <= POPULACAO_EXIGE_RECICLAGEM) return false;
    for (const u of this.mundo.unidades.values()) if (u.tipo === 'reciclagem') return false;
    return true;
  }

  manutencaoTrimestral(): number {
    let total = this.transito.manutencaoTrimestral() + manutencaoLobbies(this.mundo);
    for (const u of this.mundo.unidades.values()) total += tipo(u.tipo).manutencao_tri;
    return total;
  }

  /** População = moradores + funcionários + hóspedes. */
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

  /** Posições dos carros para o render: [uid, pos, carga, capacidade, pane] por carro. */
  carros(): Float32Array {
    const r: number[] = [];
    for (const p of this.transito.pocos.values()) {
      for (const c of p.carros) r.push(p.uid, c.pos, c.passageiros.length, p.capacidade, c.pane > 0 ? 1 : 0);
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

/** Estacionamentos que têm rampa no mesmo andar. */
function estacionamentos(m: Mundo): Estacionamento[] {
  const unidades = [...m.unidades.values()];
  const comRampa = new Set(unidades.filter((u) => u.tipo === 'rampa_estacionamento').map((u) => u.y));
  return unidades
    .filter((u) => u.tipo === 'estacionamento' && comRampa.has(u.y))
    .map((u) => ({ uid: u.uid, x: centro(u), y: u.y, vagas: tipo(u.tipo).capacidade }));
}

/**
 * Entradas do prédio: pontas de cada trecho do térreo que tenha lobby, e
 * estações de metrô. A vazão das portas vem da melhor variante de lobby do trecho.
 */
function entradas(m: Mundo): Entrada[] {
  const r: Entrada[] = [];
  for (const u of m.unidades.values()) {
    if (u.tipo === 'metro') r.push({ x: centro(u), y: u.y + u.altura - 1, tipo: 'metro' });
  }
  let ini = -1;
  let vazao = 0;
  for (let x = 0; x <= LARGURA; x++) {
    const e = x < LARGURA ? m.est(x, 0) : Est.Vazio;
    if (e !== Est.Vazio) {
      if (ini < 0) ini = x;
      if (ehLobby(e)) vazao = Math.max(vazao, VAZAO_PORTA[e]!);
    } else if (ini >= 0) {
      if (vazao) r.push({ x: ini + 0.5, y: 0, tipo: 'rua', vazao }, { x: x - 0.5, y: 0, tipo: 'rua', vazao });
      ini = -1;
      vazao = 0;
    }
  }
  return r;
}

/** Manutenção das células de lobby do térreo (variantes cobram por coluna). */
function manutencaoLobbies(m: Mundo): number {
  let total = 0;
  for (let x = 0; x < LARGURA; x++) {
    const e = m.est(x, 0);
    if (!ehLobby(e)) continue;
    const id = Object.keys(ESTRUTURA_POR_TIPO).find((k) => ESTRUTURA_POR_TIPO[k] === e)!;
    total += tipo(id).manutencao_tri;
  }
  return total;
}

function paraBase64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

function deBase64(t: string): Uint8Array {
  const bin = atob(t);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
