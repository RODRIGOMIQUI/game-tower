// Câmera 2D: converte tela ↔ mundo ↔ célula. Zoom em degraus para manter a pixel art nítida.
import { ANDAR_MAX, ANDAR_MIN, LARGURA } from '../sim/mundo';

export const COL_PX = 8;
export const ANDAR_PX = 36;
export const LAJE_PX = 6;

export const ZOOMS = [0.25, 0.5, 1, 2, 3, 4] as const;

export interface Celula {
  x: number;
  y: number;
}

/** Topo (em px de mundo) do andar y. O chão (base do térreo) fica em 0. */
export function topoDoAndar(y: number): number {
  return -(y + 1) * ANDAR_PX;
}

export class Camera {
  /** Posição na tela da origem do mundo. */
  ox = 0;
  oy = 0;
  nivel = 3; // índice em ZOOMS → 2×

  get escala(): number {
    return ZOOMS[this.nivel]!;
  }

  centralizar(wx: number, wy: number, larguraTela: number, alturaTela: number): void {
    this.ox = Math.round(larguraTela / 2 - wx * this.escala);
    this.oy = Math.round(alturaTela / 2 - wy * this.escala);
  }

  telaParaMundo(sx: number, sy: number): { wx: number; wy: number } {
    return { wx: (sx - this.ox) / this.escala, wy: (sy - this.oy) / this.escala };
  }

  celulaEm(sx: number, sy: number): Celula {
    const { wx, wy } = this.telaParaMundo(sx, sy);
    return { x: Math.floor(wx / COL_PX), y: Math.ceil(-wy / ANDAR_PX) - 1 };
  }

  mover(dx: number, dy: number): void {
    this.ox = Math.round(this.ox + dx);
    this.oy = Math.round(this.oy + dy);
  }

  /** Muda o zoom em `passos` degraus mantendo fixo o ponto da tela (sx, sy). */
  zoom(passos: number, sx: number, sy: number): void {
    const novo = Math.max(0, Math.min(ZOOMS.length - 1, this.nivel + passos));
    if (novo === this.nivel) return;
    const { wx, wy } = this.telaParaMundo(sx, sy);
    this.nivel = novo;
    this.ox = Math.round(sx - wx * this.escala);
    this.oy = Math.round(sy - wy * this.escala);
  }

  /** Mantém pelo menos parte do terreno visível. */
  limitar(larguraTela: number, alturaTela: number): void {
    const s = this.escala;
    const margem = 200;
    const minX = larguraTela - margem - LARGURA * COL_PX * s;
    const maxX = margem;
    const fundo = topoDoAndar(ANDAR_MIN - 1); // base do B10 (positivo: abaixo do chão)
    const topo = topoDoAndar(ANDAR_MAX); // topo do andar 100 (negativo)
    const minY = alturaTela - margem - (fundo + 200) * s;
    const maxY = margem - (topo - 200) * s;
    this.ox = Math.round(Math.min(maxX, Math.max(minX, this.ox)));
    this.oy = Math.round(Math.min(maxY, Math.max(minY, this.oy)));
  }
}
