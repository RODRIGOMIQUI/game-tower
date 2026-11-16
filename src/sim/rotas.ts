// Roteamento pelo prédio. Ver docs/gdd.md §6.2.
//
// Grafo: nós = (elemento de transporte, andar). Arestas = viagem no elemento
// (elevador entre andares que ele atende; escada para o andar vizinho) e
// caminhada no mesmo andar entre elementos do mesmo trecho contínuo de piso.
// O estado carrega quantas viagens de elevador (limite de baldeações) e quanto
// "esforço" de escada já foi gasto (ninguém sobe muitos andares a pé).

import { ANDAR_MIN, Est, idx, LARGURA, NUM_ANDARES, type Mundo } from './mundo';
import { TEMPO_PORTAS, VEL_ELEVADOR, type Poco, type Transito } from './transito';

/** Colunas por tick. */
export const VEL_CAMINHADA = 2;
/** Viagens de elevador por rota (= até 3 baldeações). */
export const MAX_VIAGENS = 4;
/** Esforço máximo de escada por rota: escada comum custa 3/andar, rolante 1/andar. */
export const MAX_ESFORCO = 6;
const PENALIDADE_BALDEACAO = 3;
const ESTADOS_POR_NO = (MAX_ESFORCO + 1) * (MAX_VIAGENS + 1);

export type Perna =
  | { tipo: 'andar'; x: number }
  | { tipo: 'elevador'; uid: number; de: number; para: number }
  | { tipo: 'escada'; uid: number; de: number; para: number; tempo: number };

interface Elemento {
  uid: number;
  x: number;
  /** Andares atendidos, em ordem. */
  andares: number[];
  poco?: Poco;
  /** Escada: ticks por andar e esforço por andar. */
  tempo: number;
  esforco: number;
}

const ORIGEM = -2;

/** Chave numérica de um ponto (coluna arredondada, andar). */
function chavePonto(x: number, y: number): number {
  return Math.round(x) * NUM_ANDARES + (y - ANDAR_MIN);
}

/**
 * Árvore de menores caminhos a partir de um ponto (Dijkstra completo).
 * Uma árvore responde rotas para qualquer destino; como o grafo é simétrico,
 * também responde rotas *até* o ponto (basta inverter o caminho).
 */
interface Arvore {
  x: number;
  y: number;
  seg: number;
  dist: Map<number, number>;
  ant: Map<number, number>;
  /** Por nó (elemento, andar): chave do estado de menor custo já fechado. */
  melhorNo: Map<number, number>;
}

export class Roteador {
  private segmento = new Int32Array(LARGURA * NUM_ANDARES);
  private elementos: Elemento[] = [];
  private porAndar = new Map<number, number[]>();
  private cache = new Map<number, Perna[] | null>();
  private arvores = new Map<number, Arvore>();
  /** Quantas consultas usaram cada ponto: a raiz da árvore é o mais usado. */
  private usos = new Map<number, number>();
  /** Espera estimada por elemento, congelada ao montar cada árvore. */
  private esperas: number[] = [];
  /** Rotas pedidas (com ou sem cache). */
  calculadas = 0;
  /** Árvores de Dijkstra montadas. */
  arvoresMontadas = 0;

  /** `incluirServico`: equipe pode usar elevadores de serviço. */
  constructor(private readonly incluirServico = false) {}

  reconstruir(mundo: Mundo, transito: Transito): void {
    this.calcularSegmentos(mundo);
    this.elementos = [];
    this.porAndar.clear();
    for (const p of transito.pocos.values()) {
      if (p.tipo === 'elevador_servico' && !this.incluirServico) continue; // só equipe
      this.adicionar({ uid: p.uid, x: p.xCentro, andares: [...p.paradasValidas].sort((a, b) => a - b), poco: p, tempo: 0, esforco: 0 });
    }
    for (const e of transito.escadas) {
      this.adicionar({ uid: e.uid, x: e.x + e.largura / 2, andares: [e.y, e.y + 1], tempo: e.tempo, esforco: e.esforco });
    }
    this.limparCache();
  }

  /** Esquece rotas e árvores (as esperas mudaram ou o prédio mudou). */
  limparCache(): void {
    this.cache.clear();
    this.arvores.clear();
    this.usos.clear();
  }

  private adicionar(e: Elemento): void {
    const i = this.elementos.push(e) - 1;
    for (const y of e.andares) {
      let l = this.porAndar.get(y);
      if (!l) this.porAndar.set(y, (l = []));
      l.push(i);
    }
  }

