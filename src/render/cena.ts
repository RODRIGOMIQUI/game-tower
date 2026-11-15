// Desenho do mundo com PixiJS. Arte provisória: retângulos nas cores da paleta
// (docs/direcao-de-arte.md §8). Só redesenha estrutura/unidades quando o mundo muda.
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Plano } from '../sim/construcao';
import { tipo } from '../sim/dados';
import { ANDAR_MAX, ANDAR_MIN, Est, LARGURA, nomeAndar, type Mundo, type Unidade } from '../sim/mundo';
import { ANDAR_PX, Camera, COL_PX, LAJE_PX, topoDoAndar, type Celula } from './camera';
import { COR, COR_CATEGORIA, corDoCeu, escurecer, escuridao, misturar } from './paleta';

const INTERIOR_PX = ANDAR_PX - LAJE_PX;
const LARGURA_PX = LARGURA * COL_PX;
const FUNDO_PX = -topoDoAndar(ANDAR_MIN - 1); // base do B10
const TOPO_PX = topoDoAndar(ANDAR_MAX);
const FAIXAS_CEU = 48;

const COR_INTERIOR: Record<number, number> = {
  [Est.Piso]: COR.interiorVazio,
  [Est.Lobby]: COR.lobby,
  [Est.Escavado]: COR.escavado,
};

export class Cena {
  readonly camera = new Camera();
  private readonly ceu = new Graphics();
  private readonly mundoBase = new Container();
  private readonly mundoTopo = new Container();
  private readonly terreno = new Graphics();
  private readonly estrutura = new Graphics();
  private readonly unidades = new Graphics();
  private readonly rotulos = new Container();
  private readonly noite = new Graphics();
  private readonly grade = new Graphics();
  private readonly fantasma = new Graphics();
  private escalaGrade = -1;
  private chaveCeu = '';

  constructor(private readonly app: Application) {
    this.mundoBase.addChild(this.terreno, this.estrutura, this.unidades, this.rotulos);
    this.mundoTopo.addChild(this.grade, this.fantasma);
    app.stage.addChild(this.ceu, this.mundoBase, this.noite, this.mundoTopo);
    this.desenharTerreno();
    this.grade.visible = false;
    this.enquadrarInicio();
    app.renderer.on('resize', () => this.aplicarCamera());
  }

  /** Olha o meio do lote, com o chão a ~2/3 da altura da tela. */
  enquadrarInicio(): void {
    this.camera.centralizar(LARGURA_PX / 2, 0, this.larguraTela, this.alturaTela);
    this.camera.oy = Math.round(this.alturaTela * 0.68);
    this.aplicarCamera();
  }

  get larguraTela(): number {
    return this.app.screen.width;
  }

  get alturaTela(): number {
    return this.app.screen.height;
  }

  celulaEm(sx: number, sy: number): Celula {
    return this.camera.celulaEm(sx, sy);
  }

  aplicarCamera(): void {
    this.camera.limitar(this.larguraTela, this.alturaTela);
    const { ox, oy, escala } = this.camera;
    for (const c of [this.mundoBase, this.mundoTopo]) {
      c.position.set(ox, oy);
      c.scale.set(escala);
    }
    if (this.escalaGrade !== escala) this.desenharGrade();
  }

  mostrarGrade(v: boolean): void {
    this.grade.visible = v;
  }

  // ---------------------------------------------------------------- terreno

