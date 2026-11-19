// Pessoas (agentes): agenda diária, deslocamento pelas rotas e estresse.
// Ver docs/gdd.md §5.
//
// Permanentes (funcionários, moradores) existem enquanto a unidade estiver
// ocupada. Temporários (hóspedes, visitantes) são criados pela economia e
// removidos quando saem do prédio.

import { tipo } from './dados';
import { nomeAndar, type Mundo, type Unidade } from './mundo';
import { nomePessoa } from './nomes';
import { data, formatarHora, MIN_POR_DIA } from './relogio';
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

export type TipoPessoa = 'funcionario' | 'morador' | 'hospede' | 'visitante' | 'inspetor';

/** Unidades cujos ocupantes são pessoas permanentes. */
export const OCUPANTES_POR_TIPO: Record<string, TipoPessoa> = {
  escritorio: 'funcionario',
  apartamento: 'morador',
};

/** Ticks de espera por elevador tolerados antes de o estresse subir. */
/** Inspetor tem pouca paciência (Fase 9): com 30 min, nunca percebia as filas. */
export const PACIENCIA: Record<TipoPessoa, number> = { funcionario: 30, morador: 45, hospede: 45, visitante: 40, inspetor: 10 };
/** Chance de quem mora/trabalha vir de carro (se houver vaga). */
export const CHANCE_CARRO = 0.35;
/** Chance de vir de metrô (se houver estação). */
export const CHANCE_METRO = 0.4;
/** Tempo do inspetor em cada unidade (ticks). */
export const TEMPO_INSPECAO = 20;
/** Estresse ganho por tick de espera além da paciência. */
export const ESTRESSE_POR_TICK = 1.5;
export const ESTRESSE_IRRITADO = 40;
export const ESTRESSE_FURIOSO = 70;
/** Quanto tempo se fica em cada tipo de unidade visitada (ticks). */
export const PERMANENCIA: Record<string, number> = { lanchonete: 30, restaurante: 50, loja: 30, coroa: 60 };

type Acao = 'ir_casa' | 'sair' | 'comer' | 'visitar';
interface Compromisso {
  minuto: number;
  acao: Acao;
}

type Destino = { tipo: 'casa' } | { tipo: 'fora' } | { tipo: 'visita'; uid: number };

export interface Pessoa {
  id: number;
  tipo: TipoPessoa;
  /** Unidade de vínculo: escritório, apartamento ou quarto de hotel. */
  casa: number;
  /** Visitante: unidade que veio visitar. */
  alvo: number;
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
  /** Tick em que termina a atividade atual (refeição, visita, escada). */
  ate: number;
  poco: number;
  carro: number;
  desde: number;
  andarDestino: number;
  escadaDe: number;
  estresse: number;
  /** Dia (total) em que o hóspede fez check-in. */
  diaChegada: number;
  /** Já entrou no prédio alguma vez (hóspedes/visitantes). */
  chegou: boolean;
  /** Estacionamento onde deixou o carro (0 = não veio de carro). */
  vaga: number;
  /** Inspetor: próximas unidades a visitar. */
  roteiro: number[];
  /** Participante de evento especial (inauguração). */
  evento: boolean;
  /** Maior estresse atingido. */
  pico: number;
  /** Hóspede VIP (docs/gdd.md §10). */
  vip: boolean;
  /** Últimos acontecimentos, para a ficha da pessoa. */
  historico: string[];
  /** Já registrou no histórico a espera atual. */
  reclamou: boolean;
  /** Tick em que começou a esperar na porta do lobby (0 = não está esperando). */
  fila?: number;
}

/** Dados da ficha da pessoa (docs/gdd.md §5.4). */
export interface FichaPessoa {
  id: number;
  nome: string;
  tipo: TipoPessoa;
  vip: boolean;
  vinculo: string;
  situacao: string;
  estresse: number;
  historico: string[];
  /** Posição atual (coluna, andar), ou null se estiver fora do prédio. */
  posicao: { x: number; y: number } | null;
}

