// Camada dinâmica: pessoas e carros de elevador, redesenhados a cada quadro.
// A simulação publica ~20×/s; aqui interpolamos entre as duas últimas
// mensagens para o movimento ficar suave em qualquer velocidade.
import { Graphics, type Container } from 'pixi.js';
import type { Mundo } from '../sim/mundo';
import type { Dinamico } from '../worker/protocolo';
import { ANDAR_PX, COL_PX, LAJE_PX, topoDoAndar } from './camera';
import { COR } from './paleta';

const INTERIOR_PX = ANDAR_PX - LAJE_PX;
const COR_HUMOR = [COR.humorOk, COR.humorIrritado, COR.humorFurioso];

interface Quadro {
  t: number;
  pessoas: Float32Array;
  carros: Float32Array;
}

export class CamadaDinamica {
  private readonly carros = new Graphics();
  private readonly pessoas = new Graphics();
  private anterior: Quadro | null = null;
  private atual: Quadro | null = null;
  private indiceAnterior = new Map<number, number>();
  private indiceCarrosAnterior = new Map<number, number>();

  constructor(pai: Container) {
    pai.addChild(this.carros, this.pessoas);
  }

  receber(d: Dinamico, agora: number): void {
    this.anterior = this.atual;
    this.atual = { t: agora, pessoas: d.pessoas, carros: d.carros };
    this.indiceAnterior.clear();
    this.indiceCarrosAnterior.clear();
    const a = this.anterior;
    if (!a) return;
    for (let i = 0; i < a.pessoas.length; i += 4) this.indiceAnterior.set(a.pessoas[i]!, i);
    for (const [k, i] of chavesCarros(a.carros)) this.indiceCarrosAnterior.set(k, i);
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
      const x = (poco.x + 0.5) * COL_PX;
      const w = (poco.largura - 1) * COL_PX;
      const y = topoDoAndar(pos) + 2;
      const h = INTERIOR_PX - 2;
      gc.rect(x, y, w, h).fill(COR.carro);
      if (carga > 0) {
        const hc = Math.max(2, (h - 4) * (carga / cap));
        gc.rect(x + 2, y + h - 2 - hc, w - 4, hc).fill(COR.carroCarga);
      }
      gc.rect(x + 0.5, y + 0.5, w - 1, h - 1).stroke({ width: 1, color: COR.estrutura });
    }

    // Pessoas: corpo 5×12 px com cabeça; cor indica o humor.
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

/** Chave estável por carro: uid do poço × 16 + índice do carro no poço. */
function* chavesCarros(c: Float32Array): Generator<[number, number]> {
  let ultimo = -1;
  let k = 0;
  for (let i = 0; i < c.length; i += 4) {
    const uid = c[i]!;
    k = uid === ultimo ? k + 1 : 0;
    ultimo = uid;
    yield [uid * 16 + k, i];
  }
}