  private calcularSegmentos(m: Mundo): void {
    this.segmento.fill(0);
    let id = 0;
    for (let y = ANDAR_MIN; y < ANDAR_MIN + NUM_ANDARES; y++) {
      let ant = false;
      for (let x = 0; x < LARGURA; x++) {
        const tem = m.est(x, y) !== Est.Vazio;
        if (tem && !ant) id++;
        if (tem) this.segmento[idx(x, y)] = id;
        ant = tem;
      }
    }
  }

  /** Trecho contínuo de piso na posição (0 = sem piso). */
  segmentoEm(x: number, y: number): number {
    const xi = Math.min(LARGURA - 1, Math.max(0, Math.floor(x)));
    if (y < ANDAR_MIN || y >= ANDAR_MIN + NUM_ANDARES) return 0;
    return this.segmento[idx(xi, y)]!;
  }

  /** Menor rota de (x0,y0) a (x1,y1), ou null se não houver. Usa cache. */
  rota(x0: number, y0: number, x1: number, y1: number): Perna[] | null {
    this.calculadas++;
    const pa = chavePonto(x0, y0);
    const pb = chavePonto(x1, y1);
    const chave = pa * LARGURA * NUM_ANDARES + pb;
    const c = this.cache.get(chave);
    if (c !== undefined) return c;
    const r = this.calcular(x0, y0, x1, y1, pa, pb);
    this.cache.set(chave, r);
    return r;
  }

  private calcular(x0: number, y0: number, x1: number, y1: number, pa: number, pb: number): Perna[] | null {
    const segIni = this.segmentoEm(x0, y0);
    const segFim = this.segmentoEm(x1, y1);
    if (!segIni || !segFim) return null;
    if (y0 === y1 && segIni === segFim) return [{ tipo: 'andar', x: x1 }];

    // Raiz: ponta que já tem árvore, ou a mais consultada (entradas, lanchonetes…).
    const ua = (this.usos.get(pa) ?? 0) + 1;
    const ub = (this.usos.get(pb) ?? 0) + 1;
    this.usos.set(pa, ua);
    this.usos.set(pb, ub);
    let arv = this.arvores.get(pa);
    let invertida = false;
    if (!arv) {
      const doDestino = this.arvores.get(pb);
      if (doDestino) {
        arv = doDestino;
        invertida = true;
      } else if (ub > ua) {
        arv = this.montarArvore(x1, y1, segFim, pb);
        invertida = true;
      } else arv = this.montarArvore(x0, y0, segIni, pa);
    }
    // A outra ponta da rota, vista a partir da raiz.
    const [xp, yp, segP] = invertida ? [x0, y0, segIni] : [x1, y1, segFim];

    let melhor = Infinity;
    let fim = -1;
    for (const e of this.porAndar.get(yp) ?? []) {
      const el = this.elementos[e]!;
      if (this.segmentoEm(el.x, yp) !== segP) continue;
      const k = arv.melhorNo.get(e * NUM_ANDARES + (yp - ANDAR_MIN));
      if (k === undefined) continue;
      const d = arv.dist.get(k)! + Math.abs(el.x - xp) / VEL_CAMINHADA;
      if (d < melhor) {
        melhor = d;
        fim = k;
      }
    }
    if (fim < 0) return null;

    // Nós (elemento, andar) da raiz até a outra ponta; na ordem da rota pedida.
    const nos: { e: number; y: number }[] = [];
    for (let k = fim; k !== ORIGEM; k = arv.ant.get(k)!) {
      const no = Math.floor(k / ESTADOS_POR_NO);
      nos.push({ e: Math.floor(no / NUM_ANDARES), y: (no % NUM_ANDARES) + ANDAR_MIN });
    }
    if (!invertida) nos.reverse();
    return this.montar(nos, x1);
  }

