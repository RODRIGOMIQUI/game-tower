// Transporte vertical: poços de elevador com carros e escadas. Ver docs/gdd.md §6.
//
// Elevadores usam despacho coletivo (LOOK): o carro segue na direção atual
// enquanto houver demanda nela, parando para chamadas no mesmo sentido; quando
// a demanda acaba, inverte ou fica ocioso. Carros ociosos reservam a chamada
// mais próxima, para que dois carros não corram atrás da mesma pessoa.

import { ehElevador, ehEscada, MANUTENCAO_CARRO_TRI, MAX_CARROS, tipo } from './dados';
import { Est, type Mundo, type Unidade } from './mundo';

/** Andares por tick. */
export const VEL_ELEVADOR = 3;
/** Espera estimada mínima (ticks) de um poço sem fila. */
export const ESPERA_BASE = 3;
/** Ticks com portas abertas a cada parada. */
export const TEMPO_PORTAS = 1;
/** Ticks por andar subindo/descendo escada comum. */
export const TEMPO_ESCADA = 4;
/** Ticks por andar em escada rolante. */
export const TEMPO_ESCADA_ROLANTE = 2;
/** Largura de um poço em colunas (centro = x + 2). */
export const LARGURA_POCO = 4;

export type ModoElevador = 'coletivo' | 'pico_manha';
export type Direcao = -1 | 0 | 1;

export interface Carro {
  id: number;
  /** Andar atual (inteiro). */
  pos: number;
  dir: Direcao;
  /** Ticks restantes com portas abertas. */
  portas: number;
  passageiros: number[];
  /** Andares onde algum passageiro quer descer. */
  paradas: Set<number>;
  /** Chamada reservada por este carro enquanto vai buscá-la. */
  reserva: { andar: number; dir: Direcao } | null;
}

interface Fila {
  sobe: number[];
  desce: number[];
  /** Carros a caminho desta chamada. Filas grandes aceitam vários carros. */
  reservaSobe: number[];
  reservaDesce: number[];
}

/** Interface que a população implementa para o elevador embarcar/desembarcar pessoas. */
export interface Passageiros {
  destino(id: number): number;
  embarcou(id: number, poco: Poco, carro: Carro, tick: number): void;
  desembarcou(id: number, andar: number, poco: Poco, tick: number): void;
}

export class Poco {
  readonly carros: Carro[] = [];
  modo: ModoElevador = 'coletivo';
  /** Média móvel do tempo de espera (ticks), usada no roteamento e no inspetor. */
  esperaMedia = ESPERA_BASE;
  atendidos = 0;
  readonly filas = new Map<number, Fila>();
  readonly capacidade: number;
  readonly paradasValidas: Set<number>;
  private proximoCarro = 1;

  constructor(
    readonly uid: number,
    readonly tipo: string,
    readonly x: number,
    readonly ymin: number,
    readonly ymax: number,
    mundo: Mundo,
  ) {
    this.capacidade = tipoCapacidade(tipo);
    this.paradasValidas = new Set();
    this.atualizarParadas(mundo);
  }

  /** Recalcula onde o carro pode parar (um sky lobby novo vira parada do expresso). */
  atualizarParadas(mundo: Mundo): void {
    this.paradasValidas.clear();
    for (let y = this.ymin; y <= this.ymax; y++) {
      // Expresso só para em lobbies e subsolos.
      if (this.tipo !== 'elevador_expresso' || y < 0 || mundo.est(this.x, y) === Est.Lobby) this.paradasValidas.add(y);
    }
  }

  get xCentro(): number {
    return this.x + LARGURA_POCO / 2;
  }

  /** Andar onde carros ociosos esperam no modo pico da manhã. */
  get andarLobby(): number {
    return this.paraEm(0) ? 0 : this.ymin;
  }

  paraEm(y: number): boolean {
    return this.paradasValidas.has(y);
  }

  adicionarCarro(): boolean {
    if (this.carros.length >= MAX_CARROS) return false;
    this.carros.push({
      id: this.uid * 16 + this.proximoCarro++,
      pos: this.andarLobby,
      dir: 0,
      portas: 0,
      passageiros: [],
      paradas: new Set(),
      reserva: null,
    });
    return true;
  }

