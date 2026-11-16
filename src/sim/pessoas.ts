// Pessoas (agentes): agenda diária, deslocamento pelas rotas e estresse.
// Ver docs/gdd.md §5.

import { tipo } from './dados';
import type { Mundo, Unidade } from './mundo';
import { data, MIN_POR_DIA } from './relogio';
import type { Rng } from './rng';
import { VEL_CAMINHADA, type Perna, type Roteador } from './rotas';
import type { Carro, Passageiros, Poco, Transito } from './transito';

export const Estado = {
  Fora: 0,
  Andando: 1,
  Esperando: 2,
  NoElevador: 3,
  NaEscada: 4,
  NaUnidade: 5,
} as const;
export type CodigoEstado = (typeof Estado)[keyof typeof Estado];

export type TipoPessoa = 'funcionario' | 'morador';

/** Unidades que geram moradores/funcionários fixos. */
export const MORADORES_POR_TIPO: Record<string, TipoPessoa> = {
  escritorio: 'funcionario',
  apartamento: 'morador',
};

/** Ticks de espera por elevador tolerados antes de o estresse subir. */
export const PACIENCIA: Record<TipoPessoa, number> = { funcionario: 30, morador: 45 };
/** Estresse ganho por tick de espera além da paciência. */
export const ESTRESSE_POR_TICK = 1.5;
export const ESTRESSE_IRRITADO = 40;
export const ESTRESSE_FURIOSO = 70;
/** Duração do almoço (ticks). */
export const TEMPO_ALMOCO = 30;

type Acao = 'ir_casa' | 'sair' | 'almocar';
interface Compromisso {
  minuto: number;
  acao: Acao;
}

type Destino = { tipo: 'casa' } | { tipo: 'fora' } | { tipo: 'almoco'; uid: number };

export interface Pessoa {
  id: number;
  tipo: TipoPessoa;
  /** Unidade de vínculo (escritório ou apartamento). */
  casa: number;
  estado: CodigoEstado;
  /** Coluna (fracionária) e andar. */
  x: number;
  y: number;
  rota: Perna[] | null;
  perna: number;
  destino: Destino | null;
  /** Unidade onde está (NaUnidade). */
  local: number;
  agenda: Compromisso[];
  proximo: number;
  /** Tick em que termina a atividade atual (almoço, escada). */
  ate: number;
  poco: number;
  carro: number;
  desde: number;
  andarDestino: number;
  escadaDe: number;
  estresse: number;
}

export interface Ambiente {
  mundo: Mundo;
  transito: Transito;
  roteador: Roteador;
  rng: Rng;
  /** Pontos de entrada no térreo (coluna). */
  entradas: number[];
  /** Unidades onde se almoça. */
  lanchonetes: Unidade[];
}

export interface Estatisticas {
  total: number;
  noPredio: number;
  esperando: number;
  desistenciasHoje: number;
  estresseMedio: number;
}

export class Populacao implements Passageiros {
  readonly pessoas = new Map<number, Pessoa>();
  private readonly porUnidade = new Map<number, number[]>();
  private readonly ocupacaoLanchonete = new Map<number, number>();
  private proximoId = 1;
  private tickAtual = 0;
  desistenciasHoje = 0;

  constructor(private amb: Ambiente) {}

  atualizarAmbiente(amb: Ambiente): void {
    this.amb = amb;
  }

  get total(): number {
    return this.pessoas.size;
  }

  // ---------------------------------------------------------- moradores

  /** Cria pessoas para unidades novas e remove as de unidades demolidas. */
  sincronizarUnidades(tick: number): void {
    const { mundo } = this.amb;
    for (const [uid, ids] of this.porUnidade) {
      if (mundo.unidades.has(uid)) continue;
      for (const id of ids) this.remover(id);
      this.porUnidade.delete(uid);
    }
    for (const [uid] of this.ocupacaoLanchonete) if (!mundo.unidades.has(uid)) this.ocupacaoLanchonete.delete(uid);
    for (const u of mundo.unidades.values()) {
      const tp = MORADORES_POR_TIPO[u.tipo];
      if (!tp || this.porUnidade.has(u.uid)) continue;
      const ids: number[] = [];
      for (let i = 0; i < tipo(u.tipo).populacao; i++) ids.push(this.criar(tp, u, tick));
      this.porUnidade.set(u.uid, ids);
    }
  }

