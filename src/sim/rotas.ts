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

const META = -1;
const ORIGEM = -2;

export class Roteador {
  private segmento = new Int32Array(LARGURA * NUM_ANDARES);
  private elementos: Elemento[] = [];
  private porAndar = new Map<number, number[]>();
  private cache = new Map<string, Perna[] | null>();
  calculadas = 0;

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

  limparCache(): void {
    this.cache.clear();
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
    const chave = `${Math.round(x0)},${y0},${Math.round(x1)},${y1}`;
    const c = this.cache.get(chave);
    if (c !== undefined) return c;
    const r = this.calcular(x0, y0, x1, y1);
    this.cache.set(chave, r);
    return r;
  }

  private calcular(x0: number, y0: number, x1: number, y1: number): Perna[] | null {
    this.calculadas++;
    const segIni = this.segmentoEm(x0, y0);
    const segFim = this.segmentoEm(x1, y1);
    if (!segIni || !segFim) return null;
    if (y0 === y1 && segIni === segFim) return [{ tipo: 'andar', x: x1 }];

    const dist = new Map<number, number>();
    const ant = new Map<number, number>();
    const heap = new Heap();
    const chaveDe = (e: number, y: number, esf: number, via: number) =>
      ((e * NUM_ANDARES + (y - ANDAR_MIN)) * (MAX_ESFORCO + 1) + esf) * (MAX_VIAGENS + 1) + via;
    const relaxar = (k: number, custo: number, de: number) => {
      if (custo < (dist.get(k) ?? Infinity)) {
        dist.set(k, custo);
        ant.set(k, de);
        heap.push(custo, k);
      }
    };

    for (const e of this.porAndar.get(y0) ?? []) {
      const el = this.elementos[e]!;
      if (this.segmentoEm(el.x, y0) !== segIni) continue;
      relaxar(chaveDe(e, y0, 0, 0), Math.abs(el.x - x0) / VEL_CAMINHADA, ORIGEM);
    }

    while (heap.tamanho) {
      const [d, k] = heap.pop();
      if (k === META) return this.montar(ant, x1);
      if (d > (dist.get(k) ?? Infinity)) continue;
      const via = k % (MAX_VIAGENS + 1);
      const esf = Math.floor(k / (MAX_VIAGENS + 1)) % (MAX_ESFORCO + 1);
      const no = Math.floor(k / ESTADOS_POR_NO);
      const e = Math.floor(no / NUM_ANDARES);
      const y = (no % NUM_ANDARES) + ANDAR_MIN;
      const el = this.elementos[e]!;
      const seg = this.segmentoEm(el.x, y);

      // Chegar ao destino
      if (y === y1 && seg === segFim) relaxar(META, d + Math.abs(el.x - x1) / VEL_CAMINHADA, k);

      // Baldeação a pé no mesmo andar
      for (const e2 of this.porAndar.get(y) ?? []) {
        if (e2 === e) continue;
        const el2 = this.elementos[e2]!;
        if (this.segmentoEm(el2.x, y) !== seg) continue;
        const pen = el2.poco ? PENALIDADE_BALDEACAO : 1;
        relaxar(chaveDe(e2, y, esf, via), d + Math.abs(el2.x - el.x) / VEL_CAMINHADA + pen, k);
      }

      // Viajar no elemento
      if (el.poco) {
        if (via >= MAX_VIAGENS) continue;
        const espera = el.poco.esperaEstimada();
        for (const y2 of el.andares) {
          if (y2 === y) continue;
          const dy = Math.abs(y2 - y);
          const custo = espera + dy / VEL_ELEVADOR + TEMPO_PORTAS * (1 + Math.min(dy, 6) * 0.5);
          relaxar(chaveDe(e, y2, esf, via + 1), d + custo, k);
        }
      } else {
        const y2 = y === el.andares[0] ? el.andares[1]! : el.andares[0]!;
        const esf2 = esf + el.esforco;
        if (esf2 <= MAX_ESFORCO) relaxar(chaveDe(e, y2, esf2, via), d + el.tempo, k);
      }
    }
    return null;
  }

  private montar(ant: Map<number, number>, x1: number): Perna[] {
    // Caminho de nós (elemento, andar), da origem à meta.
    const nos: { e: number; y: number }[] = [];
    let k = ant.get(META)!;
    while (k !== ORIGEM) {
      const no = Math.floor(k / ESTADOS_POR_NO);
      nos.push({ e: Math.floor(no / NUM_ANDARES), y: (no % NUM_ANDARES) + ANDAR_MIN });
      k = ant.get(k)!;
    }
    nos.reverse();

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