const NOME_TIPO: Record<TipoPessoa, string> = {
  funcionario: 'Funcionário',
  morador: 'Morador',
  hospede: 'Hóspede',
  visitante: 'Visitante',
  inspetor: 'Inspetor',
};
const HISTORICO_MAX = 6;

export interface Entrada {
  x: number;
  y: number;
  tipo: 'rua' | 'metro';
  /** Rua: pessoas por minuto que a porta deixa entrar. */
  vazao?: number;
}

export interface Estacionamento {
  uid: number;
  x: number;
  y: number;
  vagas: number;
}

/** Avisos da população para a economia. */
export interface EventosPessoas {
  /** Alguém chegou para consumir numa unidade (refeição, compra). */
  cliente(uid: number, p: Pessoa): void;
  /** Hóspede ou visitante saiu do prédio de vez. */
  partiu(p: Pessoa): void;
}

export interface Ambiente {
  mundo: Mundo;
  transito: Transito;
  roteador: Roteador;
  rng: Rng;
  /** Por onde se entra e sai: pontas do lobby no térreo e estações de metrô. */
  entradas: Entrada[];
  /** Estacionamentos com rampa no mesmo andar. */
  estacionamentos: Estacionamento[];
  /** Unidades onde se come. */
  comidas: Unidade[];
  eventos: EventosPessoas;
}

export interface PopulacaoSalva {
  pessoas: Pessoa[];
  porUnidade: [number, number[]][];
  lotacao: [number, number][];
  vagasOcupadas: [number, number][];
  usosEstacionamento: number;
  bloqueadas: number[];
  proximoId: number;
  tickAtual: number;
  desistenciasHoje: number;
}

export interface Estatisticas {
  /** Moradores + funcionários + hóspedes (população do GDD). */
  total: number;
  visitantes: number;
  noPredio: number;
  esperando: number;
  desistenciasHoje: number;
  estresseMedio: number;
}

export class Populacao implements Passageiros {
  readonly pessoas = new Map<number, Pessoa>();
  private readonly porUnidade = new Map<number, number[]>();
  /** Pessoas consumindo (ou a caminho de) cada unidade de comida/comércio. */
  private readonly lotacao = new Map<number, number>();
  private readonly vagasOcupadas = new Map<number, number>();
  private usosEstacionamento = 0;
  /** Unidades fechadas (em chamas): ninguém entra para consumir. */
  readonly bloqueadas = new Set<number>();
  private proximoId = 1;
  private tickAtual = 0;
  /** Entradas pela rua neste minuto, por porta. */
  private usoPortas = new Map<Entrada, number>();
  /** Lugares livres nas portas da rua neste minuto (Infinity sem portas de rua). */
  private vagasPortas = Infinity;
  desistenciasHoje = 0;

  constructor(private amb: Ambiente) {}

  atualizarAmbiente(amb: Ambiente): void {
    this.amb = amb;
  }

  get total(): number {
    let n = 0;
    for (const p of this.pessoas.values()) if (p.tipo !== 'visitante' && p.tipo !== 'inspetor') n++;
    return n;
  }

  ocupantes(uid: number): Pessoa[] {
    return (this.porUnidade.get(uid) ?? []).map((id) => this.pessoas.get(id)!).filter(Boolean);
  }

  lotacaoDe(uid: number): number {
    return this.lotacao.get(uid) ?? 0;
  }

  // ---------------------------------------------------- criar e remover

  /** Inquilino se muda: cria funcionários/moradores da unidade. */
  ocupar(u: Unidade, tick: number): void {
    const tp = OCUPANTES_POR_TIPO[u.tipo];
    if (!tp || this.porUnidade.has(u.uid)) return;
    const ids: number[] = [];
    for (let i = 0; i < tipo(u.tipo).populacao; i++) {
      const p = this.novo(tp, u.uid, tick);
      this.gerarAgenda(p, tick, true);
      ids.push(p.id);
    }
    this.porUnidade.set(u.uid, ids);
  }

