// Tokens de cor de docs/direcao-de-arte.md §4.
import type { Categoria } from '../sim/dados';

export const COR = {
  estrutura: 0x3b3f4a,
  estruturaClaro: 0x5a6070,
  interiorVazio: 0x9ba1ad,
  lobby: 0xc9b48a,
  escavado: 0x5b4a3c,
  terra: 0x6b5442,
  terraLote: 0x7a604b,
  grama: 0x6f9a4f,
  transito: 0xf2f2f2,
  alerta: 0xff5a3c,
  valido: 0x4cd964,
  poco: 0x2e323b,
  portaPoco: 0x6a7080,
  carro: 0xf2f2f2,
  carroCarga: 0xe3c25b,
  degrau: 0xd8dbe2,
  vago: 0x7a7f8a,
  sujo: 0x8a6b4a,
  atencao: 0xffd27a,
  pragas: 0x6b7a3a,
  fogo: 0xff7a1a,
  fogoClaro: 0xffd23a,
  fumaca: 0x3a3a40,
  pane: 0xe0393e,
  vip: 0xf5c518,
  humorOk: 0x2b2b2b,
  humorIrritado: 0xe36ba0,
  humorFurioso: 0xe0393e,
} as const;

export const COR_CATEGORIA: Record<Categoria, number> = {
  estrutura: COR.estruturaClaro,
  transito: COR.transito,
  trabalho: 0x7fa7c9,
  moradia: 0xd9a07a,
  hotel: 0xb98ac9,
  comida: 0xe3c25b,
  comercio: 0xe38a6b,
  lazer: 0x6bc9b4,
  servico: 0x8e9aa6,
  acesso: 0x9aa36b,
  marco: 0xf0d080,
};

export function escurecer(cor: number, f: number): number {
  const r = Math.round(((cor >> 16) & 255) * f);
  const g = Math.round(((cor >> 8) & 255) * f);
  const b = Math.round((cor & 255) * f);
  return (r << 16) | (g << 8) | b;
}

export function misturar(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

// Céu por hora: [minuto do dia, topo, horizonte]. Ver direcao-de-arte.md §4.
const CEU: [number, number, number][] = [
  [0, 0x0f1226, 0x26254a],
  [5 * 60, 0x1b1f3b, 0x3d3b6e],
  [6 * 60, 0xf6b38e, 0xfbe3c4],
  [9 * 60, 0x6fb3e8, 0xcde8f7],
  [12 * 60, 0x6fb3e8, 0xcde8f7],
  [17 * 60, 0x8fb8e0, 0xf2cc8f],
  [18 * 60, 0xe07a5f, 0xf2cc8f],
  [20 * 60, 0x1b1f3b, 0x3d3b6e],
  [22 * 60, 0x1b1f3b, 0x3d3b6e],
  [24 * 60, 0x0f1226, 0x26254a],
];

export function corDoCeu(minutoDoDia: number): { topo: number; horizonte: number } {
  for (let i = 1; i < CEU.length; i++) {
    const [m1, t1, h1] = CEU[i]!;
    const [m0, t0, h0] = CEU[i - 1]!;
    if (minutoDoDia <= m1) {
      const t = (minutoDoDia - m0) / (m1 - m0);
      return { topo: misturar(t0, t1, t), horizonte: misturar(h0, h1, t) };
    }
  }
  return { topo: CEU[0]![1], horizonte: CEU[0]![2] };
}

/** 0 = dia pleno, 1 = noite plena. */
export function escuridao(minutoDoDia: number): number {
  const h = minutoDoDia / 60;
  if (h < 5 || h >= 21) return 1;
  if (h < 7) return 1 - (h - 5) / 2;
  if (h >= 18) return (h - 18) / 3;
  return 0;
}
