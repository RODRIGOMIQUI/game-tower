// Inquilinos e economia das unidades. Ver docs/gdd.md §7 e docs/economia.md.
//
// - Escritório e loja: inquilino aluga; aluguel cobrado no fechamento do trimestre.
// - Apartamento: vendido uma vez quando o comprador se muda.
// - Hotel: reservas diárias; o quarto fica sujo após o check-out até a limpeza.
// - Comida: administrada pela torre; recebe por cliente.
// Satisfação diária por unidade; inquilinos insatisfeitos por 2 trimestres saem.

import { tipo, type TipoUnidade } from './dados';
import type { Mundo, Unidade } from './mundo';
import { centro, type Pessoa, type Populacao } from './pessoas';
import { data } from './relogio';
import type { Rng } from './rng';
import type { Roteador } from './rotas';

export type NivelPreco = 'baixo' | 'normal' | 'alto' | 'premium';

/** Níveis de preço (docs/economia.md §2). */
export const NIVEIS_PRECO: Record<NivelPreco, { nome: string; mult: number; satisfacao: number; demanda: number }> = {
  baixo: { nome: 'Baixo', mult: 0.8, satisfacao: 10, demanda: 1.5 },
  normal: { nome: 'Normal', mult: 1, satisfacao: 0, demanda: 1 },
  alto: { nome: 'Alto', mult: 1.25, satisfacao: -10, demanda: 0.6 },
  premium: { nome: 'Premium', mult: 1.6, satisfacao: -20, demanda: 0.3 },
};

export type Situacao = 'vaga' | 'ocupada' | 'hospedada' | 'suja';
export const CODIGO_SITUACAO: Record<Situacao, number> = { vaga: 0, ocupada: 1, hospedada: 2, suja: 3 };

export type CategoriaReceita = 'aluguel' | 'vendas' | 'hotel' | 'comida';

export interface Componentes {
  estresse: number;
  ruido: number;
  servicos: number;
  preco: number;
  clientes: number;
}

export interface EstadoUnidade {
  uid: number;
  tipo: string;
  situacao: Situacao;
  preco: NivelPreco;
  /** 0–100, média móvel diária. */
  satisfacao: number;
  componentes: Componentes;
  /** Trimestres seguidos com satisfação < 25. */
  avisos: number;
  /** Apartamento revendido após o morador sair: vale 70%. */
  desvalorizado: boolean;
  /** Média móvel do estresse de clientes/hóspedes. */
  estresseClientes: number;
  clientesHoje: number;
}

/** Quem recebe o dinheiro (o Jogo). */
export interface Caixa {
  creditar(categoria: CategoriaReceita, valor: number): void;
}

export interface ContextoEconomia {
  mundo: Mundo;
  populacao: Populacao;
  rng: Rng;
  semAcesso: Set<number>;
}

/** Satisfação abaixo da qual o inquilino recebe um aviso no trimestre. */
export const SATISFACAO_CRITICA = 25;
/** Ruído: alcance horizontal no mesmo andar (colunas). */
const ALCANCE_RUIDO = 10;
const RUIDO_MAX = 40;
const BONUS_SERVICOS = 10;

/** Probabilidade por hora de um interessado ocupar uma unidade vaga (antes de preço/expectativa). */
const PROCURA_POR_HORA: Record<string, number> = { escritorio: 0.06, loja: 0.05, apartamento: 0.04 };
/** Chance diária de reserva de um quarto limpo. */
const PROCURA_HOTEL = 0.8;
/** Visitantes por hora: [hora início, hora fim (exclusiva), visitantes/h]. */
const VISITAS: Record<string, [number, number, number][]> = {
  lanchonete: [[11, 14, 15]],
  restaurante: [[11, 14, 10], [18, 21, 15]],
  loja: [[10, 20, 8]],
};
/** Quartos que uma unidade de limpeza arruma por dia (10h–17h). */
const QUARTOS_POR_LIMPEZA_DIA = 20;
const HORAS_LIMPEZA = 7;