  /** Dijkstra completo a partir de (x,y). */
  private montarArvore(x: number, y: number, seg: number, chave: number): Arvore {
    this.arvoresMontadas++;
    this.esperas = this.elementos.map((el) => (el.poco ? el.poco.esperaEstimada() : 0));
    const dist = new Map<number, number>();
    const ant = new Map<number, number>();
    const melhorNo = new Map<number, number>();
    const heap = new Heap();
    const chaveDe = (e: number, yy: number, esf: number, via: number) =>
      ((e * NUM_ANDARES + (yy - ANDAR_MIN)) * (MAX_ESFORCO + 1) + esf) * (MAX_VIAGENS + 1) + via;
    const relaxar = (k: number, custo: number, de: number) => {
      const atual = dist.get(k);
      if (atual === undefined || custo < atual) {
        dist.set(k, custo);
        ant.set(k, de);
        heap.push(custo, k);
      }
    };

    for (const e of this.porAndar.get(y) ?? []) {
      const el = this.elementos[e]!;
      if (this.segmentoEm(el.x, y) !== seg) continue;
      relaxar(chaveDe(e, y, 0, 0), Math.abs(el.x - x) / VEL_CAMINHADA, ORIGEM);
    }

    while (heap.tamanho) {
      const [d, k] = heap.pop();
      if (d > dist.get(k)!) continue;
      const via = k % (MAX_VIAGENS + 1);
      const esf = Math.floor(k / (MAX_VIAGENS + 1)) % (MAX_ESFORCO + 1);
      const no = Math.floor(k / ESTADOS_POR_NO);
      // O primeiro estado fechado de cada nó é o mais barato para chegar até ele.
      if (!melhorNo.has(no)) melhorNo.set(no, k);
      const e = Math.floor(no / NUM_ANDARES);
      const yy = (no % NUM_ANDARES) + ANDAR_MIN;
      const el = this.elementos[e]!;
      const segAqui = this.segmentoEm(el.x, yy);

      // Baldeação a pé no mesmo andar
      for (const e2 of this.porAndar.get(yy) ?? []) {
        if (e2 === e) continue;
        const el2 = this.elementos[e2]!;
        if (this.segmentoEm(el2.x, yy) !== segAqui) continue;
        const pen = el2.poco ? PENALIDADE_BALDEACAO : 1;
        relaxar(chaveDe(e2, yy, esf, via), d + Math.abs(el2.x - el.x) / VEL_CAMINHADA + pen, k);
      }

      // Viajar no elemento
      if (el.poco) {
        if (via >= MAX_VIAGENS) continue;
        const espera = this.esperas[e]!;
        for (const y2 of el.andares) {
          if (y2 === yy) continue;
          const dy = Math.abs(y2 - yy);
          const custo = espera + dy / VEL_ELEVADOR + TEMPO_PORTAS * (1 + Math.min(dy, 6) * 0.5);
          relaxar(chaveDe(e, y2, esf, via + 1), d + custo, k);
        }
      } else {
        const y2 = yy === el.andares[0] ? el.andares[1]! : el.andares[0]!;
        const esf2 = esf + el.esforco;
        if (esf2 <= MAX_ESFORCO) relaxar(chaveDe(e, y2, esf2, via), d + el.tempo, k);
      }
    }
    const arv = { x, y, seg, dist, ant, melhorNo };
    this.arvores.set(chave, arv);
    return arv;
  }

  /** Pernas a partir dos nós (elemento, andar) na ordem da rota, terminando em x1. */
  private montar(nos: { e: number; y: number }[], x1: number): Perna[] {
    const pernas: Perna[] = [];
    const andar = (x: number) => {
      const ult = pernas[pernas.length - 1];
      if (ult?.tipo === 'andar') ult.x = x;
      else pernas.push({ tipo: 'andar', x });
    };
    andar(this.elementos[nos[0]!.e]!.x);
    for (let i = 1; i < nos.length; i++) {
      const a = nos[i - 1]!;
      const b = nos[i]!;
      const el = this.elementos[b.e]!;
      if (a.e === b.e) {
        pernas.push(
          el.poco
            ? { tipo: 'elevador', uid: el.uid, de: a.y, para: b.y }
            : { tipo: 'escada', uid: el.uid, de: a.y, para: b.y, tempo: el.tempo },
        );
      } else andar(el.x);
    }
    andar(x1);
    return pernas;
  }
}

/** Heap binário mínimo de (custo, chave). */
class Heap {
  private custos: number[] = [];
  private chaves: number[] = [];

  get tamanho(): number {
    return this.custos.length;
  }

  push(c: number, k: number): void {
    const cs = this.custos;
    const ks = this.chaves;
    let i = cs.push(c) - 1;
    ks.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cs[p]! <= c) break;
      cs[i] = cs[p]!;
      ks[i] = ks[p]!;
      i = p;
    }
    cs[i] = c;
    ks[i] = k;
  }

  pop(): [number, number] {
    const cs = this.custos;
    const ks = this.chaves;
    const topo: [number, number] = [cs[0]!, ks[0]!];
    const c = cs.pop()!;
    const k = ks.pop()!;
    if (cs.length) {
      let i = 0;
      const n = cs.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && cs[r]! < cs[l]! ? r : l;
        if (cs[m]! >= c) break;
        cs[i] = cs[m]!;
        ks[i] = ks[m]!;
        i = m;
      }
      cs[i] = c;
      ks[i] = k;
    }
    return topo;
  }
}