  /** Inquilino vai embora (ou unidade demolida): remove seus ocupantes. */
  desocupar(uid: number): void {
    for (const id of this.porUnidade.get(uid) ?? []) this.remover(id);
    this.porUnidade.delete(uid);
  }

  /** Hóspedes de um quarto: chegam no minuto `chegada` de hoje e saem amanhã de manhã. */
  hospedar(quarto: Unidade, n: number, chegada: number, tick: number, vip = false): void {
    const ids: number[] = [];
    const jantar = 1170 + this.amb.rng.inteiro(0, 60); // 19:30–20:30
    for (let i = 0; i < n; i++) {
      const p = this.novo('hospede', quarto.uid, tick);
      p.diaChegada = data(tick).diaTotal;
      p.agenda = [{ minuto: chegada, acao: 'ir_casa' }];
      if (chegada < jantar) p.agenda.push({ minuto: jantar, acao: 'comer' });
      if (vip && i === 0) p.vip = true;
      ids.push(p.id);
    }
    this.porUnidade.set(quarto.uid, ids);
  }

  /** Visitante de fora para uma unidade de comida/comércio/marco. */
  visitar(alvo: Unidade, minuto: number, tick: number, evento = false): void {
    const p = this.novo('visitante', 0, tick);
    p.alvo = alvo.uid;
    p.evento = evento;
    p.agenda = [{ minuto, acao: 'visitar' }];
  }

  /** Inspetor percorre as unidades do roteiro, nessa ordem. */
  inspecionar(roteiro: number[], minuto: number, tick: number): Pessoa {
    const p = this.novo('inspetor', 0, tick);
    p.alvo = roteiro[0] ?? 0;
    p.roteiro = roteiro.slice(1);
    p.agenda = [{ minuto, acao: 'visitar' }];
    return p;
  }

  /** Carros que usaram o estacionamento desde a última consulta (zera a contagem). */
  consumirUsosEstacionamento(): number {
    const n = this.usosEstacionamento;
    this.usosEstacionamento = 0;
    return n;
  }

  private novo(tp: TipoPessoa, casa: number, tick: number): Pessoa {
    const p: Pessoa = {
      id: this.proximoId++, tipo: tp, casa, alvo: 0, estado: Estado.Fora, x: 0, y: 0,
      rota: null, perna: 0, destino: null, local: 0, agenda: [], proximo: 0, ate: 0,
      poco: 0, carro: 0, desde: 0, andarDestino: 0, escadaDe: 0, estresse: 0,
      diaChegada: data(tick).diaTotal, chegou: false, vaga: 0, roteiro: [], evento: false, pico: 0,
      vip: false, historico: [], reclamou: false,
    };
    this.pessoas.set(p.id, p);
    return p;
  }

  private remover(id: number): void {
    const p = this.pessoas.get(id);
    if (!p) return;
    this.sairDoTransporte(p);
    this.liberarLugar(p);
    this.liberarVaga(p);
    this.pessoas.delete(id);
  }

  /** Remove quem está ligado a unidades demolidas. */
  sincronizarUnidades(): void {
    const { mundo } = this.amb;
    for (const uid of [...this.porUnidade.keys()]) if (!mundo.unidades.has(uid)) this.desocupar(uid);
    for (const uid of [...this.lotacao.keys()]) if (!mundo.unidades.has(uid)) this.lotacao.delete(uid);
    for (const p of [...this.pessoas.values()]) {
      if (p.tipo === 'visitante' && !mundo.unidades.has(p.alvo) && p.estado === Estado.Fora) this.remover(p.id);
    }
  }

  // ------------------------------------------------------------- agenda

