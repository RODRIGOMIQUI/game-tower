// Camada dinâmica: pessoas e carros de elevador, redesenhados a cada quadro.
// A simulação publica ~20×/s; aqui interpolamos entre as duas últimas
// mensagens para o movimento ficar suave em qualquer velocidade.
import { Graphics, Particle, ParticleContainer, Rectangle, Texture, type Container, type Renderer } from 'pixi.js';
import type { Mundo } from '../sim/mundo';
import type { Dinamico } from '../worker/protocolo';
import { ANDAR_PX, COL_PX, LAJE_PX, topoDoAndar } from './camera';
import { COR } from './paleta';

const INTERIOR_PX = ANDAR_PX - LAJE_PX;
/** Célula de cada pessoa na folha de texturas (inclui espaço do balão). */
const CEL_L = 8;
const CEL_A = 24;

interface AtlasPessoas {
  base: Texture;
  /** roupa × pele × quadro(3) × balão(3) */
  corpo: Texture[];
  /** pele × quadro (VIP, roupa dourada e coroa) */
  vip: Texture[];
  /** silhueta simples para zoom afastado, por roupa */
  lod: Texture[];
}

function indiceCorpo(roupa: number, pele: number, quadro: number, balao: number): number {
  return ((roupa * PELES.length + pele) * 3 + quadro) * 3 + balao;
}

/**
 * Gera uma única textura com todas as variações de pessoa (para desenhar em
 * lote). Cada célula tem 8×24 px: balão no topo, corpo embaixo, pés na base.
 */
function gerarAtlas(renderer: Renderer): AtlasPessoas {
  const g = new Graphics();
  const celulas: [number, number][] = [];
  const colunas = 32;
  let n = 0;
  const proxima = (): [number, number] => {
    const c: [number, number] = [(n % colunas) * CEL_L, Math.floor(n / colunas) * CEL_A];
    n++;
    celulas.push(c);
    return c;
  };
  const r = (x: number, y: number, w: number, h: number, cor: number) => g.rect(x, y, w, h).fill(cor);
  const corpo = (ox: number, oy: number, roupa: number, pele: number, calca: number, cabelo: number, quadro: number, balao: number, vip: boolean) => {
    const px = ox + 1;
    const base = oy + CEL_A;
    // pernas: parado (0) ou passo A/B (1/2)
    r(px + (quadro === 1 ? 0 : 1), base - 4, 1, 4, calca);
    r(px + (quadro === 2 ? 4 : 3), base - 4, 1, 4, calca);
    r(px + 1, base - 5, 3, 1, calca);
    r(px, base - 10, 5, 5, roupa);
    r(px + 1, base - 13, 3, 3, pele);
    r(px + 1, base - 14, 3, 1, cabelo);
    if (vip) r(px + 1, base - 16, 3, 2, COR.vip);
    if (balao) {
      const cor = balao === 2 ? COR.humorFurioso : COR.humorIrritado;
      r(ox, oy, CEL_L - 1, 6, cor);
      r(ox + 3, oy + 6, 1, 1, cor);
      if (balao === 2) {
        r(ox + 2, oy + 1, 1, 3, 0xffffff);
        r(ox + 4, oy + 1, 1, 3, 0xffffff);
      } else r(ox + 3, oy + 1, 1, 3, 0xffffff);
    }
  };
  const idsCorpo: number[] = [];
  for (let ro = 0; ro < ROUPAS.length; ro++) for (let pe = 0; pe < PELES.length; pe++) for (let q = 0; q < 3; q++) for (let b = 0; b < 3; b++) {
    const [ox, oy] = proxima();
    corpo(ox, oy, ROUPAS[ro]!, PELES[pe]!, CALCAS[(ro * 3 + pe) % CALCAS.length]!, CABELOS[(ro + pe) % CABELOS.length]!, q, b, false);
    idsCorpo.push(n - 1);
  }
  const idsVip: number[] = [];
  for (let pe = 0; pe < PELES.length; pe++) for (let q = 0; q < 3; q++) {
    const [ox, oy] = proxima();
    corpo(ox, oy, COR.vip, PELES[pe]!, CALCAS[0]!, CABELOS[pe % CABELOS.length]!, q, 0, true);
    idsVip.push(n - 1);
  }
  const idsLod: number[] = [];
  for (let ro = 0; ro < ROUPAS.length; ro++) {
    const [ox, oy] = proxima();
    r(ox + 2, oy + CEL_A - 10, 4, 10, ROUPAS[ro]!);
    idsLod.push(n - 1);
  }
  const linhas = Math.ceil(n / colunas);
  const base = renderer.generateTexture({ target: g, resolution: 1, frame: new Rectangle(0, 0, colunas * CEL_L, linhas * CEL_A) });
  base.source.scaleMode = 'nearest';
  g.destroy();
  const sub = (i: number) => {
    const [x, y] = celulas[i]!;
    return new Texture({ source: base.source, frame: new Rectangle(x, y, CEL_L, CEL_A) });
  };
  return { base, corpo: idsCorpo.map(sub), vip: idsVip.map(sub), lod: idsLod.map(sub) };
}