  /** Remove o carro mais vazio. Devolve os passageiros que estavam nele. */
  removerCarro(): number[] | null {
    if (this.carros.length <= 1) return null;
    let i = 0;
    for (let k = 1; k < this.carros.length; k++) {
      if (this.carros[k]!.passageiros.length < this.carros[i]!.passageiros.length) i = k;
    }
    const [c] = this.carros.splice(i, 1);
    this.liberarReservas(c!.id);
    return c!.passageiros;
  }

  fila(y: number): Fila {
    let f = this.filas.get(y);
    if (!f) {
      f = { sobe: [], desce: [], reservaSobe: [], reservaDesce: [] };
      this.filas.set(y, f);
    }
    return f;
  }

  /** Pessoa chega ao andar `y` querendo ir para `destino`. Devolve sua posição na fila. */
  chamar(id: number, y: number, destino: number): number {
    const f = this.fila(y);
    const lista = destino > y ? f.sobe : f.desce;
    lista.push(id);
    return lista.length - 1;
  }

  sairDaFila(id: number, y: number): void {
    const f = this.filas.get(y);
    if (!f) return;
    for (const lista of [f.sobe, f.desce]) {
      const i = lista.indexOf(id);
      if (i >= 0) lista.splice(i, 1);
    }
  }

  aguardando(): number {
    let n = 0;
    for (const f of this.filas.values()) n += f.sobe.length + f.desce.length;
    return n;
  }

  /** Todas as pessoas esperando ou dentro de carros (para despejar quando o poço some). */
  todasAsPessoas(): number[] {
    const r: number[] = [];
    for (const f of this.filas.values()) r.push(...f.sobe, ...f.desce);
    for (const c of this.carros) r.push(...c.passageiros);
    return r;
  }

  private liberarReservas(carroId: number): void {
    for (const f of this.filas.values()) {
      tirar(f.reservaSobe, carroId);
      tirar(f.reservaDesce, carroId);
    }
  }

  /**
   * A chamada no sentido `d` está disponível para o carro `c`? Sim se ele a
   * reservou, ou se há mais gente do que os carros já reservados conseguem levar.
   */
  private disponivel(f: Fila, d: Direcao, c: Carro): boolean {
    const fila = d > 0 ? f.sobe : f.desce;
    if (!fila.length) return false;
    const res = d > 0 ? f.reservaSobe : f.reservaDesce;
    return res.includes(c.id) || fila.length > this.capacidade * res.length;
  }

  // ------------------------------------------------------------- simulação

  passo(tick: number, hora: number, p: Passageiros): void {
    for (const c of this.carros) this.passoCarro(c, tick, hora, p);
    // Sem ninguém esperando, a estimativa volta ao normal. Sem isso, um poço
    // que ficou lento seria evitado pelas rotas para sempre e nunca "sararia".
    if (this.esperaMedia > ESPERA_BASE && this.aguardando() === 0) {
      this.esperaMedia = Math.max(ESPERA_BASE, this.esperaMedia * 0.97);
    }
  }

  private passoCarro(c: Carro, tick: number, hora: number, p: Passageiros): void {
    if (c.portas > 0) {
      c.portas--;
      if (c.portas === 0) this.decidir(c, hora);
      return;
    }
    if (c.dir === 0) {
      this.decidir(c, hora);
      if (c.dir === 0) {
        // Ocioso no andar: atende quem estiver esperando aqui.
        if (this.temFila(c.pos)) this.parar(c, tick, p);
        return;
      }
    }
    for (let s = 0; s < VEL_ELEVADOR; s++) {
      const prox = c.pos + c.dir;
      if (prox < this.ymin || prox > this.ymax) {
        c.dir = 0;
        return;
      }
      c.pos = prox;
      if (this.deveParar(c, hora)) {
        this.parar(c, tick, p);
        return;
      }
    }
  }

  private temFila(y: number): boolean {
    const f = this.filas.get(y);
    return !!f && (f.sobe.length > 0 || f.desce.length > 0);
  }

