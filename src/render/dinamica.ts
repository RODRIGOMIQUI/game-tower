// Camada dinâmica: pessoas e carros de elevador, redesenhados a cada quadro.
// A simulação publica ~20×/s; aqui interpolamos entre as duas últimas
// mensagens para o movimento ficar suave em qualquer velocidade.
import { Graphics, type Container } from 'pixi.js';
import type { Mundo } from '../sim/mundo';
import type { Dinamico } from '../worker/protocolo';
import { ANDAR_PX, COL_PX, LAJE_PX, topoDoAndar } from './camera';
import { COR } from './paleta';

const INTERIOR_PX = ANDAR_PX - LAJE_PX;
const COR_HUMOR = [COR.humorOk, COR.humorIrritado, COR.humorFurioso, COR.vip];
const PASSO_CARRO = 5;

interface Quadro {
  t: number;
  pessoas: Float32Array;
  carros: Float32Array;
}

export class CamadaDinamica {
  private readonly carros = new Graphics();
  private readonly pessoas = new Graphics();
  private readonly fogo = new Graphics();
  private focos: number[] = [];
  private anterior: Quadro | null = null;
  private atual: Quadro | null = null;
  private indiceAnterior = new Map<number, number>();
  private indiceCarrosAnterior = new Map<number, number>();

  constructor(pai: Container) {
    pai.addChild(this.carros, this.pessoas, this.fogo);
  }

  receber(d: Dinamico, agora: number): void {
    this.anterior = this.atual;
    this.atual = { t: agora, pessoas: d.pessoas, carros: d.carros };
    this.focos = d.focos;
    this.indiceAnterior.clear();
    this.indiceCarrosAnterior.clear();
    const a = this.anterior;
    if (!a) return;
    for (let i = 0; i < a.pessoas.length; i += 4) this.indiceAnterior.set(a.pessoas[i]!, i);
    for (const [k, i] of chavesCarros(a.carros)) this.indiceCarrosAnterior.set(k, i);
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

  desenhar(agora: number, mundo: Mundo, escala: number): void {
    const q = this.atual;
    const gc = this.carros.clear();
    const gp = this.pessoas.clear();
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
      gc.rect(x, y, w, h).fill(COR.carro);
      if (carga > 0) {
        const hc = Math.max(2, (h - 4) * (carga / cap));
        gc.rect(x + 2, y + h - 2 - hc, w - 4, hc).fill(COR.carroCarga);
      }
      // Pane: contorno vermelho piscando
      const pisca = emPane && Math.floor(agora / 300) % 2 === 0;
      gc.rect(x + 0.5, y + 0.5, w - 1, h - 1).stroke({ width: emPane ? 2 : 1, color: pisca ? COR.pane : COR.estrutura });
    }

    this.desenharFogo(agora, mundo);

    // Pessoas: corpo 5×12 px com cabeça; cor indica o humor (dourado = VIP).
    const detalhada = escala >= 1;
    const ps = q.pessoas;
    for (let i = 0; i < ps.length; i += 4) {
      let x = ps[i + 1]!;
      let y = ps[i + 2]!;
      const j = this.indiceAnterior.get(ps[i]!);
      if (a && j !== undefined) {
        x = lerp(a.pessoas[j + 1]!, x);
        y = lerp(a.pessoas[j + 2]!, y);
      }
      const cor = COR_HUMOR[ps[i + 3]!] ?? COR.humorOk;
      const px = x * COL_PX;
      const base = topoDoAndar(y) + INTERIOR_PX;
      if (detalhada) {
        gp.rect(px - 2.5, base - 9, 5, 9).fill(cor);
        gp.rect(px - 1.5, base - 12, 3, 3).fill(cor);
      } else gp.rect(px - 2, base - 10, 4, 10).fill(cor);
    }
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
