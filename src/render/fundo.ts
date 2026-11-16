// Fundo: sol, lua, estrelas, nuvens e a cidade ao longe (com paralaxe).
// Tudo procedural e original (docs/direcao-de-arte.md §5).
import { Container, Graphics, Rectangle, TilingSprite, type Renderer, type Texture } from 'pixi.js';
import { Rng } from '../sim/rng';
import { escuridao } from './paleta';

const LARGURA_CIDADE = 1600;
const ALTURA_CIDADE = 260;

export class Fundo {
  readonly raiz = new Container();
  private readonly astros = new Graphics();
  private readonly estrelas = new Graphics();
  private readonly nuvens = new Graphics();
  private readonly cidadeLonge: TilingSprite;
  private readonly cidadePerto: TilingSprite;
  private readonly janelasLonge: TilingSprite;
  private readonly janelasPerto: TilingSprite;
  private readonly posEstrelas: [number, number, number][] = [];

  constructor(renderer: Renderer) {
    const rng = new Rng(2024);
    for (let i = 0; i < 140; i++) posEstrelas(this.posEstrelas, rng);
    const [longe, janLonge] = gerarCidade(renderer, new Rng(7), 0x7d8ba3, 60, 170);
    const [perto, janPerto] = gerarCidade(renderer, new Rng(11), 0x5f6b82, 90, 240);
    this.cidadeLonge = new TilingSprite({ texture: longe, width: 100, height: ALTURA_CIDADE });
    this.janelasLonge = new TilingSprite({ texture: janLonge, width: 100, height: ALTURA_CIDADE });
    this.cidadePerto = new TilingSprite({ texture: perto, width: 100, height: ALTURA_CIDADE });
    this.janelasPerto = new TilingSprite({ texture: janPerto, width: 100, height: ALTURA_CIDADE });
    this.raiz.addChild(
      this.estrelas, this.astros, this.nuvens,
      this.cidadeLonge, this.janelasLonge, this.cidadePerto, this.janelasPerto,
    );
  }

  /** Atualiza a cada quadro. `chaoY` = posição do chão na tela; `ox` = deslocamento da câmera. */
  atualizar(minutoDoDia: number, agora: number, w: number, h: number, chaoY: number, ox: number, escala: number): void {
    const e = escuridao(minutoDoDia);

    // Estrelas (só à noite)
    const ge = this.estrelas.clear();
    if (e > 0.05) {
      for (const [fx, fy, b] of this.posEstrelas) {
        const pisca = 0.6 + 0.4 * Math.sin(agora / 700 + fx * 40);
        ge.rect(fx * w, fy * h * 0.6, b, b).fill({ color: 0xffffff, alpha: e * pisca * 0.9 });
      }
    }

    // Sol de 6h às 18h, lua à noite, num arco pelo céu
    const ga = this.astros.clear();
    const dia = (minutoDoDia - 360) / 720; // 0 às 6h, 1 às 18h
    if (dia >= -0.05 && dia <= 1.05) {
      const [x, y] = arco(dia, w, h);
      ga.circle(x, y, 26).fill({ color: 0xfff2b0, alpha: 0.25 });
      ga.circle(x, y, 16).fill(0xffe38a);
    }
    const noite = ((minutoDoDia - 1080 + 1440) % 1440) / 720; // 0 às 18h, 1 às 6h
    if (noite >= 0 && noite <= 1 && e > 0.2) {
      const [x, y] = arco(noite, w, h);
      ga.circle(x, y, 12).fill({ color: 0xeef2ff, alpha: e });
      ga.circle(x + 5, y - 3, 10).fill({ color: 0x1b1f3b, alpha: e * 0.9 }); // crescente
    }

    // Nuvens: andam devagar; ficam escuras e translúcidas à noite
    const gn = this.nuvens.clear();
    const corNuvem = e > 0.5 ? 0x4a5070 : 0xffffff;
    for (let i = 0; i < 6; i++) {
      const vel = 0.004 + (i % 3) * 0.002;
      const x = (((agora * vel + i * 397 - ox * 0.05) % (w + 300)) + w + 300) % (w + 300) - 150;
      const y = 40 + ((i * 53) % 5) * 26;
      nuvem(gn, x, y, 1 + (i % 3) * 0.4, corNuvem, 0.75 - e * 0.45);
    }

    // Cidade com paralaxe: mais longe anda menos que a câmera
    const base = chaoY - ALTURA_CIDADE * Math.min(1, 0.6 + escala * 0.2);
    for (const [s, fator] of [
      [this.cidadeLonge, 0.15],
      [this.janelasLonge, 0.15],
      [this.cidadePerto, 0.3],
      [this.janelasPerto, 0.3],
    ] as const) {
      s.width = w;
      s.y = base + (fator === 0.15 ? -20 : 0);
      s.tilePosition.x = ox * fator;
    }
    this.janelasLonge.alpha = e;
    this.janelasPerto.alpha = e;
    const tom = 1 - e * 0.55;
    this.cidadeLonge.tint = misturaTom(tom);
    this.cidadePerto.tint = misturaTom(tom);
  }
}

function misturaTom(f: number): number {
  const v = Math.round(255 * f);
  return (v << 16) | (v << 8) | Math.min(255, v + 20);
}

function arco(t: number, w: number, h: number): [number, number] {
  const x = w * (0.1 + 0.8 * t);
  const y = h * (0.55 - 0.45 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))));
  return [x, y];
}

function nuvem(g: Graphics, x: number, y: number, s: number, cor: number, alpha: number): void {
  g.circle(x, y, 14 * s).fill({ color: cor, alpha });
  g.circle(x + 16 * s, y - 6 * s, 18 * s).fill({ color: cor, alpha });
  g.circle(x + 34 * s, y, 13 * s).fill({ color: cor, alpha });
  g.rect(x, y, 34 * s, 12 * s).fill({ color: cor, alpha });
}

function posEstrelas(lista: [number, number, number][], rng: Rng): void {
  lista.push([rng.proximo(), rng.proximo(), rng.proximo() < 0.15 ? 2 : 1]);
}

/** Gera a silhueta da cidade (e uma textura só com janelas acesas). */
function gerarCidade(renderer: Renderer, rng: Rng, cor: number, hMin: number, hMax: number): [Texture, Texture] {
  const g = new Graphics();
  const j = new Graphics();
  let x = 0;
  while (x < LARGURA_CIDADE) {
    const w = rng.inteiro(40, 110);
    const h = rng.inteiro(hMin, hMax);
    const topo = ALTURA_CIDADE - h;
    g.rect(x, topo, w, h).fill(cor);
    if (rng.proximo() < 0.3) g.rect(x + w / 2 - 2, topo - 14, 3, 14).fill(cor); // antena
    if (rng.proximo() < 0.25) g.rect(x + 6, topo - 8, w - 12, 8).fill(cor); // recuo no topo
    for (let yy = topo + 8; yy < ALTURA_CIDADE - 6; yy += 10) {
      for (let xx = x + 5; xx < x + w - 6; xx += 8) {
        if (rng.proximo() < 0.35) j.rect(xx, yy, 3, 4).fill(0xffd27a);
      }
    }
    x += w + rng.inteiro(0, 8);
  }
  const frame = new Rectangle(0, 0, LARGURA_CIDADE, ALTURA_CIDADE);
  const t1 = renderer.generateTexture({ target: g, resolution: 1, frame });
  const t2 = renderer.generateTexture({ target: j, resolution: 1, frame });
  t1.source.scaleMode = 'nearest';
  t2.source.scaleMode = 'nearest';
  g.destroy();
  j.destroy();
  return [t1, t2];
}