// Variedade das pessoas (roupas, calças, tons de pele, cabelos).
const ROUPAS = [0x4a78b8, 0xc8483f, 0x5d9a4f, 0xe8c547, 0x8e6bb8, 0xe38a4b, 0x2b2f3a, 0xf4f4f0, 0x3a8a8a, 0xe89ab0];
const CALCAS = [0x2b2f3a, 0x3b4a6a, 0x5e4630, 0x6e7178];
const PELES = [0xf1c9a5, 0xe0b48a, 0xc68e62, 0x9a6440, 0x6e4529];
const CABELOS = [0x2b2018, 0x5e3a1e, 0xb08a4a, 0x1a1a1a, 0x8a8a8a, 0xa0522d];

function mistura(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  return h >>> 0;
}
const PASSO_CARRO = 5;

interface Quadro {
  t: number;
  pessoas: Float32Array;
  carros: Float32Array;
}

export class CamadaDinamica {
  private readonly carros = new Graphics();
  private readonly pessoas: ParticleContainer;
  private readonly pool: Particle[] = [];
  private readonly atlas: AtlasPessoas;
  private readonly fogo = new Graphics();
  private focos: number[] = [];
  private anterior: Quadro | null = null;
  private atual: Quadro | null = null;
  private indiceAnterior = new Map<number, number>();
  private indiceCarrosAnterior = new Map<number, number>();
  /** Último andar e se estava andando, por carro (para o "ding" ao parar). */
  private movimento = new Map<number, { pos: number; andando: boolean }>();

  constructor(pai: Container, renderer: Renderer) {
    this.atlas = gerarAtlas(renderer);
    // Pessoas: milhares de sprites da mesma folha de texturas, desenhados em lote.
    this.pessoas = new ParticleContainer({
      dynamicProperties: { position: true, uvs: true, vertex: false, rotation: false, color: false },
      texture: this.atlas.base,
    });
    pai.addChild(this.carros, this.pessoas, this.fogo);
  }

  /**
   * Recebe um quadro da simulação. Devolve onde carros acabaram de parar
   * (coluna, andar), para o som do elevador.
   */
  receber(d: Dinamico, agora: number): { x: number; y: number }[] {
    const paradas: { x: number; y: number }[] = [];
    for (const [k, i] of chavesCarros(d.carros)) {
      const pos = d.carros[i + 1]!;
      const ant = this.movimento.get(k);
      const andando = !!ant && ant.pos !== pos;
      if (ant?.andando && !andando && d.carros[i + 2]! > 0) paradas.push({ x: d.carros[i]!, y: pos });
      this.movimento.set(k, { pos, andando });
    }
    this.anterior = this.atual;
    this.atual = { t: agora, pessoas: d.pessoas, carros: d.carros };
    this.focos = d.focos;
    this.indiceAnterior.clear();
    this.indiceCarrosAnterior.clear();
    const a = this.anterior;
    if (!a) return paradas;
    for (let i = 0; i < a.pessoas.length; i += 4) this.indiceAnterior.set(a.pessoas[i]!, i);
    for (const [k, i] of chavesCarros(a.carros)) this.indiceCarrosAnterior.set(k, i);
    return paradas;
  }

  /** Quantas pessoas estão visíveis no último quadro. */
  get visiveis(): number {
    return (this.atual?.pessoas.length ?? 0) / 4;
  }

