// Progressão por estrelas. Ver docs/gdd.md §8.
//
// Cada nível exige população e requisitos extras. A 5ª estrela também exige
// que um inspetor percorra a torre sem se estressar; o nível Lendário exige a
// Coroa no topo e uma inauguração bem-sucedida.

import { TIPOS } from './dados';
import type { EstadoUnidade } from './inquilinos';
import type { Mundo } from './mundo';
import type { Pessoa, Populacao } from './pessoas';
import { data } from './relogio';
import type { Rng } from './rng';

export const LENDARIA = 6;
export const NOMES_NIVEL = ['', '1 estrela', '2 estrelas', '3 estrelas', '4 estrelas', '5 estrelas', 'Lendária'];

/** Estresse máximo do inspetor para aprovar. */
export const ESTRESSE_MAX_INSPECAO = 50;
/** Unidades no roteiro do inspetor. */
export const PARADAS_INSPECAO = 5;
/** Visitantes da inauguração e fração mínima que precisa chegar. */
export const CONVIDADOS_INAUGURACAO = 150;
export const PRESENCA_MIN_INAUGURACAO = 0.7;
export const ESTRESSE_MAX_INAUGURACAO = 50;
/** Dias até nova tentativa após reprovação (um trimestre). */
export const DIAS_NOVA_TENTATIVA = 4;
/** Hora em que o inspetor chega e em que a inauguração começa. */
/** Inspetor chega às 08h30, no pico da manhã: é quando os elevadores são testados. */
const HORA_INSPECAO = 8;
const MINUTO_INSPECAO = 30;
const HORA_INAUGURACAO = 18;
const HORA_AVALIA_INAUGURACAO = 23;

export interface Requisito {
  texto: string;
  ok: boolean;
}

export interface Progresso {
  estrela: number;
  /** Próximo nível (null no Lendário). */
  proxima: number | null;
  populacaoAlvo: number;
  requisitos: Requisito[];
  /** Situação da etapa especial (inspeção/inauguração), se houver. */
  etapa: string | null;
}

export type EventoProgressao =
  | { tipo: 'estrela'; nivel: number; desbloqueios: string[] }
  | { tipo: 'inspecao_agendada'; dia: number }
  | { tipo: 'inspecao'; aprovada: boolean; estresse: number }
  | { tipo: 'inauguracao_agendada'; dia: number }
  | { tipo: 'inauguracao'; sucesso: boolean; presentes: number; convidados: number };

interface Nivel {
  populacao: number;
  unidades: [string, string][];
  satisfacaoMedia?: number;
  etapa?: 'inspecao' | 'inauguracao';
}

/** Requisitos para chegar a cada nível (índice = nível). */
const NIVEIS: Record<number, Nivel> = {
  2: { populacao: 250, unidades: [] },
  3: { populacao: 1000, unidades: [['seguranca', 'Segurança']] }, // era 1.200 (Fase 9: meio do jogo lento)
  4: {
    populacao: 4000,
    unidades: [['centro_medico', 'Centro médico'], ['hotel_suite', 'Suíte de hotel']],
    satisfacaoMedia: 55,
  },
  5: { populacao: 8000, unidades: [['metro', 'Estação de metrô']], etapa: 'inspecao' },
  6: { populacao: 12000, unidades: [['coroa', 'Coroa da Torre']], etapa: 'inauguracao' },
};

export interface ContextoProgressao {
  mundo: Mundo;
  populacao: Populacao;
  estados: Iterable<EstadoUnidade>;
  semAcesso: Set<number>;
  rng: Rng;
}

export interface ProgressaoSalva {
  estrela: number;
  escala: number;
  etapaAgendada: number | null;
  proximaTentativa: number;
  inspetor: number;
  convidados: number;
  presentes: number;
  estresseConvidados: number;
  emEtapa: boolean;
}

export class Progressao {
  estrela = 1;
  private etapaAgendada: number | null = null; // dia
  private proximaTentativa = 0; // dia
  private inspetor = 0;
  private convidados = 0;
  private presentes = 0;
  private estresseConvidados = 0;
  private emEtapa = false;

  /** `escala` reduz as metas de população (testes). */
  constructor(private readonly escala = 1) {}