  private deveParar(c: Carro, hora: number): boolean {
    const y = c.pos;
    if (c.paradas.has(y)) return true;
    if (c.reserva && c.reserva.andar === y) return true;
    if (!this.paraEm(y)) return false;
    const f = this.filas.get(y);
    const cheio = c.passageiros.length >= this.capacidade;
    if (f && !cheio) {
      const mesmoSentido = c.dir > 0 ? f.sobe : f.desce;
      if (mesmoSentido.length > 0) return true;
      // Fim do percurso (LOOK): se não há mais nada adiante, pega quem vai no outro sentido.
      const outro = c.dir > 0 ? f.desce : f.sobe;
      if (outro.length > 0 && !this.demandaAdiante(c, c.dir)) return true;
    }
    // Pico da manhã: carro vazio voltando ao lobby para lá.
    if (c.passageiros.length === 0 && this.emPicoManha(hora) && y === this.andarLobby && !this.demandaAdiante(c, c.dir)) {
      return true;
    }
    return false;
  }

  private parar(c: Carro, tick: number, p: Passageiros): void {
    const y = c.pos;
    c.portas = TEMPO_PORTAS;
    c.paradas.delete(y);

    // Desembarque
    if (c.passageiros.length) {
      const ficam: number[] = [];
      for (const id of c.passageiros) {
        if (p.destino(id) === y) p.desembarcou(id, y, this, tick);
        else ficam.push(id);
      }
      c.passageiros = ficam;
    }

    if (c.reserva?.andar === y) {
      this.liberarReserva(c.reserva.andar, c.reserva.dir, c.id);
      c.reserva = null;
    }

    // Embarque: preferir o sentido atual se ainda há demanda nele.
    const f = this.filas.get(y);
    if (!f) {
      if (c.passageiros.length === 0 && c.paradas.size === 0) c.dir = 0;
      return;
    }
    let sentido: Direcao = c.dir;
    const filaDe = (d: Direcao) => (d > 0 ? f.sobe : f.desce);
    if (sentido === 0 || (filaDe(sentido).length === 0 && !this.demandaAdiante(c, sentido))) {
      sentido = f.sobe.length >= f.desce.length && f.sobe.length > 0 ? 1 : f.desce.length > 0 ? -1 : sentido;
    }
    if (sentido === 0) return;
    const fila = filaDe(sentido);
    while (fila.length && c.passageiros.length < this.capacidade) {
      const id = fila.shift()!;
      c.passageiros.push(id);
      c.paradas.add(p.destino(id));
      p.embarcou(id, this, c, tick);
    }
    if (fila.length === 0) this.liberarReserva(y, sentido, 0);
    else this.liberarReserva(y, sentido, c.id);
    c.dir = sentido;
  }

  /** Tira a reserva do carro `soDoCarro` (ou de todos, se 0) na chamada do andar `y`. */
  private liberarReserva(y: number, dir: Direcao, soDoCarro: number): void {
    const f = this.filas.get(y);
    if (!f) return;
    for (const res of dir > 0 ? [f.reservaSobe] : dir < 0 ? [f.reservaDesce] : [f.reservaSobe, f.reservaDesce]) {
      if (soDoCarro === 0) res.length = 0;
      else tirar(res, soDoCarro);
    }
  }

  /** Há paradas próprias ou chamadas não reservadas por outros carros no sentido `d`? */
  private demandaAdiante(c: Carro, d: Direcao): boolean {
    if (d === 0) return false;
    for (const y of c.paradas) if ((y - c.pos) * d > 0) return true;
    if (c.reserva && (c.reserva.andar - c.pos) * d > 0) return true;
    for (const [y, f] of this.filas) {
      if ((y - c.pos) * d <= 0) continue;
      if (this.disponivel(f, 1, c) || this.disponivel(f, -1, c)) return true;
    }
    return false;
  }

  private decidir(c: Carro, hora: number): void {
    if (c.dir !== 0 && this.demandaAdiante(c, c.dir)) return;
    const oposto = -c.dir as Direcao;
    if (c.dir !== 0 && this.demandaAdiante(c, oposto)) {
      c.dir = oposto;
      return;
    }
    // Sem passageiros: reserva a chamada livre mais próxima.
    c.dir = 0;
    if (c.paradas.size > 0) {
      const y = [...c.paradas][0]!;
      c.dir = y > c.pos ? 1 : -1;
      return;
    }
    let melhor: { andar: number; dir: Direcao } | null = null;
    let dist = Infinity;
    for (const [y, f] of this.filas) {
      const d = Math.abs(y - c.pos);
      if (d >= dist || y === c.pos) continue;
      if (this.disponivel(f, 1, c)) {
        melhor = { andar: y, dir: 1 };
        dist = d;
      } else if (this.disponivel(f, -1, c)) {
        melhor = { andar: y, dir: -1 };
        dist = d;
      }
    }
    if (melhor) {
      const f = this.fila(melhor.andar);
      const res = melhor.dir > 0 ? f.reservaSobe : f.reservaDesce;
      if (!res.includes(c.id)) res.push(c.id);
      c.reserva = melhor;
      c.dir = melhor.andar > c.pos ? 1 : -1;
      return;
    }
    // Ocioso: no pico da manhã, volta ao lobby.
    if (this.emPicoManha(hora) && c.pos !== this.andarLobby) c.dir = this.andarLobby > c.pos ? 1 : -1;
  }

