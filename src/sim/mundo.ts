// Grade do prédio: estrutura (lajes) + unidades. Ver docs/gdd.md §3.
// Coordenadas: x = coluna (0..LARGURA-1); y = andar, 0 = térreo, negativo = subsolo.
// Exibição: y >= 0 → "y+1"; y < 0 → "B{-y}".

export const LARGURA = 360;
export const ANDAR_MIN = -10; // B10
export const ANDAR_MAX = 99; // andar 100
export const NUM_ANDARES = ANDAR_MAX - ANDAR_MIN + 1;

export const Est = { Vazio: 0, Piso: 1, Lobby: 2, Escavado: 3, LobbyCorp: 4, Atrio: 5, Grand: 6 } as const;
export type CodigoEstrutura = (typeof Est)[keyof typeof Est];

export const ESTRUTURA_POR_TIPO: Record<string, CodigoEstrutura> = {
  piso: Est.Piso,
  lobby: Est.Lobby,
  sky_lobby: Est.Lobby,
  lobby_corporativo: Est.LobbyCorp,
  atrio: Est.Atrio,
  grand_lobby: Est.Grand,
  escavacao: Est.Escavado,
};

export interface Unidade {
  uid: number;
  tipo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export function nomeAndar(y: number): string {
  return y >= 0 ? String(y + 1) : `B${-y}`;
}

export function dentro(x: number, y: number): boolean {
  return x >= 0 && x < LARGURA && y >= ANDAR_MIN && y <= ANDAR_MAX;
}

export function idx(x: number, y: number): number {
  return (y - ANDAR_MIN) * LARGURA + x;
}

export interface SnapshotMundo {
  estrutura: Uint8Array;
  ocupacao: Int32Array;
  unidades: Unidade[];
  proximoUid: number;
}

export class Mundo {
  readonly estrutura: Uint8Array;
  /** uid da unidade em cada célula, 0 = livre. */
  readonly ocupacao: Int32Array;
  readonly unidades = new Map<number, Unidade>();
  proximoUid = 1;

  constructor(snap?: SnapshotMundo) {
    this.estrutura = snap?.estrutura ?? new Uint8Array(LARGURA * NUM_ANDARES);
    this.ocupacao = snap?.ocupacao ?? new Int32Array(LARGURA * NUM_ANDARES);
    if (snap) {
      for (const u of snap.unidades) this.unidades.set(u.uid, u);
      this.proximoUid = snap.proximoUid;
    }
  }

  /** Cópia independente, segura para transferir ao thread principal. */
  snapshot(): SnapshotMundo {
    return {
      estrutura: this.estrutura.slice(),
      ocupacao: this.ocupacao.slice(),
      unidades: [...this.unidades.values()].map((u) => ({ ...u })),
      proximoUid: this.proximoUid,
    };
  }

  est(x: number, y: number): number {
    return dentro(x, y) ? this.estrutura[idx(x, y)]! : Est.Vazio;
  }

  setEst(x: number, y: number, c: CodigoEstrutura): void {
    this.estrutura[idx(x, y)] = c;
  }

  uidEm(x: number, y: number): number {
    return dentro(x, y) ? this.ocupacao[idx(x, y)]! : 0;
  }

  unidadeEm(x: number, y: number): Unidade | undefined {
    const uid = this.uidEm(x, y);
    return uid ? this.unidades.get(uid) : undefined;
  }

  adicionarUnidade(tipo: string, x: number, y: number, largura: number, altura: number): Unidade {
    const u: Unidade = { uid: this.proximoUid++, tipo, x, y, largura, altura };
    this.unidades.set(u.uid, u);
    this.marcar(u, u.uid);
    return u;
  }

  removerUnidade(uid: number): void {
    const u = this.unidades.get(uid);
    if (!u) return;
    this.marcar(u, 0);
    this.unidades.delete(uid);
  }

  private marcar(u: Unidade, valor: number): void {
    for (let yy = u.y; yy < u.y + u.altura; yy++) {
      for (let xx = u.x; xx < u.x + u.largura; xx++) this.ocupacao[idx(xx, yy)] = valor;
    }
  }
}