  private criar(tp: TipoPessoa, casa: Unidade, tick: number): number {
    const p: Pessoa = {
      id: this.proximoId++, tipo: tp, casa: casa.uid, estado: Estado.Fora, x: 0, y: 0,
      rota: null, perna: 0, destino: null, local: 0, agenda: [], proximo: 0, ate: 0,
      poco: 0, carro: 0, desde: 0, andarDestino: 0, escadaDe: 0, estresse: 0,
    };
    this.pessoas.set(p.id, p);
    this.gerarAgenda(p, tick, true);
    return p.id;
  }

  private remover(id: number): void {
    const p = this.pessoas.get(id);
    if (!p) return;
    this.sairDoTransporte(p);
    this.liberarLanchonete(p);
    this.pessoas.delete(id);
  }

  // ------------------------------------------------------------- agenda

  novoDia(tick: number): void {
    this.desistenciasHoje = 0;
    for (const p of this.pessoas.values()) {
      p.estresse *= 0.5;
      this.gerarAgenda(p, tick, false);
    }
  }

  private gerarAgenda(p: Pessoa, tick: number, recemChegado: boolean): void {
    const { rng } = this.amb;
    const d = data(tick);
    const ag: Compromisso[] = [];
    if (p.tipo === 'funcionario') {
      if (!d.fimDeSemana) {
        ag.push({ minuto: 420 + rng.inteiro(0, 165), acao: 'ir_casa' }); // 07:00–09:45
        ag.push({ minuto: 690 + rng.inteiro(0, 90), acao: 'almocar' }); // 11:30–13:00
        ag.push({ minuto: 990 + rng.inteiro(0, 150), acao: 'sair' }); // 16:30–19:00
      }
    } else if (!d.fimDeSemana) {
      ag.push({ minuto: 420 + rng.inteiro(0, 90), acao: 'sair' }); // 07:00–08:30
      ag.push({ minuto: 1050 + rng.inteiro(0, 150), acao: 'ir_casa' }); // 17:30–20:00
    } else {
      ag.push({ minuto: 690 + rng.inteiro(0, 90), acao: 'almocar' });
    }

    const agora = d.minutoDoDia;
    p.agenda = ag.filter((c) => c.minuto >= agora);
    p.proximo = 0;
    if (recemChegado) {
      // Quem acabou de ser criado "chega" logo se agora deveria estar na unidade.
      const sair = ag.find((c) => c.acao === 'sair');
      const ir = ag.find((c) => c.acao === 'ir_casa');
      const deveriaEstar =
        p.tipo === 'funcionario'
          ? !!ir && !!sair && agora >= ir.minuto && agora < sair.minuto
          : !sair || agora < sair.minuto || (ir !== undefined && agora >= ir.minuto) || d.fimDeSemana;
      if (deveriaEstar) {
        const chegada = Math.min(agora + rng.inteiro(5, 60), MIN_POR_DIA - 1);
        p.agenda = [{ minuto: chegada, acao: 'ir_casa' as Acao }, ...p.agenda].sort((a, b) => a.minuto - b.minuto);
      }
    }
  }

  // ---------------------------------------------------------- simulação

