// Iluminação "pixel + luz" (docs/direcao-de-arte.md §5): a arte continua em
// pixel art nítida, e por cima dela entram luzes suaves em modo aditivo —
// cones das luminárias, brilho de velas e telas, e a luz das cabines de
// elevador. A camada fica acima do escurecimento da noite, então as luzes
// "furam" a escuridão. De dia ela aparece bem fraca.
import { Container, Sprite, Texture } from 'pixi.js';

/** Ponto de luz dentro de uma unidade (px relativos ao canto superior esquerdo). */
export interface PontoLuz {
  x: number;
  y: number;
  /** 0 = cone de luminária no teto, 1 = brilho quente (vela, abajur), 2 = tela. */
  tipo: 0 | 1 | 2;
}

/** Luz posicionada no mundo (px de mundo), com a cor da luz. */
export interface LuzMundo extends PontoLuz {
  cor: number;
}

const COR_TELA = 0x7fd0ff;
const COR_PONTO = 0xffb45a;
const COR_CABINE = 0xfff0c8;

/** Textura suave gerada num canvas (filtro linear: a luz não deve ficar pixelada). */
function texturaCanvas(w: number, h: number, desenhar: (c: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  desenhar(canvas.getContext('2d')!);
  const t = Texture.from(canvas);
  t.source.scaleMode = 'linear';
  return t;
}

/** Cone de luz que desce do teto: forte embaixo da luminária, some nas bordas. */
function texturaCone(): Texture {
  return texturaCanvas(128, 64, (c) => {
    c.save();
    // Raio = meia largura: a luz chega a zero nas laterais (sem borda reta).
    const g = c.createRadialGradient(64, 0, 0, 64, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 64);
    c.restore();
    // Some suave perto do piso, sem borda dura.
    const v = c.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.7, 'rgba(0,0,0,0.6)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = v;
    c.fillRect(0, 0, 128, 64);
  });
}

/** Brilho redondo (velas, telas, cabines). */
function texturaPonto(): Texture {
  return texturaCanvas(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

export class CamadaLuz {
  readonly raiz = new Container();
  private readonly fixas = new Container();
  private readonly cabines = new Container();
  private readonly cone = texturaCone();
  private readonly ponto = texturaPonto();
  private readonly poolFixas: Sprite[] = [];
  private readonly poolCabines: Sprite[] = [];

  constructor() {
    this.fixas.cullableChildren = true;
    this.raiz.addChild(this.fixas, this.cabines);
  }

  /** Troca o conjunto de luzes fixas (unidades e lobbies). Reaproveita sprites. */
  definir(luzes: readonly LuzMundo[]): void {
    let n = 0;
    for (const l of luzes) {
      let s = this.poolFixas[n];
      if (!s) {
        s = new Sprite();
        s.blendMode = 'add';
        s.cullable = true;
        this.fixas.addChild(s);
        this.poolFixas.push(s);
      }
      s.visible = true;
      if (l.tipo === 0) {
        s.texture = this.cone;
        s.anchor.set(0.5, 0);
        s.width = 40;
        s.height = 30;
        s.tint = l.cor;
        s.alpha = 0.6;
      } else {
        s.texture = this.ponto;
        s.anchor.set(0.5, 0.5);
        const tela = l.tipo === 2;
        s.width = s.height = tela ? 14 : 18;
        s.tint = tela ? COR_TELA : COR_PONTO;
        s.alpha = tela ? 0.55 : 0.8;
      }
      s.position.set(l.x, l.y);
      n++;
    }
    for (let k = n; k < this.poolFixas.length; k++) this.poolFixas[k]!.visible = false;
  }

  /** Luz das cabines de elevador visíveis neste quadro: [x, y, w, h] em px de mundo. */
  definirCabines(retangulos: readonly number[]): void {
    let n = 0;
    for (let i = 0; i < retangulos.length; i += 4) {
      let s = this.poolCabines[n];
      if (!s) {
        s = new Sprite(this.ponto);
        s.blendMode = 'add';
        s.anchor.set(0.5, 0.5);
        s.tint = COR_CABINE;
        s.alpha = 0.22;
        this.cabines.addChild(s);
        this.poolCabines.push(s);
      }
      const w = retangulos[i + 2]!;
      const h = retangulos[i + 3]!;
      s.visible = true;
      s.position.set(retangulos[i]! + w / 2, retangulos[i + 1]! + h / 2);
      s.width = w + 20;
      s.height = h + 16;
      n++;
    }
    for (let k = n; k < this.poolCabines.length; k++) this.poolCabines[k]!.visible = false;
  }

  /** 0 = dia (luzes quase apagadas), 1 = noite plena. */
  intensidade(escuro: number): void {
    this.raiz.alpha = 0.1 + 0.9 * escuro;
  }

  /**
   * Luzes fixas só valem a pena de perto: no zoom afastado viram poucos
   * pixels e custam caro com milhares de unidades na tela.
   */
  set detalhada(v: boolean) {
    this.fixas.visible = v;
  }

  get detalhada(): boolean {
    return this.fixas.visible;
  }
}
