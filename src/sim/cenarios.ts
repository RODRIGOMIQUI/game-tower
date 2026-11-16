// Cenários: partidas com restrições e um objetivo. Ver docs/gdd.md §12.

import type { EstadoUnidade } from './inquilinos';
import { LARGURA } from './mundo';

export interface CenarioDef {
  id: string;
  nome: string;
  descricao: string;
  dinheiro: number;
  estrela: number;
  /** Colunas permitidas [x0, x1]; padrão: o terreno inteiro. */
  lote?: [number, number];
  /** Máximo de poços de elevador (qualquer tipo). */
  maxPocos?: number;
  /** Texto do objetivo, mostrado no menu e na barra. */
  objetivo: string;
}

export interface ContextoCenario {
  populacao: number;
  hospedesAgora: number;
  estados: Iterable<EstadoUnidade>;
}

export interface Avaliacao {
  ok: boolean;
  progresso: string;
}

export const CENARIOS: CenarioDef[] = [
  {
    id: 'lote_estreito',
    nome: 'Lote estreito',
    descricao: 'Um terreno de apenas 60 colunas no meio da cidade. Só dá para crescer para cima.',
    dinheiro: 3_000_000,
    estrela: 1,
    lote: [150, 209],
    objetivo: 'Chegar a 1.500 pessoas',
  },
  {
    id: 'quatro_pocos',
    nome: 'Quatro poços',
    descricao: 'A prefeitura só aprovou quatro poços de elevador. Escolha bem onde e como usá-los.',
    dinheiro: 3_000_000,
    estrela: 1,
    maxPocos: 4,
    objetivo: 'Chegar a 2.000 pessoas',
  },
  {
    id: 'hotel_luxo',
    nome: 'Hotel de luxo',
    descricao: 'Investidores querem um hotel cinco estrelas. Hóspedes exigentes, quartos sempre limpos.',
    dinheiro: 5_000_000,
    estrela: 3,
    objetivo: '300 hóspedes numa noite com satisfação média do hotel ≥ 80',
  },
];

export function cenario(id: string | undefined): CenarioDef | undefined {
  return CENARIOS.find((c) => c.id === id);
}

export function loteDe(c: CenarioDef | undefined): [number, number] {
  return c?.lote ?? [0, LARGURA - 1];
}

export function avaliar(c: CenarioDef, ctx: ContextoCenario): Avaliacao {
  switch (c.id) {
    case 'lote_estreito':
      return { ok: ctx.populacao >= 1500, progresso: `${ctx.populacao} / 1.500 pessoas` };
    case 'quatro_pocos':
      return { ok: ctx.populacao >= 2000, progresso: `${ctx.populacao} / 2.000 pessoas` };
    case 'hotel_luxo': {
      let soma = 0;
      let n = 0;
      for (const e of ctx.estados) {
        if (!e.tipo.startsWith('hotel_')) continue;
        soma += e.satisfacao;
        n++;
      }
      const media = n ? soma / n : 0;
      return {
        ok: ctx.hospedesAgora >= 300 && media >= 80,
        progresso: `${ctx.hospedesAgora} / 300 hóspedes · satisfação ${Math.round(media)} / 80`,
      };
    }
    default:
      return { ok: false, progresso: '' };
  }
}