  novoDia(tick: number): void {
    this.desistenciasHoje = 0;
    const hoje = data(tick).diaTotal;
    for (const p of [...this.pessoas.values()]) {
      p.estresse *= 0.5;
      if (p.tipo === 'visitante' || p.tipo === 'inspetor') {
        if (p.estado === Estado.Fora) this.partir(p);
        continue;
      }
      if (p.tipo === 'hospede') {
        if (hoje <= p.diaChegada) continue;
        if (!p.chegou && p.estado === Estado.Fora) {
          this.partir(p); // nunca chegou ao quarto
          continue;
        }
        p.agenda = [{ minuto: 540 + this.amb.rng.inteiro(0, 120), acao: 'sair' }]; // check-out 09–11h
        p.proximo = 0;
        continue;
      }
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
        ag.push({ minuto: 690 + rng.inteiro(0, 90), acao: 'comer' }); // 11:30–13:00
        ag.push({ minuto: 990 + rng.inteiro(0, 150), acao: 'sair' }); // 16:30–19:00
      }
    } else if (!d.fimDeSemana) {
      ag.push({ minuto: 420 + rng.inteiro(0, 90), acao: 'sair' }); // 07:00–08:30
      ag.push({ minuto: 1050 + rng.inteiro(0, 150), acao: 'ir_casa' }); // 17:30–20:00
    } else {
      ag.push({ minuto: 690 + rng.inteiro(0, 90), acao: 'comer' });
    }