  passo(tick: number): void {
    this.tickAtual = tick;
    const minuto = tick % MIN_POR_DIA;
    for (const p of this.pessoas.values()) {
      switch (p.estado) {
        case Estado.Fora:
        case Estado.NaUnidade:
          if (p.estado === Estado.NaUnidade && p.ate && tick >= p.ate) {
            p.ate = 0;
            this.irPara(p, { tipo: 'casa' });
          } else if (p.proximo < p.agenda.length && minuto >= p.agenda[p.proximo]!.minuto) {
            this.executar(p, p.agenda[p.proximo++]!.acao);
          }
          break;
        case Estado.Andando: {
          const alvo = (p.rota![p.perna] as { x: number }).x;
          const dx = alvo - p.x;
          if (Math.abs(dx) <= VEL_CAMINHADA) {
            p.x = alvo;
            this.proximaPerna(p);
          } else p.x += Math.sign(dx) * VEL_CAMINHADA;
          break;
        }
        case Estado.Esperando: {
          const espera = tick - p.desde;
          const tol = PACIENCIA[p.tipo];
          if (espera > tol) p.estresse = Math.min(100, p.estresse + ESTRESSE_POR_TICK);
          if (espera > tol * 2) this.desistir(p);
          break;
        }
        case Estado.NaEscada:
          if (tick >= p.ate) {
            p.y = (p.rota![p.perna] as { para: number }).para;
            this.proximaPerna(p);
          }
          break;
        case Estado.NoElevador:
          break;
      }
    }
  }

  private executar(p: Pessoa, acao: Acao): void {
    if (acao === 'ir_casa') this.irPara(p, { tipo: 'casa' });
    else if (acao === 'sair') this.irPara(p, { tipo: 'fora' });
    else this.almocar(p);
  }

  private almocar(p: Pessoa): void {
    const { lanchonetes, rng } = this.amb;
    const ordem = [...lanchonetes];
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = rng.inteiro(0, i);
      [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
    }
    for (const l of ordem) {
      const ocup = this.ocupacaoLanchonete.get(l.uid) ?? 0;
      if (ocup >= tipo(l.tipo).capacidade) continue;
      if (this.irPara(p, { tipo: 'almoco', uid: l.uid })) {
        this.ocupacaoLanchonete.set(l.uid, ocup + 1);
        return;
      }
    }
    // Sem lugar para almoçar
    p.estresse = Math.min(100, p.estresse + 5);
  }

  /** Começa a ir para `destino`. Devolve false se não houver rota. */
  private irPara(p: Pessoa, destino: Destino): boolean {
    const { mundo, roteador, entradas, rng } = this.amb;
    let x0 = p.x;
    let y0 = p.y;
    if (p.estado === Estado.Fora) {
      if (destino.tipo === 'fora') return true;
      if (!entradas.length) return this.semAcesso(p);
      x0 = entradas[rng.inteiro(0, entradas.length - 1)]!;
      y0 = 0;
    } else if (p.estado === Estado.NaUnidade) {
      const u = mundo.unidades.get(p.local);
      if (u) {
        x0 = centro(u);
        y0 = u.y;
      }
    }

    let x1: number;
    let y1: number;
    if (destino.tipo === 'fora') {
      if (!entradas.length) return this.sairJa(p);
      x1 = maisProxima(entradas, x0);
      y1 = 0;
    } else {
      const u = mundo.unidades.get(destino.tipo === 'casa' ? p.casa : destino.uid);
      if (!u) return false;
      if (p.estado === Estado.NaUnidade && p.local === u.uid) return true;
      x1 = centro(u);
      y1 = u.y;
    }

    const rota = roteador.rota(x0, y0, x1, y1);
    if (!rota) {
      if (p.estado === Estado.Fora) return this.semAcesso(p);
      if (destino.tipo === 'fora') return this.sairJa(p);
      return false;
    }
    if (p.estado === Estado.NaUnidade) this.liberarLanchonete(p);
    p.x = x0;
    p.y = y0;
    p.local = 0;
    p.destino = destino;
    p.rota = rota;
    p.perna = 0;
    this.iniciarPerna(p);
    return true;
  }

  private semAcesso(p: Pessoa): boolean {
    p.estresse = Math.min(100, p.estresse + 5);
    return false;
  }

  /** Prédio sem saída alcançável: a pessoa simplesmente vai embora. */
  private sairJa(p: Pessoa): boolean {
    this.liberarLanchonete(p);
    p.estado = Estado.Fora;
    p.rota = null;
    p.local = 0;
    return true;
  }