function modelo(t: TipoUnidade): 'aluguel' | 'venda' | 'hotel' | 'cliente' | null {
  switch (t.receita_tipo) {
    case 'aluguel_tri':
      return 'aluguel';
    case 'venda':
      return 'venda';
    case 'diaria':
      return 'hotel';
    case 'por_cliente':
      return 'cliente';
    default:
      return null;
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export class Inquilinos {
  readonly estados = new Map<number, EstadoUnidade>();
  /** Incrementa quando situação/satisfação mudam (o render redesenha). */
  versao = 0;
  private creditoLimpeza = 0;

  constructor(private readonly caixa: Caixa) {}

  get(uid: number): EstadoUnidade | undefined {
    return this.estados.get(uid);
  }

  // --------------------------------------------------------- mundo mudou

  sincronizar(mundo: Mundo): void {
    for (const uid of [...this.estados.keys()]) if (!mundo.unidades.has(uid)) this.estados.delete(uid);
    for (const u of mundo.unidades.values()) {
      if (this.estados.has(u.uid)) continue;
      const m = modelo(tipo(u.tipo));
      if (!m) continue;
      this.estados.set(u.uid, {
        uid: u.uid, tipo: u.tipo, situacao: m === 'cliente' ? 'ocupada' : 'vaga', preco: 'normal',
        satisfacao: 70, componentes: { estresse: 0, ruido: 0, servicos: 0, preco: 0, clientes: 0 },
        avisos: 0, desvalorizado: false, estresseClientes: 0, clientesHoje: 0,
      });
    }
    this.versao++;
  }

  /** Recalcula ruído e acesso a comida (depende só do prédio). */
  atualizarVizinhanca(mundo: Mundo, roteador: Roteador): void {
    const unidades = [...mundo.unidades.values()];
    const barulhentas = unidades.filter((u) => tipo(u.tipo).ruido_emite > 0);
    const comidas = unidades.filter((u) => tipo(u.tipo).categoria === 'comida');
    const servicoPorTrecho = new Map<string, boolean>();

    for (const e of this.estados.values()) {
      const u = mundo.unidades.get(e.uid)!;
      const t = tipo(u.tipo);
      // Ruído: só incomoda moradia e hotel.
      let ruido = 0;
      if (t.sensivel_ruido) {
        for (const b of barulhentas) {
          if (b.uid === u.uid) continue;
          const gap = Math.max(b.x - (u.x + u.largura), u.x - (b.x + b.largura), 0);
          const mesmoAndar = b.y <= u.y && u.y < b.y + b.altura;
          const vizinhoVertical = b.y + b.altura === u.y || b.y === u.y + 1;
          if (mesmoAndar && gap <= ALCANCE_RUIDO) ruido += tipo(b.tipo).ruido_emite * 4;
          else if (vizinhoVertical && gap === 0) ruido += tipo(b.tipo).ruido_emite * 2;
        }
      }
      e.componentes.ruido = Math.min(RUIDO_MAX, ruido);

      // Serviços: ter onde comer a partir da unidade.
      let servicos = 0;
      if (t.categoria === 'trabalho' || t.categoria === 'moradia' || t.categoria === 'hotel') {
        const x = centro(u);
        const chave = `${u.y}:${roteador.segmentoEm(x, u.y)}`;
        let ok = servicoPorTrecho.get(chave);
        if (ok === undefined) {
          const ordem = [...comidas].sort((a, b) => Math.abs(a.y - u.y) - Math.abs(b.y - u.y));
          ok = ordem.some((c) => roteador.rota(x, u.y, centro(c), c.y) !== null);
          servicoPorTrecho.set(chave, ok);
        }
        if (ok) servicos = BONUS_SERVICOS;
      }
      e.componentes.servicos = servicos;
      e.componentes.preco = NIVEIS_PRECO[e.preco].satisfacao;
    }
    this.versao++;
  }

  /** Satisfação esperada sem contar o estresse (usada para atrair inquilinos). */
  expectativa(e: EstadoUnidade): number {
    const c = e.componentes;
    return clamp(90 - c.ruido + c.servicos + c.preco);
  }

  mudarPreco(uid: number, nivel: NivelPreco): boolean {
    const e = this.estados.get(uid);
    if (!e) return false;
    e.preco = nivel;
    e.componentes.preco = NIVEIS_PRECO[nivel].satisfacao;
    this.versao++;
    return true;
  }

  // ---------------------------------------------------------- por hora

  hora(tick: number, ctx: ContextoEconomia): void {
    const d = data(tick);
    const h = d.hora;
    if (h >= 8 && h < 20) this.procurarInquilinos(tick, ctx);
    if (h === 14) this.reservarQuartos(tick, ctx);
    if (h >= 10 && h < 10 + HORAS_LIMPEZA) this.limpar(ctx.mundo);
    this.trazerVisitantes(tick, h, d.fimDeSemana, ctx);
  }

  private procurarInquilinos(tick: number, ctx: ContextoEconomia): void {
    for (const e of this.estados.values()) {
      if (e.situacao !== 'vaga' || ctx.semAcesso.has(e.uid)) continue;
      const base = PROCURA_POR_HORA[e.tipo];
      if (!base) continue;
      const p = base * NIVEIS_PRECO[e.preco].demanda * (0.3 + 0.7 * (this.expectativa(e) / 100));
      if (ctx.rng.proximo() < p) this.ocupar(e, tick, ctx);
    }
  }

  /** Inquilino/comprador se muda. */
  ocupar(e: EstadoUnidade, tick: number, ctx: Pick<ContextoEconomia, 'mundo' | 'populacao'>): void {
    const u = ctx.mundo.unidades.get(e.uid);
    if (!u) return;
    e.situacao = 'ocupada';
    e.avisos = 0;
    e.satisfacao = this.expectativa(e);
    ctx.populacao.ocupar(u, tick);
    const t = tipo(u.tipo);
    if (t.receita_tipo === 'venda') {
      this.caixa.creditar('vendas', Math.round(t.receita_valor * NIVEIS_PRECO[e.preco].mult * (e.desvalorizado ? 0.7 : 1)));
      e.desvalorizado = false;
    }
    this.versao++;
  }

  private reservarQuartos(tick: number, ctx: ContextoEconomia): void {
    for (const e of this.estados.values()) {
      if (e.situacao !== 'vaga' || !e.tipo.startsWith('hotel_') || ctx.semAcesso.has(e.uid)) continue;
      const p = PROCURA_HOTEL * NIVEIS_PRECO[e.preco].demanda * (0.3 + 0.7 * (e.satisfacao / 100));
      if (ctx.rng.proximo() >= p) continue;
      const u = ctx.mundo.unidades.get(e.uid)!;
      const t = tipo(u.tipo);
      const chegada = 900 + ctx.rng.inteiro(0, 240); // 15:00–19:00
      ctx.populacao.hospedar(u, t.capacidade, chegada, tick);
      e.situacao = 'hospedada';
      this.caixa.creditar('hotel', Math.round(t.receita_valor * NIVEIS_PRECO[e.preco].mult));
      this.versao++;
    }
  }

  private limpar(mundo: Mundo): void {
    let equipes = 0;
    for (const u of mundo.unidades.values()) if (u.tipo === 'limpeza') equipes++;
    if (!equipes) return;
    this.creditoLimpeza += (equipes * QUARTOS_POR_LIMPEZA_DIA) / HORAS_LIMPEZA;
    for (const e of this.estados.values()) {
      if (this.creditoLimpeza < 1) break;
      if (e.situacao !== 'suja') continue;
      e.situacao = 'vaga';
      this.creditoLimpeza--;
      this.versao++;
    }
    if (this.creditoLimpeza > 1) this.creditoLimpeza = 1; // não acumula de um dia para outro
  }

  private trazerVisitantes(tick: number, h: number, fimDeSemana: boolean, ctx: ContextoEconomia): void {
    for (const e of this.estados.values()) {
      const faixas = VISITAS[e.tipo];
      if (!faixas || e.situacao !== 'ocupada' || ctx.semAcesso.has(e.uid)) continue;
      const faixa = faixas.find(([ini, fim]) => h >= ini && h < fim);
      if (!faixa) continue;
      const u = ctx.mundo.unidades.get(e.uid)!;
      const fator = NIVEIS_PRECO[e.preco].demanda * (0.3 + 0.7 * (e.satisfacao / 100)) * (fimDeSemana ? 1.5 : 1);
      const n = Math.round(faixa[2] * fator * (0.6 + ctx.rng.proximo() * 0.8));
      for (let i = 0; i < n; i++) ctx.populacao.visitar(u, h * 60 + ctx.rng.inteiro(0, 59), tick);
    }
  }

  // ------------------------------------------- eventos vindos das pessoas

  cliente(uid: number, p: Pessoa, mundo: Mundo): void {
    const e = this.estados.get(uid);
    if (!e) return;
    e.clientesHoje++;
    e.estresseClientes = e.estresseClientes * 0.9 + p.estresse * 0.1;
    const t = tipo(mundo.unidades.get(uid)?.tipo ?? e.tipo);
    if (t.receita_tipo === 'por_cliente') {
      this.caixa.creditar('comida', Math.round(t.receita_valor * NIVEIS_PRECO[e.preco].mult));
    }
  }

  /** Hóspede saiu do prédio: quando o último sai, o quarto fica sujo. */
  partiu(p: Pessoa, populacao: Populacao): void {
    if (p.tipo !== 'hospede') return;
    const e = this.estados.get(p.casa);
    if (!e || e.situacao !== 'hospedada') return;
    if (p.chegou) e.estresseClientes = e.estresseClientes * 0.7 + p.estresse * 0.3;
    const restantes = populacao.ocupantes(p.casa).filter((o) => o.id !== p.id);
    if (restantes.length) return;
    e.situacao = p.chegou ? 'suja' : 'vaga';
    this.versao++;
  }

  // ---------------------------------------------------------- por dia

  /** Meia-noite: atualiza a satisfação de cada unidade. */
  fimDoDia(populacao: Populacao): void {
    for (const e of this.estados.values()) {
      const c = e.componentes;
      if (e.situacao === 'vaga' && (e.tipo === 'escritorio' || e.tipo === 'apartamento' || e.tipo === 'loja')) {
        c.estresse = 0;
        c.clientes = 0;
        e.satisfacao = this.expectativa(e);
        continue;
      }
      if (e.tipo === 'escritorio' || e.tipo === 'apartamento') {
        const oc = populacao.ocupantes(e.uid);
        c.estresse = oc.length ? oc.reduce((s, p) => s + p.estresse, 0) / oc.length : 0;
      } else c.estresse = e.estresseClientes;
      // Loja sem movimento: o lojista reclama.
      c.clientes = e.tipo === 'loja' && e.clientesHoje < 5 ? -20 : 0;
      e.clientesHoje = 0;
      const hoje = clamp(100 - c.estresse * 0.6 - c.ruido + c.servicos + c.preco + c.clientes);
      e.satisfacao = e.satisfacao * 0.65 + hoje * 0.35;
    }
    this.versao++;
  }

  // ----------------------------------------------------- por trimestre

  /** Cobra aluguéis e aplica avisos; devolve as unidades cujo inquilino saiu. */
  fecharTrimestre(populacao: Populacao, mundo: Mundo): number[] {
    const saidas: number[] = [];
    for (const e of this.estados.values()) {
      const u = mundo.unidades.get(e.uid);
      if (!u || e.situacao !== 'ocupada') continue;
      const t = tipo(u.tipo);
      if (t.receita_tipo === 'aluguel_tri') {
        this.caixa.creditar('aluguel', Math.round(t.receita_valor * NIVEIS_PRECO[e.preco].mult));
      }
      if (t.receita_tipo !== 'aluguel_tri' && t.receita_tipo !== 'venda') continue;
      e.avisos = e.satisfacao < SATISFACAO_CRITICA ? e.avisos + 1 : 0;
      if (e.avisos >= 2) {
        populacao.desocupar(e.uid);
        e.situacao = 'vaga';
        e.avisos = 0;
        if (t.receita_tipo === 'venda') e.desvalorizado = true;
        saidas.push(e.uid);
      }
    }
    this.versao++;
    return saidas;
  }

  /** Ocupa tudo o que estiver vago (testes e cenários). */
  ocuparTodas(tick: number, ctx: Pick<ContextoEconomia, 'mundo' | 'populacao'>): void {
    for (const e of this.estados.values()) {
      if (e.situacao === 'vaga' && !e.tipo.startsWith('hotel_')) this.ocupar(e, tick, ctx);
    }
  }

  /** Para o render: [uid, situação, satisfação, avisos] por unidade. */
  resumo(): Float32Array {
    const r: number[] = [];
    for (const e of this.estados.values()) r.push(e.uid, CODIGO_SITUACAO[e.situacao], e.satisfacao, e.avisos);
    return new Float32Array(r);
  }
}