  private desenharFogo(agora: number, mundo: Mundo): void {
    const g = this.fogo.clear();
    for (const uid of this.focos) {
      const u = mundo.unidades.get(uid);
      if (!u) continue;
      const y = topoDoAndar(u.y + u.altura - 1);
      chamas(g, agora, uid, u.x * COL_PX, y, u.largura * COL_PX, u.altura * ANDAR_PX - LAJE_PX);
    }
  }

  /** Posição interpolada (coluna, andar) de uma pessoa visível, para a câmera seguir. */
  posicao(id: number, agora: number): { x: number; y: number } | null {
    const q = this.atual;
    if (!q) return null;
    for (let i = 0; i < q.pessoas.length; i += 4) {
      if (q.pessoas[i] !== id) continue;
      let x = q.pessoas[i + 1]!;
      let y = q.pessoas[i + 2]!;
      const a = this.anterior;
      const j = this.indiceAnterior.get(id);
      if (a && j !== undefined) {
        const t = Math.min(1, (agora - q.t) / Math.max(1, q.t - a.t));
        x = a.pessoas[j + 1]! + (x - a.pessoas[j + 1]!) * t;
        y = a.pessoas[j + 2]! + (y - a.pessoas[j + 2]!) * t;
      }
      return { x, y };
    }
    return null;
  }

  /** Posições (coluna, andar) de todas as pessoas visíveis no último quadro. */
  *posicoes(): Generator<[number, number]> {
    const q = this.atual;
    if (!q) return;
    for (let i = 0; i < q.pessoas.length; i += 4) yield [q.pessoas[i + 1]!, q.pessoas[i + 2]!];
  }

  /** Pessoa visível mais próxima de (coluna, andar fracionário), dentro de `raio` colunas. */
  pessoaEm(x: number, y: number, raio: number): number {
    const q = this.atual;
    if (!q) return 0;
    let melhor = 0;
    let dist = raio;
    for (let i = 0; i < q.pessoas.length; i += 4) {
      if (Math.abs(q.pessoas[i + 2]! - y) > 0.6) continue;
      const d = Math.abs(q.pessoas[i + 1]! - x);
      if (d < dist) {
        dist = d;
        melhor = q.pessoas[i]!;
      }
    }
    return melhor;
  }