  private iniciarPerna(p: Pessoa): void {
    const perna = p.rota![p.perna];
    if (!perna) return this.chegar(p);
    if (perna.tipo === 'andar') {
      p.estado = Estado.Andando;
    } else if (perna.tipo === 'elevador') {
      const poco = this.amb.transito.pocos.get(perna.uid);
      if (!poco) return this.replanejar(p);
      p.poco = poco.uid;
      p.andarDestino = perna.para;
      p.desde = this.tickAtual;
      const posFila = poco.chamar(p.id, p.y, perna.para);
      // Fila ao lado do poço (esquerda para quem sobe, direita para quem desce).
      const lado = perna.para > p.y ? -1 : 1;
      const base = lado < 0 ? poco.x - 0.6 : poco.x + 4.6;
      p.x = base + lado * (posFila % 12) * 0.7;
      p.estado = Estado.Esperando;
    } else {
      p.escadaDe = perna.de;
      p.desde = this.tickAtual;
      p.ate = this.tickAtual + perna.tempo;
      p.estado = Estado.NaEscada;
    }
  }

  private proximaPerna(p: Pessoa): void {
    p.perna++;
    this.iniciarPerna(p);
  }

  private chegar(p: Pessoa): void {
    const d = p.destino;
    p.rota = null;
    p.estresse = Math.max(0, p.estresse - 5);
    if (!d || d.tipo === 'fora') {
      p.estado = Estado.Fora;
      p.local = 0;
    } else if (d.tipo === 'casa') {
      p.estado = Estado.NaUnidade;
      p.local = p.casa;
    } else {
      p.estado = Estado.NaUnidade;
      p.local = d.uid;
      p.ate = this.tickAtual + TEMPO_ALMOCO;
      p.estresse = Math.max(0, p.estresse - 10);
    }
  }

  private desistir(p: Pessoa): void {
    this.sairDoTransporte(p);
    this.liberarLanchonete(p);
    this.desistenciasHoje++;
    p.estresse = Math.min(100, p.estresse + 10);
    p.estado = Estado.Fora;
    p.rota = null;
  }

  private liberarLanchonete(p: Pessoa): void {
    const uid = p.destino?.tipo === 'almoco' ? p.destino.uid : 0;
    if (!uid) return;
    const n = this.ocupacaoLanchonete.get(uid) ?? 0;
    if (n > 0) this.ocupacaoLanchonete.set(uid, n - 1);
    p.destino = null;
  }

  private sairDoTransporte(p: Pessoa): void {
    const poco = this.amb.transito.pocos.get(p.poco);
    if (!poco) return;
    if (p.estado === Estado.Esperando) poco.sairDaFila(p.id, p.y);
    if (p.estado === Estado.NoElevador) {
      for (const c of poco.carros) {
        const i = c.passageiros.indexOf(p.id);
        if (i >= 0) c.passageiros.splice(i, 1);
      }
    }
  }

  /** Recalcula a rota de quem está em movimento (após mudanças no prédio). */
  replanejarEmMovimento(despejadas: number[]): void {
    const { transito, roteador } = this.amb;
    const despejo = new Set(despejadas);
    for (const p of this.pessoas.values()) {
      if (p.estado === Estado.Fora || p.estado === Estado.NaUnidade) continue;
      if (despejo.has(p.id)) {
        // Estava num poço que sumiu: aparece no andar de destino da viagem.
        if (p.estado === Estado.NoElevador) p.y = p.andarDestino;
        p.estado = Estado.Andando;
        this.replanejar(p);
        continue;
      }
      const invalida = p.rota?.slice(p.perna).some((perna) =>
        perna.tipo === 'elevador'
          ? !transito.pocos.has(perna.uid)
          : perna.tipo === 'escada'
            ? !transito.escadas.some((e) => e.uid === perna.uid)
            : false,
      );
      if (invalida || !roteador.segmentoEm(p.x, p.y)) {
        if (p.estado === Estado.Esperando || p.estado === Estado.NoElevador) {
          if (p.estado === Estado.NoElevador) continue; // termina a viagem atual primeiro
          this.sairDoTransporte(p);
        }
        this.replanejar(p);
      }
    }
  }

