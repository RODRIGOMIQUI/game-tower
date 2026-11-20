// Arte das unidades em pixel art, desenhada por código (docs/direcao-de-arte.md).
// Cada tipo vira uma textura gerada uma vez e reaproveitada por todas as
// unidades iguais. Escala inteira com "nearest": nítida em qualquer zoom.
import { Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { ANDAR_PX, COL_PX, LAJE_PX } from './camera';
import type { PontoLuz } from './luz';

export type Variante = 'normal' | 'vaga' | 'suja' | 'pragas';

type Pincel = (x: number, y: number, w: number, h: number, cor: number, alpha?: number) => void;
type Desenho = (p: Pincel, w: number, h: number, v: number) => void;

/** Cores de apoio da arte (além dos tokens de paleta.ts). */
const C = {
  madeira: 0x8a6a4a, madeiraClara: 0xb08a62, madeiraEscura: 0x5e4630,
  metal: 0x9aa3b0, metalEscuro: 0x5a6170, preto: 0x23262e, branco: 0xf4f4f0,
  tela: 0x7fd0ff, telaOff: 0x2c3442, vidro: 0xa9d8f0, verde: 0x5d9a4f, verdeEscuro: 0x3f6e38,
  vermelho: 0xc8483f, azul: 0x4a78b8, amarelo: 0xe8c547, rosa: 0xe89ab0, roxo: 0x8e6bb8,
  laranja: 0xe38a4b, pele: 0xe0b48a, concreto: 0x8c8f96, concretoEscuro: 0x6e7178, ouro: 0xd8b04a,
};

/** Cor das cúpulas de luminária e velas: a fábrica as reconhece como fontes de luz. */
const LUZ_QUENTE = 0xfff2b0;
const SOMBRA = 0x0a0c20;
const OCLUSAO_TETO = [0.22, 0.12, 0.05];
const OCLUSAO_LADO = [0.18, 0.09, 0.04];

/** Paredes de fundo e piso por tipo. */
const FUNDO: Record<string, [number, number]> = {
  escritorio: [0xc9d6e3, 0x7f8794],
  apartamento: [0xf0dcc8, 0xa77b55],
  hotel_simples: [0xe3d4ef, 0x8a6f9e],
  hotel_duplo: [0xe3d4ef, 0x8a6f9e],
  hotel_suite: [0xdccbe9, 0x6e5584],
  lanchonete: [0xf6e7b8, 0xb8a37a],
  restaurante: [0x8c3b3b, 0x5e3a2a],
  loja: [0xf7dcd2, 0xbfa59b],
  cinema: [0x2b2338, 0x3a2f48],
  salao_eventos: [0x3d3355, 0x5a4b70],
  limpeza: [0xd8e4e0, 0x8fa39c],
  seguranca: [0xb8c0cc, 0x6e7686],
  centro_medico: [0xeef3f2, 0xa9c2bd],
  reciclagem: [0x9aa58c, 0x6e7864],
  rampa_estacionamento: [0x8c8f96, 0x6e7178],
  estacionamento: [0x8c8f96, 0x6e7178],
  metro: [0x5a6070, 0x3b3f4a],
  coroa: [0x23304a, 0x3b3f4a],
};

export class FabricaArte {
  private readonly cache = new Map<string, Texture>();
  /** Luzes de cada desenho (sem a variante: só a versão normal acende). */
  private readonly luzesCache = new Map<string, PontoLuz[]>();

  constructor(private readonly renderer: Renderer) {}

  /** Textura do interior de uma unidade (largura × altura em células). */
  unidade(tipo: string, largura: number, altura: number, variante: Variante, semente: number): Texture {
    const v = semente % 3;
    const chave = `${tipo}:${largura}:${altura}:${variante}:${v}`;
    const pronta = this.cache.get(chave);
    if (pronta) return pronta;
    const w = largura * COL_PX;
    const h = altura * ANDAR_PX - LAJE_PX;
    const g = new Graphics();
    const luzes: PontoLuz[] = [];
    const p: Pincel = (x, y, ww, hh, cor, alpha = 1) => {
      if (!(ww > 0 && hh > 0)) return;
      g.rect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)).fill({ color: cor, alpha });
      // Luminárias, velas e telas viram fontes de luz (luz.ts).
      if (cor === LUZ_QUENTE) luzes.push(y < 8 ? { x: x + ww / 2, y: y + hh, tipo: 0 } : { x: x + ww / 2, y: y + hh / 2, tipo: 1 });
      else if (cor === C.tela && ww * hh >= 4) luzes.push({ x: x + ww / 2, y: y + hh / 2, tipo: 2 });
    };
    const [parede, chao] = FUNDO[tipo] ?? [0xb0b6c0, 0x7f8794];
    p(0, 0, w, h, parede);
    p(0, h - 3, w, 3, chao);
    p(0, 0, w, 2, escurecer(parede, 0.85)); // teto
    if (variante !== 'vaga') (DESENHOS[tipo] ?? generico)(p, w, h, v);
    else {
      // Vaga: sala vazia com luz apagada e placa
      p(0, 0, w, h, 0x50545e, 0.35);
      if (w >= 24) {
        const px = Math.round(w / 2 - 7);
        p(px, 9, 14, 8, C.branco);
        p(px + 2, 11, 10, 1, C.preto);
        p(px + 2, 13, 7, 1, C.preto);
        p(px + 6, 6, 1, 3, C.metalEscuro);
      }
    }
    if (variante === 'suja') {
      for (let i = 0; i < w / 10; i++) p(4 + i * 10 + (i % 3), h - 6 - (i % 2) * 3, 4, 2, 0x6b5232, 0.8);
      p(0, 0, w, h, 0x8a6b4a, 0.25);
    }
    if (variante === 'pragas') {
      p(0, 0, w, h, 0x6b7a3a, 0.4);
      for (let i = 0; i < w / 5; i++) p(2 + i * 5, h - 4 - ((i * 7) % 3) * 4, 2, 1, C.preto);
    }
    // Oclusão ambiente em degraus (combina com a pixel art): o canto sob a
    // laje e as paredes laterais recebem menos luz.
    OCLUSAO_TETO.forEach((a, i) => p(0, 2 + i * 2, w, 2, SOMBRA, a));
    OCLUSAO_LADO.forEach((a, i) => {
      p(i * 2, 0, 2, h, SOMBRA, a);
      p(w - 2 - i * 2, 0, 2, h, SOMBRA, a);
    });
    p(0, h - 3, w, 1, SOMBRA, 0.18); // contato com o piso
    // Moldura
    p(0, 0, 1, h, escurecer(parede, 0.6));
    p(w - 1, 0, 1, h, escurecer(parede, 0.6));
    const tex = this.renderer.generateTexture({ target: g, resolution: 1, frame: new Rectangle(0, 0, w, h) });
    tex.source.scaleMode = 'nearest';
    g.destroy();
    this.cache.set(chave, tex);
    if (variante === 'normal') this.luzesCache.set(`${tipo}:${largura}:${altura}:${v}`, luzes);
    return tex;
  }

  /**
   * Fontes de luz do interior (px relativos à unidade). Unidades sem
   * luminária desenhada recebem cones distribuídos pelo teto.
   */
  luzes(tipo: string, largura: number, altura: number, semente: number): readonly PontoLuz[] {
    const chave = `${tipo}:${largura}:${altura}:${semente % 3}`;
    if (!this.luzesCache.has(chave)) this.unidade(tipo, largura, altura, 'normal', semente);
    const l = this.luzesCache.get(chave)!;
    if (!l.some((p) => p.tipo === 0)) {
      const w = largura * COL_PX;
      const n = Math.max(1, Math.round(w / 48));
      for (let i = 0; i < n; i++) l.push({ x: ((i + 0.5) * w) / n, y: 3, tipo: 0 });
    }
    return l;
  }

  destruir(): void {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}