    const agora = d.minutoDoDia;
    p.agenda = ag.filter((c) => c.minuto >= agora);
    p.proximo = 0;
    if (recemChegado) {
      // Quem acabou de se mudar chega logo se agora deveria estar na unidade.
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
    this.usoPortas.clear();
    const ruas = this.amb.entradas.filter((e) => e.tipo === 'rua');
    this.vagasPortas = ruas.length ? ruas.reduce((s, e) => s + (e.vazao ?? Infinity), 0) : Infinity;
    for (const p of this.pessoas.values()) {
      switch (p.estado) {
        case Estado.Fora:
        case Estado.NaUnidade:
          if (p.estado === Estado.NaUnidade && p.ate && tick >= p.ate) {
            p.ate = 0;
            // Fim da refeição/visita: inspetor segue o roteiro, visitante vai
            // embora, os demais voltam para casa/trabalho/quarto.
            if (p.tipo === 'inspetor') {
              const prox = p.roteiro.shift();
              if (prox === undefined || !this.irPara(p, { tipo: 'visita', uid: prox })) this.irPara(p, { tipo: 'fora' });
            } else this.irPara(p, p.tipo === 'visitante' ? { tipo: 'fora' } : { tipo: 'casa' });
          } else if (p.proximo < p.agenda.length && minuto >= p.agenda[p.proximo]!.minuto) {
            const acao = p.agenda[p.proximo]!.acao;
            if (p.estado === Estado.Fora && acao !== 'sair' && this.vagasPortas <= 0) {
              this.esperarNaPorta(p, tick);
              break;
            }
            if (p.fila) {
              p.fila = 0;
              p.reclamou = false;
            }
            p.proximo++;
            this.executar(p, acao);
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
          if (espera > tol) {
            this.estressar(p, ESTRESSE_POR_TICK);
            if (!p.reclamou) {
              p.reclamou = true;
              this.registrar(p, `irritado: mais de ${tol} min esperando elevador no andar ${nomeAndar(p.y)}`);
            }
          }
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

  /** Portas do lobby lotadas neste minuto: espera na calçada (e se irrita). */
  private esperarNaPorta(p: Pessoa, tick: number): void {
    if (!p.fila) {
      p.fila = tick;
      return;
    }
    if (tick - p.fila > PACIENCIA[p.tipo]) {
      this.estressar(p, ESTRESSE_POR_TICK);
      if (!p.reclamou) {
        p.reclamou = true;
        this.registrar(p, 'irritado: fila para entrar pelo lobby');
      }
    }
  }

  private executar(p: Pessoa, acao: Acao): void {
    if (acao === 'ir_casa') this.irPara(p, { tipo: 'casa' });
    else if (acao === 'sair') this.irPara(p, { tipo: 'fora' });
    else if (acao === 'comer') this.comer(p);
    else if (p.tipo === 'inspetor') {
      if (!this.irPara(p, { tipo: 'visita', uid: p.alvo })) this.partir(p);
    } else if (!this.irAoLugar(p, p.alvo)) this.partir(p);
  }

  /** Escolhe uma unidade de comida com lugar e rota; sem opção, estresse. */
  private comer(p: Pessoa): void {
    const { comidas, rng } = this.amb;
    const ordem = [...comidas];
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = rng.inteiro(0, i);
      [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
    }
    for (const c of ordem) if (this.irAoLugar(p, c.uid)) return;
    p.estresse = Math.min(100, p.estresse + 5); // sem lugar para comer
  }

  /** Vai a uma unidade de consumo se houver lugar e rota. */
  private irAoLugar(p: Pessoa, uid: number): boolean {
    const u = this.amb.mundo.unidades.get(uid);
    if (!u || this.bloqueadas.has(uid)) return false;
    const ocup = this.lotacao.get(uid) ?? 0;
    if (ocup >= tipo(u.tipo).capacidade) return false;
    if (!this.irPara(p, { tipo: 'visita', uid })) return false;
    this.lotacao.set(uid, ocup + 1);
    return true;
  }

  /** Começa a ir para `destino`. Devolve false se não houver rota. */
  private irPara(p: Pessoa, destino: Destino): boolean {
    const { mundo, roteador, entradas } = this.amb;
    let x0 = p.x;
    let y0 = p.y;
    let entrada: Entrada | Estacionamento | null = null;
    if (p.estado === Estado.Fora) {
      if (destino.tipo === 'fora') return true;
      entrada = this.escolherEntrada(p, destino);
      if (!entrada) return this.semAcesso(p);
      x0 = entrada.x;
      y0 = entrada.y;
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
      const saida = this.escolherSaida(p, x0, y0);
      if (!saida) return this.sairJa(p);
      x1 = saida.x;
      y1 = saida.y;
    } else {
      const u = mundo.unidades.get(destino.tipo === 'casa' ? p.casa : destino.uid);
      if (!u) return false;
      if (p.estado === Estado.NaUnidade && p.local === u.uid) return true;
      x1 = centro(u);
      y1 = u.y;
    }

    let rota = roteador.rota(x0, y0, x1, y1);
    if (!rota && entrada && !('tipo' in entrada && entrada.tipo === 'rua')) {
      // Entrada alternativa (carro/metrô) sem rota: tenta pela rua.
      this.liberarVaga(p);
      const rua = entradas.find((e) => e.tipo === 'rua');
      if (rua) {
        x0 = rua.x;
        y0 = rua.y;
        rota = roteador.rota(x0, y0, x1, y1);
      }
    }
    if (!rota) {
      this.liberarVaga(p);
      if (p.estado === Estado.Fora) return this.semAcesso(p);
      if (destino.tipo === 'fora') return this.sairJa(p);
      return false;
    }
    if (p.estado === Estado.NaUnidade) this.liberarLugar(p);
    p.x = x0;
    p.y = y0;
    p.local = 0;
    p.destino = destino;
    p.rota = rota;
    p.perna = 0;
    this.iniciarPerna(p);
    return true;
  }

  /** De onde a pessoa chega: estacionamento, metrô ou rua. */
  private escolherEntrada(p: Pessoa, destino: Destino): Entrada | Estacionamento | null {
    const { entradas, estacionamentos, rng } = this.amb;
    if ((p.tipo === 'funcionario' || p.tipo === 'morador') && destino.tipo === 'casa' && estacionamentos.length) {
      if (rng.proximo() < CHANCE_CARRO) {
        const e = estacionamentos.find((e) => (this.vagasOcupadas.get(e.uid) ?? 0) < e.vagas);
        if (e) {
          p.vaga = e.uid;
          this.vagasOcupadas.set(e.uid, (this.vagasOcupadas.get(e.uid) ?? 0) + 1);
          this.usosEstacionamento++;
          return e;
        }
      }
    }
    const metros = entradas.filter((e) => e.tipo === 'metro');
    if (metros.length && rng.proximo() < CHANCE_METRO) return metros[rng.inteiro(0, metros.length - 1)]!;
    const ruas = entradas.filter((e) => e.tipo === 'rua');
    if (ruas.length) {
      // Prefere portas com lugar neste minuto.
      const livres = ruas.filter((e) => (this.usoPortas.get(e) ?? 0) < (e.vazao ?? Infinity));
      const lista = livres.length ? livres : ruas;
      const e = lista[rng.inteiro(0, lista.length - 1)]!;
      this.usoPortas.set(e, (this.usoPortas.get(e) ?? 0) + 1);
      this.vagasPortas--;
      return e;
    }
    return metros[0] ?? null;
  }

  /** Para onde a pessoa vai ao sair: o carro dela, ou a entrada mais próxima. */
  private escolherSaida(p: Pessoa, x: number, y: number): { x: number; y: number } | null {
    if (p.vaga) {
      const e = this.amb.estacionamentos.find((e) => e.uid === p.vaga);
      if (e) return e;
      this.liberarVaga(p);
    }
    let melhor: Entrada | null = null;
    let dist = Infinity;
    for (const e of this.amb.entradas) {
      const d = Math.abs(e.y - y) * 20 + Math.abs(e.x - x);
      if (d < dist) {
        dist = d;
        melhor = e;
      }
    }
    return melhor;
  }

  private liberarVaga(p: Pessoa): void {
    if (!p.vaga) return;
    const n = this.vagasOcupadas.get(p.vaga) ?? 0;
    if (n > 0) this.vagasOcupadas.set(p.vaga, n - 1);
    p.vaga = 0;
  }

  private semAcesso(p: Pessoa): boolean {
    p.estresse = Math.min(100, p.estresse + 5);
    return false;
  }

  /** Sem saída alcançável (ou desistência): a pessoa simplesmente vai embora. */
  private sairJa(p: Pessoa): boolean {
    this.liberarLugar(p);
    this.liberarVaga(p);
    p.estado = Estado.Fora;
    p.rota = null;
    p.local = 0;
    if (p.tipo === 'visitante' || p.tipo === 'inspetor' || (p.tipo === 'hospede' && p.chegou)) this.partir(p);
    return true;
  }

  /** Temporário sai de vez: avisa a economia e some. */
  private partir(p: Pessoa): void {
    if (!this.pessoas.has(p.id)) return;
    this.amb.eventos.partiu(p);
    this.remover(p.id);
    if (p.tipo === 'hospede') {
      const ids = this.porUnidade.get(p.casa);
      if (ids) {
        const resto = ids.filter((id) => id !== p.id);
        if (resto.length) this.porUnidade.set(p.casa, resto);
        else this.porUnidade.delete(p.casa);
      }
    }
  }

  private iniciarPerna(p: Pessoa): void {
    const perna = p.rota![p.perna];
    if (!perna) return this.chegar(p);
    p.chegou = true;
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
    p.chegou = true;
    p.estresse = Math.max(0, p.estresse - 5);
    const txt = d?.tipo === 'casa'
      ? { funcionario: 'chegou ao trabalho', morador: 'chegou em casa', hospede: 'chegou ao quarto' }[p.tipo as 'funcionario'] ?? 'chegou'
      : this.textoChegada(d);
    this.registrar(p, txt);
    if (!d || d.tipo === 'fora') {
      p.estado = Estado.Fora;
      p.local = 0;
      this.liberarVaga(p);
      if (p.tipo === 'visitante' || p.tipo === 'hospede' || p.tipo === 'inspetor') this.partir(p);
    } else if (d.tipo === 'casa') {
      p.estado = Estado.NaUnidade;
      p.local = p.casa;
    } else {
      const u = this.amb.mundo.unidades.get(d.uid);
      p.estado = Estado.NaUnidade;
      p.local = d.uid;
      p.ate = this.tickAtual + (p.tipo === 'inspetor' ? TEMPO_INSPECAO : u ? (PERMANENCIA[u.tipo] ?? 30) : 30);
      p.estresse = Math.max(0, p.estresse - 10);
      this.amb.eventos.cliente(d.uid, p);
    }
  }

  private desistir(p: Pessoa): void {
    this.registrar(p, 'desistiu de esperar e foi embora');
    this.sairDoTransporte(p);
    this.desistenciasHoje++;
    p.estresse = Math.min(100, p.estresse + 10);
    this.sairJa(p);
  }

  private liberarLugar(p: Pessoa): void {
    const uid = p.destino?.tipo === 'visita' ? p.destino.uid : 0;
    if (!uid) return;
    const n = this.lotacao.get(uid) ?? 0;
    if (n > 0) this.lotacao.set(uid, n - 1);
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
    for (const p of [...this.pessoas.values()]) {
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
        if (p.estado === Estado.NoElevador) continue; // termina a viagem atual primeiro
        if (p.estado === Estado.Esperando) this.sairDoTransporte(p);
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
    if (tick - p.desde >= 10) this.registrar(p, `esperou ${tick - p.desde} min pelo elevador no andar ${nomeAndar(p.y)}`);
    p.reclamou = false;
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

  // ------------------------------------------------- eventos especiais

  estressar(p: Pessoa, v: number): void {
    p.estresse = Math.min(100, p.estresse + v);
    if (p.estresse > p.pico) p.pico = p.estresse;
  }

  /** Estressa quem está dentro dos carros indicados (pane de elevador). */
  estressarPassageiros(ids: number[], v: number): void {
    for (const id of ids) {
      const p = this.pessoas.get(id);
      if (p) this.estressar(p, v);
    }
  }

  /** Quem está nas unidades indicadas sai do prédio às pressas (incêndio). */
  evacuar(uids: Set<number>): void {
    for (const p of [...this.pessoas.values()]) {
      if (p.estado !== Estado.NaUnidade || !uids.has(p.local)) continue;
      this.registrar(p, 'saiu às pressas: incêndio!');
      this.estressar(p, 20);
      p.ate = 0;
      this.irPara(p, { tipo: 'fora' });
    }
  }

  private registrar(p: Pessoa, texto: string): void {
    p.historico.push(`${formatarHora(this.tickAtual)} ${texto}`);
    if (p.historico.length > HISTORICO_MAX) p.historico.shift();
  }

  private nomeUnidade(uid: number): string {
    const u = this.amb.mundo.unidades.get(uid);
    return u ? `${tipo(u.tipo).nome} (andar ${nomeAndar(u.y)})` : 'unidade demolida';
  }

  private textoChegada(d: Destino | null): string {
    if (!d || d.tipo === 'fora') return 'saiu do prédio';
    if (d.tipo === 'visita') return `chegou a ${this.nomeUnidade(d.uid)}`;
    return '';
  }

  ficha(id: number): FichaPessoa | null {
    const p = this.pessoas.get(id);
    if (!p) return null;
    const vinculo = p.casa ? this.nomeUnidade(p.casa) : p.alvo ? `visita a ${this.nomeUnidade(p.alvo)}` : '—';
    let situacao = '';
    let posicao: { x: number; y: number } | null = { x: p.x, y: p.y };
    const destino =
      p.destino?.tipo === 'fora' ? 'saída' : p.destino?.tipo === 'visita' ? this.nomeUnidade(p.destino.uid) : p.destino ? this.nomeUnidade(p.casa) : '';
    switch (p.estado) {
      case Estado.Fora:
        situacao = 'Fora do prédio';
        posicao = null;
        break;
      case Estado.NaUnidade: {
        situacao = `Em ${this.nomeUnidade(p.local)}`;
        const u = this.amb.mundo.unidades.get(p.local);
        posicao = u ? { x: centro(u), y: u.y } : null;
        break;
      }
      case Estado.Esperando:
        situacao = `Esperando elevador há ${this.tickAtual - p.desde} min → ${destino}`;
        break;
      case Estado.NoElevador: {
        situacao = `No elevador → ${destino}`;
        const poco = this.amb.transito.pocos.get(p.poco);
        const carro = poco?.carros.find((c) => c.id === p.carro);
        posicao = poco && carro ? { x: poco.xCentro, y: carro.pos } : posicao;
        break;
      }
      default:
        situacao = `A caminho de ${destino}`;
    }
    return {
      id: p.id, nome: nomePessoa(p.id), tipo: p.tipo, vip: p.vip, vinculo, situacao,
      estresse: p.estresse, historico: [...p.historico].reverse(), posicao,
    };
  }

  // ------------------------------------------------------- salvar jogo

  exportar(): PopulacaoSalva {
    return {
      pessoas: [...this.pessoas.values()].map((p) => structuredClone(p)),
      porUnidade: [...this.porUnidade],
      lotacao: [...this.lotacao],
      vagasOcupadas: [...this.vagasOcupadas],
      usosEstacionamento: this.usosEstacionamento,
      bloqueadas: [...this.bloqueadas],
      proximoId: this.proximoId,
      tickAtual: this.tickAtual,
      desistenciasHoje: this.desistenciasHoje,
    };
  }

  importar(d: PopulacaoSalva): void {
    this.pessoas.clear();
    for (const p of d.pessoas) this.pessoas.set(p.id, structuredClone(p));
    this.porUnidade.clear();
    for (const [k, v] of d.porUnidade) this.porUnidade.set(k, [...v]);
    this.lotacao.clear();
    for (const [k, v] of d.lotacao) this.lotacao.set(k, v);
    this.vagasOcupadas.clear();
    for (const [k, v] of d.vagasOcupadas) this.vagasOcupadas.set(k, v);
    this.usosEstacionamento = d.usosEstacionamento;
    this.bloqueadas.clear();
    for (const b of d.bloqueadas) this.bloqueadas.add(b);
    this.proximoId = d.proximoId;
    this.tickAtual = d.tickAtual;
    this.desistenciasHoje = d.desistenciasHoje;
  }

  // ------------------------------------------------------------ consulta

  estatisticas(): Estatisticas {
    let noPredio = 0;
    let esperando = 0;
    let soma = 0;
    let visitantes = 0;
    for (const p of this.pessoas.values()) {
      if (p.estado !== Estado.Fora) noPredio++;
      if (p.estado === Estado.Esperando) esperando++;
      if (p.tipo === 'visitante' || p.tipo === 'inspetor') visitantes++;
      soma += p.estresse;
    }
    return {
      total: this.pessoas.size - visitantes,
      visitantes,
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
      const humor = p.vip ? 3 : p.estresse >= ESTRESSE_FURIOSO ? 2 : p.estresse >= ESTRESSE_IRRITADO ? 1 : 0;
      r.push(p.id, p.x, y, humor);
    }
    return new Float32Array(r);
  }

  /**
   * Unidades de uso (não estrutura, transporte, serviço ou acesso) sem rota a partir
   * da rua. Unidades no mesmo trecho de andar compartilham o resultado.
   */
  unidadesSemAcesso(): number[] {
    const { mundo, roteador, entradas } = this.amb;
    const porTrecho = new Map<string, boolean>();
    const r: number[] = [];
    for (const u of mundo.unidades.values()) {
      const cat = tipo(u.tipo).categoria;
      if (cat === 'estrutura' || cat === 'transito' || cat === 'servico' || cat === 'acesso') continue;
      const x = centro(u);
      const chave = `${u.y}:${roteador.segmentoEm(x, u.y)}`;
      let ok = porTrecho.get(chave);
      if (ok === undefined) {
        ok = entradas.some((e) => roteador.rota(e.x, e.y, x, u.y) !== null);
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