  exportar(): ProgressaoSalva {
    return {
      estrela: this.estrela, escala: this.escala, etapaAgendada: this.etapaAgendada,
      proximaTentativa: this.proximaTentativa, inspetor: this.inspetor, convidados: this.convidados,
      presentes: this.presentes, estresseConvidados: this.estresseConvidados, emEtapa: this.emEtapa,
    };
  }

  importar(d: ProgressaoSalva): void {
    this.estrela = d.estrela;
    this.etapaAgendada = d.etapaAgendada;
    this.proximaTentativa = d.proximaTentativa;
    this.inspetor = d.inspetor;
    this.convidados = d.convidados;
    this.presentes = d.presentes;
    this.estresseConvidados = d.estresseConvidados;
    this.emEtapa = d.emEtapa;
  }

  alvoPopulacao(nivel: number): number {
    return Math.max(1, Math.round((NIVEIS[nivel]?.populacao ?? 0) * this.escala));
  }

  progresso(ctx: ContextoProgressao): Progresso {
    const proxima = this.estrela < LENDARIA ? this.estrela + 1 : null;
    if (!proxima) return { estrela: this.estrela, proxima: null, populacaoAlvo: 0, requisitos: [], etapa: null };
    const n = NIVEIS[proxima]!;
    const req = this.requisitosBase(proxima, ctx);
    if (n.etapa) {
      req.push({ texto: n.etapa === 'inspecao' ? 'Inspeção aprovada' : 'Inauguração da Coroa', ok: false });
    }
    let etapa: string | null = null;
    if (n.etapa && this.etapaAgendada !== null) {
      etapa = n.etapa === 'inspecao' ? `Inspetor marcado para o dia ${this.etapaAgendada + 1}` : `Inauguração no dia ${this.etapaAgendada + 1}`;
    }
    return { estrela: this.estrela, proxima, populacaoAlvo: this.alvoPopulacao(proxima), requisitos: req, etapa };
  }

  private requisitosBase(nivel: number, ctx: ContextoProgressao): Requisito[] {
    const n = NIVEIS[nivel]!;
    const pop = ctx.populacao.total;
    const alvo = this.alvoPopulacao(nivel);
    const req: Requisito[] = [{ texto: `População ${pop.toLocaleString('pt-BR')} / ${alvo.toLocaleString('pt-BR')}`, ok: pop >= alvo }];
    const tipos = new Set([...ctx.mundo.unidades.values()].map((u) => u.tipo));
    for (const [id, nome] of n.unidades) req.push({ texto: nome, ok: tipos.has(id) });
    if (n.satisfacaoMedia) {
      const media = satisfacaoMedia(ctx.estados);
      req.push({ texto: `Satisfação média ${Math.round(media)} / ${n.satisfacaoMedia}`, ok: media >= n.satisfacaoMedia });
    }
    return req;
  }

  /** Meia-noite: sobe de nível ou agenda a etapa especial. */
  diario(tick: number, ctx: ContextoProgressao): EventoProgressao[] {
    if (this.estrela >= LENDARIA || this.emEtapa) return [];
    const proxima = this.estrela + 1;
    if (!this.requisitosBase(proxima, ctx).every((r) => r.ok)) return [];
    const etapa = NIVEIS[proxima]!.etapa;
    if (!etapa) return [this.subir()];
    const dia = data(tick).diaTotal;
    if (this.etapaAgendada === null && dia >= this.proximaTentativa) {
      this.etapaAgendada = dia;
      return [{ tipo: etapa === 'inspecao' ? 'inspecao_agendada' : 'inauguracao_agendada', dia }];
    }
    return [];
  }