  private emPicoManha(hora: number): boolean {
    return this.modo === 'pico_manha' && hora >= 7 && hora < 10;
  }

  /**
   * Espera prevista para quem chegar agora: o maior entre a média recente e o
   * tempo para escoar a fila atual. Usada pelo roteamento.
   */
  esperaEstimada(): number {
    const curso = this.ymax - this.ymin;
    const ciclo = (2 * curso) / VEL_ELEVADOR + 2 * TEMPO_PORTAS * Math.min(10, curso);
    const vazao = Math.max(1, this.carros.length * this.capacidade);
    return Math.max(this.esperaMedia, (this.aguardando() / vazao) * ciclo);
  }

  /** Registra o tempo de espera de alguém que embarcou. */
  registrarEspera(ticks: number): void {
    this.esperaMedia = this.esperaMedia * 0.95 + ticks * 0.05;
    this.atendidos++;
  }
}

function tirar(lista: number[], v: number): void {
  const i = lista.indexOf(v);
  if (i >= 0) lista.splice(i, 1);
}

function tipoCapacidade(id: string): number {
  return tipo(id).capacidade;
}

export interface Escada {
  uid: number;
  tipo: string;
  x: number;
  /** Andar de baixo; liga a y+1. */
  y: number;
  largura: number;
  /** Ticks por andar. */
  tempo: number;
  /** Custo de "esforço" por andar no roteamento (escada 3, rolante 1; limite 6). */
  esforco: number;
}

/** Conjunto do transporte do prédio, sincronizado com as unidades do mundo. */
export class Transito {
  readonly pocos = new Map<number, Poco>();
  escadas: Escada[] = [];

  /**
   * Reconstrói a partir do mundo, preservando carros/filas dos poços que continuam.
   * Devolve as pessoas que estavam em poços removidos (precisam de nova rota).
   */
  sincronizar(mundo: Mundo): number[] {
    const despejadas: number[] = [];
    const vistos = new Set<number>();
    this.escadas = [];
    for (const u of mundo.unidades.values()) {
      if (ehElevador(u.tipo)) {
        vistos.add(u.uid);
        const p = this.pocos.get(u.uid);
        if (!p) this.pocos.set(u.uid, novoPoco(u, mundo));
        else p.atualizarParadas(mundo);
      } else if (ehEscada(u.tipo)) {
        const rolante = u.tipo === 'escada_rolante';
        this.escadas.push({
          uid: u.uid, tipo: u.tipo, x: u.x, y: u.y, largura: u.largura,
          tempo: rolante ? TEMPO_ESCADA_ROLANTE : TEMPO_ESCADA,
          esforco: rolante ? 1 : 3,
        });
      }
    }
    for (const [uid, p] of this.pocos) {
      if (!vistos.has(uid)) {
        despejadas.push(...p.todasAsPessoas());
        this.pocos.delete(uid);
      }
    }
    return despejadas;
  }

  passo(tick: number, hora: number, p: Passageiros): void {
    for (const poco of this.pocos.values()) poco.passo(tick, hora, p);
  }

  manutencaoTrimestral(): number {
    let total = 0;
    for (const p of this.pocos.values()) total += p.carros.length * (MANUTENCAO_CARRO_TRI[p.tipo] ?? 0);
    return total;
  }
}

function novoPoco(u: Unidade, mundo: Mundo): Poco {
  const p = new Poco(u.uid, u.tipo, u.x, u.y, u.y + u.altura - 1, mundo);
  p.adicionarCarro();
  return p;
}