  private replanejar(p: Pessoa): void {
    const destino = p.destino ?? { tipo: 'casa' as const };
    if (!this.amb.roteador.segmentoEm(p.x, p.y)) {
      this.sairJa(p);
      return;
    }
    p.estado = Estado.Andando;
    if (!this.irPara(p, destino)) this.sairJa(p);
  }

  // -------------------------------------------------- interface Passageiros

  destino(id: number): number {
    return this.pessoas.get(id)?.andarDestino ?? 0;
  }

  embarcou(id: number, poco: Poco, carro: Carro, tick: number): void {
    const p = this.pessoas.get(id);
    if (!p) return;
    poco.registrarEspera(tick - p.desde);
    p.estado = Estado.NoElevador;
    p.carro = carro.id;
  }

  desembarcou(id: number, andar: number, poco: Poco): void {
    const p = this.pessoas.get(id);
    if (!p) return;
    p.y = andar;
    p.x = poco.xCentro;
    p.carro = 0;
    this.proximaPerna(p);
  }

  // ------------------------------------------------------------ consulta

  estatisticas(): Estatisticas {
    let noPredio = 0;
    let esperando = 0;
    let soma = 0;
    for (const p of this.pessoas.values()) {
      if (p.estado !== Estado.Fora) noPredio++;
      if (p.estado === Estado.Esperando) esperando++;
      soma += p.estresse;
    }
    return {
      total: this.pessoas.size,
      noPredio,
      esperando,
      desistenciasHoje: this.desistenciasHoje,
      estresseMedio: this.pessoas.size ? soma / this.pessoas.size : 0,
    };
  }

  /**
   * Pessoas visíveis para o render: [id, x, y, humor] por pessoa.
   * Humor: 0 neutro, 1 irritado, 2 furioso.
   */
  visiveis(): Float32Array {
    const r: number[] = [];
    for (const p of this.pessoas.values()) {
      let y = p.y;
      if (p.estado === Estado.NaEscada) {
        const perna = p.rota![p.perna] as { de: number; para: number; tempo: number };
        const t = Math.min(1, (this.tickAtual - p.desde) / perna.tempo);
        y = perna.de + (perna.para - perna.de) * t;
      } else if (p.estado !== Estado.Andando && p.estado !== Estado.Esperando) continue;
      const humor = p.estresse >= ESTRESSE_FURIOSO ? 2 : p.estresse >= ESTRESSE_IRRITADO ? 1 : 0;
      r.push(p.id, p.x, y, humor);
    }
    return new Float32Array(r);
  }

  /**
   * Unidades que geram moradores (ou servem comida) e não têm rota a partir da
   * rua. Unidades no mesmo trecho de andar compartilham o resultado.
   */
  unidadesSemAcesso(): number[] {
    const { mundo, roteador, entradas } = this.amb;
    const porTrecho = new Map<string, boolean>();
    const r: number[] = [];
    for (const u of mundo.unidades.values()) {
      if (!MORADORES_POR_TIPO[u.tipo] && u.tipo !== 'lanchonete') continue;
      const x = centro(u);
      const chave = `${u.y}:${roteador.segmentoEm(x, u.y)}`;
      let ok = porTrecho.get(chave);
      if (ok === undefined) {
        ok = entradas.length > 0 && roteador.rota(entradas[0]!, 0, x, u.y) !== null;
        porTrecho.set(chave, ok);
      }
      if (!ok) r.push(u.uid);
    }
    return r;
  }
}

export function centro(u: Unidade): number {
  return u.x + u.largura / 2;
}

function maisProxima(xs: number[], x: number): number {
  let melhor = xs[0]!;
  for (const v of xs) if (Math.abs(v - x) < Math.abs(melhor - x)) melhor = v;
  return melhor;
}
