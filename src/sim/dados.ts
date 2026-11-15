// Tipos de unidade carregados de src/data/unidades.json (gerado de docs/dados/unidades.csv).
import bruto from '../data/unidades.json';

export type Onde = 'acima' | 'subsolo' | 'terreo' | 'qualquer' | 'topo';
export type Categoria =
  | 'estrutura' | 'transito' | 'trabalho' | 'moradia' | 'hotel' | 'comida'
  | 'comercio' | 'lazer' | 'servico' | 'acesso' | 'marco';
export type ReceitaTipo =
  | 'nenhuma' | 'aluguel_tri' | 'venda' | 'diaria' | 'por_cliente' | 'por_vaga_dia';

export interface TipoUnidade {
  id: string;
  nome: string;
  categoria: Categoria;
  estrela: number;
  largura_col: number;
  altura_andares: number;
  onde: Onde;
  custo: number;
  custo_extra: number;
  manutencao_tri: number;
  receita_tipo: ReceitaTipo;
  receita_valor: number;
  capacidade: number;
  populacao: number;
  ruido_emite: number;
  sensivel_ruido: boolean;
  observacao: string;
}

export const TIPOS: readonly TipoUnidade[] = bruto as TipoUnidade[];

const porId = new Map(TIPOS.map((t) => [t.id, t]));

export function tipo(id: string): TipoUnidade {
  const t = porId.get(id);
  if (!t) throw new Error(`Tipo de unidade desconhecido: ${id}`);
  return t;
}

/** Tipos que são estrutura (células de laje) e não unidades. */
export function ehEstrutura(id: string): boolean {
  return tipo(id).categoria === 'estrutura';
}

/** Tipos ainda não implementados (chegam em fases futuras). */
export function disponivelNaFase(id: string): boolean {
  return tipo(id).categoria !== 'transito' && id !== 'sky_lobby';
}