export function escurecer(cor: number, f: number): number {
  const r = Math.round(((cor >> 16) & 255) * f);
  const g = Math.round(((cor >> 8) & 255) * f);
  const b = Math.round((cor & 255) * f);
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------------ móveis

function janela(p: Pincel, x: number, y: number, w: number, h: number): void {
  p(x, y, w, h, C.metalEscuro);
  p(x + 1, y + 1, w - 2, h - 2, C.vidro);
  p(x + 1, y + 1, Math.max(1, (w - 2) / 3), h - 2, 0xc8e8f8);
  p(x + Math.floor(w / 2), y + 1, 1, h - 2, C.metalEscuro);
}

function planta(p: Pincel, x: number, chao: number): void {
  p(x, chao - 4, 4, 4, C.laranja);
  p(x - 1, chao - 9, 6, 5, C.verde);
  p(x + 1, chao - 11, 2, 3, C.verdeEscuro);
}

function mesa(p: Pincel, x: number, chao: number, w: number, cor = C.madeira): void {
  p(x, chao - 9, w, 2, cor);
  p(x + 1, chao - 7, 1, 7, escurecer(cor, 0.7));
  p(x + w - 2, chao - 7, 1, 7, escurecer(cor, 0.7));
}

function cadeira(p: Pincel, x: number, chao: number, cor = C.preto): void {
  p(x, chao - 6, 4, 2, cor);
  p(x + 3, chao - 11, 1, 7, cor);
  p(x + 1, chao - 4, 1, 4, cor);
}

function lampada(p: Pincel, x: number): void {
  p(x, 2, 1, 3, C.metalEscuro);
  p(x - 2, 5, 5, 2, 0xfff2b0);
}

function cama(p: Pincel, x: number, chao: number, w: number, cor: number): void {
  p(x, chao - 7, w, 4, C.branco);
  p(x, chao - 6, w - 5, 3, cor);
  p(x + w - 5, chao - 9, 4, 3, C.branco); // travesseiro
  p(x + w - 1, chao - 12, 2, 12, C.madeiraEscura); // cabeceira
  p(x, chao - 3, 1, 3, C.madeiraEscura);
}

function carro(p: Pincel, x: number, chao: number, cor: number): void {
  p(x, chao - 8, 22, 5, cor);
  p(x + 5, chao - 12, 12, 4, cor);
  p(x + 6, chao - 11, 4, 3, C.vidro);
  p(x + 11, chao - 11, 5, 3, C.vidro);
  p(x + 3, chao - 4, 4, 4, C.preto);
  p(x + 15, chao - 4, 4, 4, C.preto);
  p(x + 21, chao - 7, 1, 2, C.amarelo);
}

// ------------------------------------------------------------- por tipo

const generico: Desenho = (p, w, h) => {
  janela(p, w / 2 - 6, 8, 12, 10);
  planta(p, 3, h - 3);
};

const DESENHOS: Record<string, Desenho> = {
  escritorio: (p, w, h, v) => {
    const c = h - 3;
    janela(p, w - 18, 6, 14, 10);
    lampada(p, 18);
    lampada(p, 50);
    for (const x of [4, 36]) {
      mesa(p, x, c, 22);
      p(x + 7, c - 16, 8, 6, C.preto); // monitor
      p(x + 8, c - 15, 6, 4, v === 1 && x === 36 ? C.telaOff : C.tela);
      p(x + 10, c - 10, 2, 1, C.preto);
      cadeira(p, x + 16, c, v === 2 ? C.azul : C.preto);
    }
    if (v !== 1) planta(p, w - 6, c);
    p(30, c - 18, 3, 4, C.branco); // quadro de avisos
  },
  apartamento: (p, w, h, v) => {
    const c = h - 3;
    janela(p, 46, 6, 16, 11);
    lampada(p, 30);
    // sala: sofá e TV
    const sofa = [C.vermelho, C.azul, C.verde][v]!;
    p(6, c - 7, 22, 5, sofa);
    p(6, c - 11, 4, 9, escurecer(sofa, 0.8));
    p(24, c - 11, 4, 9, escurecer(sofa, 0.8));
    p(10, c - 2, 16, 1, 0xd8c39a); // tapete
    p(34, c - 14, 9, 7, C.preto);
    p(35, c - 13, 7, 5, C.tela);
    p(33, c - 7, 11, 7, C.madeiraEscura);
    // quarto
    p(68, 2, 1, h - 5, escurecer(0xf0dcc8, 0.8));
    cama(p, 74, c, 26, [C.roxo, C.amarelo, C.rosa][v]!);
    // cozinha
    p(106, c - 10, 20, 10, C.branco);
    p(106, c - 11, 20, 1, C.metalEscuro);
    p(110, c - 22, 12, 7, C.branco);
    planta(p, 102, c);
  },
  hotel_simples: (p, w, h) => {
    const c = h - 3;
    cama(p, 3, c, 20, C.roxo);
    p(25, c - 7, 5, 7, C.madeira);
    lampada(p, 27);
    p(6, 6, 10, 7, C.madeiraClara); // quadro
    p(7, 7, 8, 5, 0x9ec8a8);
  },
  hotel_duplo: (p, w, h) => {
    const c = h - 3;
    cama(p, 3, c, 18, C.azul);
    p(23, c - 7, 4, 7, C.madeira);
    cama(p, 28, c, 18, C.azul);
    lampada(p, 25);
    janela(p, 14, 5, 12, 9);
  },
  hotel_suite: (p, w, h) => {
    const c = h - 3;
    cama(p, 4, c, 30, C.ouro);
    p(37, c - 7, 5, 7, C.madeira);
    p(38, c - 12, 2, 5, 0xfff2b0);
    p(48, c - 7, 18, 5, C.roxo); // sofá
    p(48, c - 10, 3, 8, escurecer(C.roxo, 0.8));
    p(70, c - 12, 8, 12, C.preto); // frigobar
    p(71, c - 11, 6, 1, C.metal);
    janela(p, 46, 4, 20, 10);
    lampada(p, 20);
    lampada(p, 58);
  },
  lanchonete: (p, w, h) => {
    const c = h - 3;
    p(4, 4, 40, 9, C.preto); // cardápio
    for (let i = 0; i < 4; i++) p(7, 6 + i * 2, 18 + (i % 2) * 10, 1, [C.amarelo, C.branco, C.laranja, C.branco][i]!);
    p(0, c - 10, 70, 10, C.vermelho); // balcão
    p(0, c - 11, 70, 1, C.branco);
    for (let i = 0; i < 6; i++) p(4 + i * 11, c - 9, 6, 1, C.branco);
    p(50, 5, 16, 12, C.metal); // chapa/fritadeira
    p(52, 7, 12, 3, C.metalEscuro);
    for (let i = 0; i < 4; i++) {
      const x = 78 + i * 12;
      mesa(p, x, c, 8, C.amarelo);
      cadeira(p, x + 9, c, C.vermelho);
    }
    lampada(p, 90);
    lampada(p, 114);
  },
  restaurante: (p, w, h) => {
    const c = h - 3;
    for (let i = 0; i < 5; i++) {
      const x = 8 + i * 36;
      p(x, c - 9, 18, 2, C.branco);
      p(x + 1, c - 7, 16, 2, C.branco);
      p(x + 8, c - 7, 2, 7, C.madeiraEscura);
      cadeira(p, x - 5, c, C.madeiraEscura);
      cadeira(p, x + 19, c, C.madeiraEscura);
      p(x + 8, c - 12, 2, 3, 0xfff2b0); // vela
    }
    for (const x of [50, 140]) {
      p(x, 2, 1, 4, C.ouro);
      p(x - 5, 6, 11, 2, C.ouro);
      p(x - 4, 8, 2, 2, 0xfff2b0);
      p(x + 3, 8, 2, 2, 0xfff2b0);
    }
    planta(p, w - 8, c);
  },
  loja: (p, w, h, v) => {
    const c = h - 3;
    const cores = [C.vermelho, C.azul, C.amarelo, C.verde, C.rosa, C.roxo];
    for (let s = 0; s < 3; s++) {
      const x = 4 + s * 22;
      p(x, 4, 18, c - 4, C.madeiraClara);
      for (let prat = 0; prat < 3; prat++) {
        const y = 6 + prat * 7;
        p(x + 1, y + 5, 16, 1, C.madeiraEscura);
        for (let k = 0; k < 4; k++) p(x + 2 + k * 4, y + 1, 3, 4, cores[(s * 3 + prat + k + v) % cores.length]!);
      }
    }
    p(74, c - 10, 18, 10, C.madeira); // caixa
    p(78, c - 14, 6, 4, C.preto);
    p(79, c - 13, 4, 2, C.tela);
  },
  cinema: (p, w, h) => {
    const c = h - 3;
    p(20, 5, w - 40, 26, 0xe8f0ff); // tela
    p(20, 5, w - 40, 26, C.tela, 0.25);
    p(20, 31, w - 40, 2, C.preto);
    for (let fila = 0; fila < 4; fila++) {
      const y = c - 4 - fila * 6;
      const deg = fila * 6;
      p(10, y + 3, w - 20, deg + 1, escurecer(0x3a2f48, 0.8));
      for (let k = 0; k < (w - 30) / 7; k++) p(14 + k * 7, y - 2, 5, 4, C.vermelho);
    }
  },
  salao_eventos: (p, w, h) => {
    const c = h - 3;
    p(w - 80, c - 14, 76, 14, C.madeiraEscura); // palco
    p(w - 84, 4, 6, c - 4, C.vermelho);
    p(w - 6, 4, 6, c - 4, C.vermelho);
    for (let i = 0; i < 6; i++) {
      const x = 12 + i * 36;
      p(x, c - 9, 20, 2, C.branco);
      p(x + 2, c - 7, 16, 1, C.branco);
      p(x + 9, c - 6, 2, 6, C.madeiraEscura);
      p(x + 8, c - 13, 4, 4, [C.rosa, C.amarelo, C.azul][i % 3]!); // arranjo
    }
    for (let i = 0; i < w / 10; i++) p(5 + i * 10, 6 + (i % 2) * 2, 2, 2, [C.amarelo, C.rosa, C.azul][i % 3]!); // luzinhas
  },
  limpeza: (p, w, h) => {
    const c = h - 3;
    for (let s = 0; s < 2; s++) {
      const x = 4 + s * 30;
      p(x, 6, 24, c - 6, C.metal);
      for (let k = 0; k < 3; k++) for (let t = 0; t < 4; t++) p(x + 2 + t * 5, 8 + k * 6, 4, 4, [C.branco, C.azul, C.branco][k]!);
    }
    p(70, c - 14, 14, 14, C.branco); // lavadora
    p(73, c - 10, 8, 8, C.metalEscuro);
    p(74, c - 9, 6, 6, C.vidro);
    p(92, c - 10, 18, 7, C.azul); // carrinho
    p(92, c - 3, 2, 3, C.preto);
    p(108, c - 3, 2, 3, C.preto);
  },
  seguranca: (p, w, h) => {
    const c = h - 3;
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
      p(6 + k * 14, 4 + r * 9, 12, 8, C.preto);
      p(7 + k * 14, 5 + r * 9, 10, 6, (k + r) % 3 === 0 ? 0x9fd89a : C.tela);
    }
    mesa(p, 20, c, 60, C.metalEscuro);
    cadeira(p, 40, c, C.preto);
    p(w - 24, 6, 14, 14, C.azul); // brasão
    p(w - 20, 9, 6, 8, C.amarelo);
  },
  centro_medico: (p, w, h) => {
    const c = h - 3;
    p(8, 5, 10, 10, C.branco);
    p(12, 6, 2, 8, C.vermelho);
    p(9, 9, 8, 2, C.vermelho);
    for (let i = 0; i < 4; i++) {
      const x = 28 + i * 44;
      p(x, c - 7, 26, 3, C.branco);
      p(x, c - 4, 1, 4, C.metal);
      p(x + 25, c - 4, 1, 4, C.metal);
      p(x + 20, c - 9, 5, 2, C.branco);
      p(x + 30, 3, 8, c - 3, 0x9fd8c0, 0.85); // cortina
    }
  },
  reciclagem: (p, w, h) => {
    const c = h - 3;
    const cores = [C.verde, C.azul, C.amarelo, C.vermelho];
    for (let i = 0; i < 8; i++) {
      const x = 6 + i * 24;
      p(x, c - 18, 18, 18, cores[i % 4]!);
      p(x - 1, c - 20, 20, 2, escurecer(cores[i % 4]!, 0.7));
    }
    p(0, 10, w, 4, C.metalEscuro); // esteira
    for (let i = 0; i < w / 8; i++) p(i * 8, 11, 3, 2, C.metal);
    p(10, 2, 3, 8, C.metal);
    p(w - 20, 2, 3, 8, C.metal);
  },
  rampa_estacionamento: (p, w, h) => {
    const c = h - 3;
    for (let i = 0; i < w; i += 2) p(i, c - (i / w) * (h - 6), 2, (i / w) * (h - 6), C.concretoEscuro);
    for (let i = 0; i < w / 12; i++) p(i * 12, c - 2, 6, 2, i % 2 ? C.amarelo : C.preto);
  },
  estacionamento: (p, w, h, v) => {
    const c = h - 3;
    for (let i = 0; i <= 10; i++) p(i * 24, c - 2, 1, 2, C.branco);
    const cores = [C.vermelho, C.azul, C.branco, C.preto, C.amarelo, C.verde, C.metal];
    for (let i = 0; i < 10; i++) if ((i + v) % 4 !== 3) carro(p, i * 24 + 1, c, cores[(i * 3 + v) % cores.length]!);
    p(0, 4, w, 2, C.amarelo, 0.6);
  },
  metro: (p, w, h) => {
    const c = h - 3;
    p(0, c - 40, w, 40, 0x2b2f3a); // túnel
    p(0, c - 6, w, 6, C.concretoEscuro); // plataforma baixa
    p(0, c - 6, w, 1, C.amarelo);
    for (let k = 0; k < 2; k++) {
      const x = 12 + k * 110;
      p(x, c - 30, 100, 22, 0xd0d8e0); // vagão
      p(x, c - 30, 100, 3, C.azul);
      for (let j = 0; j < 6; j++) p(x + 5 + j * 16, c - 24, 10, 8, C.vidro);
      p(x + 2, c - 8, 96, 2, C.preto);
    }
    p(w / 2 - 20, 6, 40, 12, C.azul); // placa
    p(w / 2 - 16, 10, 32, 2, C.branco);
    p(w / 2 - 12, 14, 24, 1, C.branco);
    p(0, 30, w, 4, C.concreto); // mezanino
  },
  coroa: (p, w, h) => {
    const c = h - 3;
    // Cúpula de vidro
    for (let i = 0; i < w; i += 4) {
      const t = (i - w / 2) / (w / 2);
      const alt = Math.round((1 - t * t) * (h - 20));
      p(i, c - alt, 4, alt, C.vidro, 0.55);
      p(i, c - alt, 1, alt, 0xd8f0ff, 0.6);
    }
    p(0, c - 6, w, 6, C.ouro);
    p(0, c - 7, w, 1, 0xfff2b0);
    p(w / 2 - 3, c - 30, 6, 24, C.metalEscuro); // telescópio
    p(w / 2 - 12, c - 34, 22, 5, C.metal);
    for (let i = 0; i < w; i += 10) p(i, c - 12, 1, 6, C.metal); // guarda-corpo
    p(0, c - 12, w, 1, C.metal);
    p(w / 2 - 1, 0, 2, 8, C.ouro); // antena
  },
};