  private desenharTerreno(): void {
    const g = this.terreno;
    const extra = 6000;
    g.rect(-extra, 0, LARGURA_PX + extra * 2, FUNDO_PX + 2000).fill(COR.terra);
    g.rect(0, 0, LARGURA_PX, FUNDO_PX).fill(COR.terraLote);
    g.rect(-extra, -2, LARGURA_PX + extra * 2, 3).fill(COR.grama);
    // Limites do lote
    for (const x of [0, LARGURA_PX]) {
      for (let y = TOPO_PX; y < FUNDO_PX; y += 24) g.rect(x - 0.5, y, 1, 12).fill({ color: 0xffffff, alpha: 0.25 });
    }
    // Números de andar a cada 5 andares, de cada lado do lote
    for (let y = ANDAR_MIN; y <= ANDAR_MAX; y++) {
      const andar = y + 1;
      if (y >= 0 && andar !== 1 && andar % 5 !== 0) continue;
      for (const [x, ancora] of [[-6, 1], [LARGURA_PX + 6, 0]] as const) {
        const t = new Text({
          text: nomeAndar(y),
          style: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11, fill: 0xffffff },
          resolution: 4,
        });
        t.alpha = 0.55;
        t.anchor.set(ancora, 0.5);
        t.position.set(x, topoDoAndar(y) + ANDAR_PX / 2);
        this.rotulos.addChild(t);
      }
    }
  }

  private desenharGrade(): void {
    const s = this.camera.escala;
    this.escalaGrade = s;
    const g = this.grade.clear();
    const w = 1 / s;
    const cor = { color: 0xffffff, alpha: s >= 1 ? 0.07 : 0.04 };
    const passoX = s >= 1 ? 1 : 4;
    for (let x = 0; x <= LARGURA; x += passoX) g.rect(x * COL_PX, TOPO_PX, w, FUNDO_PX - TOPO_PX).fill(cor);
    for (let y = ANDAR_MIN; y <= ANDAR_MAX + 1; y++) g.rect(0, topoDoAndar(y - 1), LARGURA_PX, w).fill(cor);
  }

  // ------------------------------------------------------------------- céu

  atualizarCeu(minutoDoDia: number): void {
    const m = Math.floor(minutoDoDia);
    const chave = `${m}:${this.larguraTela}x${this.alturaTela}`;
    if (chave === this.chaveCeu) return;
    this.chaveCeu = chave;
    const { topo, horizonte } = corDoCeu(m);
    const g = this.ceu.clear();
    const w = this.larguraTela;
    const h = this.alturaTela;
    const faixa = Math.ceil(h / FAIXAS_CEU);
    for (let i = 0; i < FAIXAS_CEU; i++) {
      const t = i / (FAIXAS_CEU - 1);
      g.rect(0, i * faixa, w, faixa + 1).fill(misturar(topo, horizonte, t));
    }
    const e = escuridao(m);
    this.noite.clear();
    if (e > 0) this.noite.rect(0, 0, w, h).fill({ color: 0x0a0c20, alpha: e * 0.35 });
  }

  // ------------------------------------------------------------------ mundo

  desenharMundo(m: Mundo): void {
    const g = this.estrutura.clear();
    for (let y = ANDAR_MIN; y <= ANDAR_MAX; y++) {
      const topo = topoDoAndar(y);
      let x = 0;
      while (x < LARGURA) {
        const c = m.est(x, y);
        if (c === Est.Vazio) {
          x++;
          continue;
        }
        let fim = x + 1;
        while (fim < LARGURA && m.est(fim, y) === c) fim++;
        const px = x * COL_PX;
        const w = (fim - x) * COL_PX;
        g.rect(px, topo, w, INTERIOR_PX).fill(COR_INTERIOR[c] ?? COR.interiorVazio);
        g.rect(px, topo + INTERIOR_PX, w, LAJE_PX).fill(COR.estrutura);
        g.rect(px, topo, 1, INTERIOR_PX).fill(COR.estruturaClaro);
        g.rect(px + w - 1, topo, 1, INTERIOR_PX).fill(COR.estruturaClaro);
        x = fim;
      }
    }

    const gu = this.unidades.clear();
    for (const u of m.unidades.values()) desenharUnidade(gu, u);
  }

  // --------------------------------------------------------------- fantasma

  desenharFantasma(plano: Plano | null, hover: Celula | null, destaque: Unidade | null): void {
    const g = this.fantasma.clear();
    const borda = 1 / this.camera.escala;
    if (destaque) {
      const r = retanguloUnidade(destaque);
      g.rect(r.x, r.y, r.w, r.h).stroke({ width: borda * 2, color: 0xffffff, alpha: 0.9 });
    }
    if (plano) {
      const demolir = plano.acao === 'demolir';
      for (const it of plano.itens) {
        const r = it.estrutura
          ? { x: it.x * COL_PX, y: topoDoAndar(it.y), w: COL_PX, h: ANDAR_PX }
          : retanguloUnidade(it);
        const cor = !it.ok ? 0x777777 : demolir ? COR.alerta : COR.valido;
        g.rect(r.x, r.y, r.w, r.h).fill({ color: it.ok ? cor : COR.alerta, alpha: it.ok ? 0.4 : 0.25 });
        g.rect(r.x, r.y, r.w, r.h).stroke({ width: borda, color: cor, alpha: 0.9 });
      }
    }
    if (hover && !plano) {
      g.rect(hover.x * COL_PX, topoDoAndar(hover.y), COL_PX, ANDAR_PX).stroke({
        width: borda,
        color: 0xffffff,
        alpha: 0.6,
      });
    }
  }
}

function retanguloUnidade(u: { x: number; y: number; largura: number; altura: number }) {
  return {
    x: u.x * COL_PX,
    y: topoDoAndar(u.y + u.altura - 1),
    w: u.largura * COL_PX,
    h: u.altura * ANDAR_PX - LAJE_PX,
  };
}

function desenharUnidade(g: Graphics, u: Unidade): void {
  const cor = COR_CATEGORIA[tipo(u.tipo).categoria];
  const r = retanguloUnidade(u);
  g.rect(r.x, r.y, r.w, r.h).fill(cor);
  g.rect(r.x + 1, r.y + 1, r.w - 2, 3).fill(escurecer(cor, 0.8)); // teto
  g.rect(r.x + 2, r.y + r.h - 12, 3, 12).fill(escurecer(cor, 0.55)); // porta
  g.rect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1).stroke({ width: 1, color: escurecer(cor, 0.6) });
}
