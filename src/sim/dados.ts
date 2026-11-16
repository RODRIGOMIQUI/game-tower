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

/** Poços de elevador (ocupam vários andares; têm carros). */
export function ehElevador(id: string): boolean {
  return id.startsWith('elevador_');
}

/** Escadas e escadas rolantes: ligam um andar ao de cima. */
export function ehEscada(id: string): boolean {
  return id === 'escada' || id === 'escada_rolante';
}

/** Tipos ainda não implementados (chegam em fases futuras). */
export function disponivelNaFase(id: string): boolean {
  return id !== 'sky_lobby';
}

/** Manutenção trimestral por carro de elevador (docs/economia.md §2). */
export const MANUTENCAO_CARRO_TRI: Record<string, number> = {
  elevador_padrao: 2_000,
  elevador_expresso: 4_000,
  elevador_servico: 1_500,
};

/** Máximo de carros por poço (docs/gdd.md §6.1). */
export const MAX_CARROS = 8;