  /**
   * `visivel`: retângulo do mundo na tela (px de mundo), para não desenhar o
   * que está fora dela.
   */
  desenhar(agora: number, mundo: Mundo, escala: number, visivel: { x0: number; y0: number; x1: number; y1: number }): void {
    const q = this.atual;
    const gc = this.carros.clear();
    if (!q) return;
    const a = this.anterior;
    const intervalo = a ? Math.max(1, q.t - a.t) : 1;
    const t = a ? Math.min(1, (agora - q.t) / intervalo) : 1;
    const lerp = (v0: number, v1: number) => v0 + (v1 - v0) * t;

    // Carros: interpolam do quadro anterior para o atual.
    for (const [k, i] of chavesCarros(q.carros)) {
      const uid = q.carros[i]!;
      const poco = mundo.unidades.get(uid);
      if (!poco) continue;
      let pos = q.carros[i + 1]!;
      const j = this.indiceCarrosAnterior.get(k);
      if (a && j !== undefined) pos = lerp(a.carros[j + 1]!, pos);
      const carga = q.carros[i + 2]!;
      const cap = q.carros[i + 3]!;
      const emPane = q.carros[i + 4]! > 0;
      const x = (poco.x + 0.5) * COL_PX;
      const w = (poco.largura - 1) * COL_PX;
      const y = topoDoAndar(pos) + 2;
      const h = INTERIOR_PX - 2;
      if (x > visivel.x1 || x + w < visivel.x0 || y > visivel.y1 || y + h < visivel.y0) continue;
      // Cabine: luz interna, cabeças dos passageiros e portas.
      gc.rect(x, y, w, h).fill(0xfff6dc);
      const n = Math.min(Math.round(carga), 12);
      for (let k = 0; k < n; k++) {
        const hx = x + 3 + (k % 6) * ((w - 6) / 6);
        const hy = y + h - 12 - Math.floor(k / 6) * 3;
        gc.rect(hx, hy + 3, 3, 9).fill(ROUPAS[k % ROUPAS.length]!);
        gc.rect(hx, hy, 3, 3).fill(PELES[k % PELES.length]!);
      }
      if (carga >= cap) gc.rect(x, y, w, 2).fill(COR.carroCarga); // lotado
      gc.rect(x + w / 2 - 0.5, y + 4, 1, h - 4).fill({ color: 0x9aa3b0, alpha: 0.7 });
      // Pane: contorno vermelho piscando
      const pisca = emPane && Math.floor(agora / 300) % 2 === 0;
      gc.rect(x + 0.5, y + 0.5, w - 1, h - 1).stroke({ width: emPane ? 2 : 1, color: pisca ? COR.pane : COR.estrutura });
    }

    this.desenharFogo(agora, mundo);

    // Pessoas: um sprite por pessoa visível, tirado da folha de texturas.
    const detalhada = escala >= 1;
    const ps = q.pessoas;
    let n = 0;
    for (let i = 0; i < ps.length; i += 4) {
      const id = ps[i]!;
      let x = ps[i + 1]!;
      let y = ps[i + 2]!;
      const j = this.indiceAnterior.get(id);
      let andando = false;
      if (a && j !== undefined) {
        andando = a.pessoas[j + 1] !== x;
        x = lerp(a.pessoas[j + 1]!, x);
        y = lerp(a.pessoas[j + 2]!, y);
      }
      const px = Math.round(x * COL_PX - CEL_L / 2);
      const py = Math.round(topoDoAndar(y) + INTERIOR_PX - CEL_A);
      if (px > visivel.x1 || px + CEL_L < visivel.x0 || py > visivel.y1 || py + CEL_A < visivel.y0) continue;
      const humor = ps[i + 3]!;
      const h = mistura(id);
      let tex: Texture;
      if (!detalhada) tex = this.atlas.lod[h % ROUPAS.length]!;
      else {
        const quadro = andando ? 1 + (Math.floor(x * 3) % 2) : 0;
        const bal = humor === 1 || humor === 2 ? humor : 0;
        tex =
          humor === 3
            ? this.atlas.vip[((h >>> 6) % PELES.length) * 3 + quadro]!
            : this.atlas.corpo[indiceCorpo(h % ROUPAS.length, (h >>> 6) % PELES.length, quadro, bal)]!;
      }
      let p = this.pool[n];
      if (!p) {
        p = new Particle({ texture: tex, x: px, y: py });
        this.pool.push(p);
        this.pessoas.addParticle(p);
      } else {
        p.texture = tex;
        p.x = px;
        p.y = py;
      }
      n++;
    }
    // Sobras do pool ficam fora da tela.
    for (let k = n; k < this.pool.length; k++) this.pool[k]!.x = -1e6;
  }
}

/** Chamas tremulando e fumaça sobre as unidades em chamas. */
function chamas(g: Graphics, agora: number, uid: number, x: number, y: number, w: number, h: number): void {
  g.rect(x, y, w, h).fill({ color: COR.fogo, alpha: 0.35 });
  const n = Math.max(2, Math.floor(w / 6));
  for (let i = 0; i < n; i++) {
    const fase = Math.sin(agora / 120 + i * 1.7 + uid);
    const alt = h * (0.45 + 0.35 * (fase * 0.5 + 0.5));
    const fx = x + (i + 0.5) * (w / n) - 2.5;
    g.rect(fx, y + h - alt, 5, alt).fill({ color: COR.fogo, alpha: 0.9 });
    g.rect(fx + 1, y + h - alt * 0.6, 3, alt * 0.6).fill({ color: COR.fogoClaro, alpha: 0.95 });
    const fumaca = (agora / 40 + i * 13) % 30;
    g.circle(fx + 2.5, y - fumaca, 3 + fumaca / 6).fill({ color: COR.fumaca, alpha: 0.5 * (1 - fumaca / 30) });
  }
}

/** Chave estável por carro: uid do poço × 16 + índice do carro no poço. */
function* chavesCarros(c: Float32Array): Generator<[number, number]> {
  let ultimo = -1;
  let k = 0;
  for (let i = 0; i < c.length; i += PASSO_CARRO) {
    const uid = c[i]!;
    k = uid === ultimo ? k + 1 : 0;
    ultimo = uid;
    yield [uid * 16 + k, i];
  }
}