  /** Começo de cada hora: dispara a inspeção ou a inauguração no dia marcado. */
  hora(tick: number, ctx: ContextoProgressao): EventoProgressao[] {
    const d = data(tick);
    if (this.etapaAgendada !== d.diaTotal || this.estrela >= LENDARIA) return [];
    const etapa = NIVEIS[this.estrela + 1]!.etapa;
    if (etapa === 'inspecao' && d.hora === HORA_INSPECAO && !this.emEtapa) {
      const roteiro = this.roteiro(ctx);
      if (!roteiro.length) return this.reprovar(tick, 100);
      this.inspetor = ctx.populacao.inspecionar(roteiro, d.minutoDoDia + MINUTO_INSPECAO, tick).id;
      this.emEtapa = true;
    }
    if (etapa === 'inauguracao') {
      if (d.hora === HORA_INAUGURACAO && !this.emEtapa) {
        const coroa = [...ctx.mundo.unidades.values()].find((u) => u.tipo === 'coroa');
        if (!coroa) return this.reprovar(tick, 0);
        this.convidados = CONVIDADOS_INAUGURACAO;
        this.presentes = 0;
        this.estresseConvidados = 0;
        for (let i = 0; i < this.convidados; i++) {
          ctx.populacao.visitar(coroa, d.minutoDoDia + ctx.rng.inteiro(0, 59), tick, true);
        }
        this.emEtapa = true;
      } else if (d.hora === HORA_AVALIA_INAUGURACAO && this.emEtapa) {
        this.emEtapa = false;
        this.etapaAgendada = null;
        const media = this.presentes ? this.estresseConvidados / this.presentes : 100;
        const sucesso = this.presentes >= this.convidados * PRESENCA_MIN_INAUGURACAO && media < ESTRESSE_MAX_INAUGURACAO;
        const ev: EventoProgressao[] = [{ tipo: 'inauguracao', sucesso, presentes: this.presentes, convidados: this.convidados }];
        if (sucesso) ev.push(this.subir());
        else this.proximaTentativa = d.diaTotal + DIAS_NOVA_TENTATIVA;
        return ev;
      }
    }
    return [];
  }

  /** Avisos das pessoas: convidado chegou / inspetor terminou. */
  cliente(p: Pessoa): void {
    if (p.evento) {
      this.presentes++;
      this.estresseConvidados += p.estresse;
    }
  }

  partiu(p: Pessoa, tick: number): EventoProgressao[] {
    if (p.tipo !== 'inspetor' || p.id !== this.inspetor) return [];
    this.inspetor = 0;
    this.emEtapa = false;
    const terminou = p.chegou && p.roteiro.length === 0;
    const estresse = terminou ? Math.max(p.pico, p.estresse) : 100;
    if (terminou && estresse < ESTRESSE_MAX_INSPECAO) {
      this.etapaAgendada = null;
      return [{ tipo: 'inspecao', aprovada: true, estresse }, this.subir()];
    }
    return this.reprovar(tick, estresse);
  }

  private reprovar(tick: number, estresse: number): EventoProgressao[] {
    const dia = data(tick).diaTotal;
    this.etapaAgendada = null;
    this.emEtapa = false;
    this.proximaTentativa = dia + DIAS_NOVA_TENTATIVA;
    const etapa = NIVEIS[this.estrela + 1]?.etapa;
    return etapa === 'inauguracao'
      ? [{ tipo: 'inauguracao', sucesso: false, presentes: this.presentes, convidados: this.convidados }]
      : [{ tipo: 'inspecao', aprovada: false, estresse }];
  }

  private subir(): EventoProgressao {
    this.estrela++;
    this.etapaAgendada = null;
    this.proximaTentativa = 0;
    const desbloqueios = Object.values(TIPOS_POR_ESTRELA[this.estrela] ?? []);
    return { tipo: 'estrela', nivel: this.estrela, desbloqueios };
  }

  /** Até 5 unidades ocupadas e acessíveis, em andares variados. */
  private roteiro(ctx: ContextoProgressao): number[] {
    const candidatas = [...ctx.estados].filter((e) => e.situacao !== 'vaga' && !ctx.semAcesso.has(e.uid)).map((e) => e.uid);
    const r: number[] = [];
    while (r.length < PARADAS_INSPECAO && candidatas.length) {
      const i = ctx.rng.inteiro(0, candidatas.length - 1);
      r.push(candidatas.splice(i, 1)[0]!);
    }
    return r;
  }
}

function satisfacaoMedia(estados: Iterable<EstadoUnidade>): number {
  let soma = 0;
  let n = 0;
  for (const e of estados) {
    if (e.situacao === 'vaga') continue;
    soma += e.satisfacao;
    n++;
  }
  return n ? soma / n : 0;
}

/** Nomes das unidades liberadas em cada nível. */
const TIPOS_POR_ESTRELA: Record<number, string[]> = {};
for (const t of TIPOS) (TIPOS_POR_ESTRELA[t.estrela] ??= []).push(t.nome);
