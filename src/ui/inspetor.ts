// Painel de inspeção (direita): detalhes da unidade ou poço selecionado.
import { MAX_CARROS, tipo, type TipoUnidade } from '../sim/dados';
import { NIVEIS_PRECO, SATISFACAO_MINIMA, type EstadoUnidade, type NivelPreco } from '../sim/inquilinos';
import type { ResumoPoco } from '../sim/jogo';
import { nomeAndar, type Unidade } from '../sim/mundo';
import type { ModoElevador } from '../sim/transito';
import type { Inspecao } from '../worker/protocolo';
import type { FichaPessoa } from '../sim/pessoas';
import { dinheiro, inteiro } from './formato';

export interface AcoesInspetor {
  carros(uid: number, delta: 1 | -1): void;
  modo(uid: number, modo: ModoElevador): void;
  preco(uid: number, nivel: NivelPreco): void;
  seguir(): void;
  fechar(): void;
}

const NOME_TIPO: Record<FichaPessoa['tipo'], string> = {
  funcionario: 'Funcionário',
  morador: 'Morador',
  hospede: 'Hóspede',
  visitante: 'Visitante',
  inspetor: 'Inspetor',
};

const MODOS: [ModoElevador, string][] = [
  ['coletivo', 'Coletivo'],
  ['pico_manha', 'Pico da manhã (07–10h volta ao lobby)'],
];

export class Inspetor {
  private readonly raiz = document.getElementById('inspetor')!;
  private uidAtual = 0;
  private chave = '';

  constructor(private readonly acoes: AcoesInspetor) {
    this.raiz.classList.add('painel');
    this.raiz.hidden = true;
  }

  mostrar(u: Unidade | null, poco: ResumoPoco | undefined, semAcesso: boolean, insp: Inspecao | null): void {
    if (!u) {
      this.raiz.hidden = true;
      this.uidAtual = 0;
      this.chave = '';
      return;
    }
    const e = insp?.estado?.uid === u.uid ? insp.estado : null;
    // Só reconstrói o DOM quando algo visível mudou (evita perder o foco do select).
    const chave = JSON.stringify([
      u.uid,
      poco && [poco.carros, poco.modo, Math.round(poco.esperaMedia), poco.aguardando, poco.atendidos],
      semAcesso,
      e && [e.situacao, e.preco, Math.round(e.satisfacao), e.avisos, e.componentes, e.clientesHoje],
      insp && [insp.ocupantes, insp.lotacao],
    ]);
    if (chave === this.chave) return;
    this.chave = chave;
    this.uidAtual = u.uid;
    const t = tipo(u.tipo);
    const andares = u.altura > 1 ? `Andares ${nomeAndar(u.y)}–${nomeAndar(u.y + u.altura - 1)}` : `Andar ${nomeAndar(u.y)}`;

    const linhas: string[] = [];
    const linha = (k: string, v: string, classe = '') => linhas.push(`<div class="kv ${classe}"><span>${k}</span><b>${v}</b></div>`);
    linha('Local', andares);
    if (poco) {
      linha('Carros', `${poco.carros} / ${MAX_CARROS}`);
      linha('Capacidade', `${t.capacidade} pessoas/carro`);
      linha('Espera média', `${poco.esperaMedia.toFixed(0)} min`);
      linha('Aguardando agora', inteiro(poco.aguardando));
      linha('Viagens atendidas', inteiro(poco.atendidos));
    } else if (e) {
      linha('Situação', rotuloSituacao(t, e));
      linha('Receita', rotuloReceita(t, e));
      if (insp && t.populacao && e.situacao !== 'vaga') linha(t.categoria === 'moradia' ? 'Moradores' : t.categoria === 'hotel' ? 'Hóspedes' : 'Funcionários', String(insp.ocupantes));
      if (insp && t.capacidade && (t.categoria === 'comida' || t.categoria === 'comercio')) {
        linha('Lotação agora', `${insp.lotacao} / ${t.capacidade}`);
        linha('Clientes hoje', inteiro(e.clientesHoje));
      }
    } else if (t.capacidade) {
      linha('Capacidade', String(t.capacidade));
    }

    this.raiz.innerHTML = `
      <div class="insp-topo"><h2>${t.nome}</h2><button class="botao fechar" title="Fechar (Esc)">✕</button></div>
      ${semAcesso ? '<div class="alerta-acesso">Sem acesso: não há rota a partir do lobby.</div>' : ''}
      ${linhas.join('')}
      ${e ? this.blocoSatisfacao(e, insp!) : ''}
      ${e ? this.blocoPreco(e) : ''}
      ${poco ? `
        <div class="insp-acoes">
          <button class="botao acao" data-d="-1" ${poco.carros <= 1 ? 'disabled' : ''}>− Carro</button>
          <button class="botao acao" data-d="1" title="${dinheiro(t.custo_extra)}" ${poco.carros >= MAX_CARROS ? 'disabled' : ''}>+ Carro</button>
        </div>
        <label class="insp-modo">Despacho
          <select class="sel-modo">${MODOS.map(([v, n]) => `<option value="${v}" ${v === poco.modo ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>` : ''}
      ${t.observacao && !e ? `<p class="obs">${t.observacao}</p>` : ''}`;

    this.raiz.querySelector<HTMLButtonElement>('.fechar')!.onclick = () => this.acoes.fechar();
    for (const b of this.raiz.querySelectorAll<HTMLButtonElement>('.acao')) {
      b.onclick = () => this.acoes.carros(this.uidAtual, Number(b.dataset.d) as 1 | -1);
    }
    const selModo = this.raiz.querySelector<HTMLSelectElement>('.sel-modo');
    if (selModo) selModo.onchange = () => this.acoes.modo(this.uidAtual, selModo.value as ModoElevador);
    const selPreco = this.raiz.querySelector<HTMLSelectElement>('.sel-preco');
    if (selPreco) selPreco.onchange = () => this.acoes.preco(this.uidAtual, selPreco.value as NivelPreco);
    this.raiz.hidden = false;
  }

  /** Ficha da pessoa (docs/gdd.md §5.4). */
  mostrarPessoa(f: FichaPessoa | null, seguindo: boolean): void {
    if (!f) {
      this.raiz.innerHTML = `<div class="insp-topo"><h2>Pessoa</h2><button class="botao fechar">✕</button></div><p class="obs">Esta pessoa saiu do prédio de vez.</p>`;
      this.raiz.querySelector<HTMLButtonElement>('.fechar')!.onclick = () => this.acoes.fechar();
      this.raiz.hidden = false;
      this.chave = '';
      return;
    }
    const chave = JSON.stringify([f.id, f.situacao, Math.round(f.estresse), f.historico, seguindo]);
    if (chave === this.chave) return;
    this.chave = chave;
    this.uidAtual = 0;
    const est = Math.round(f.estresse);
    const nivel = est >= 70 ? 'ruim' : est >= 40 ? 'ok' : 'boa';
    const humor = est >= 70 ? 'furioso' : est >= 40 ? 'irritado' : 'tranquilo';
    this.raiz.innerHTML = `
      <div class="insp-topo"><h2>${f.nome}${f.vip ? ' <span class="vip">VIP</span>' : ''}</h2><button class="botao fechar" title="Fechar (Esc)">✕</button></div>
      <div class="kv"><span>Tipo</span><b>${NOME_TIPO[f.tipo]}</b></div>
      <div class="kv"><span>Vínculo</span><b>${f.vinculo}</b></div>
      <p class="situacao-pessoa">${f.situacao}</p>
      <div class="kv"><span>Estresse</span><b>${est} · ${humor}</b></div>
      <div class="barra"><div class="${nivel}" style="width:${est}%"></div></div>
      <div class="historico">${f.historico.map((h) => `<div>${h}</div>`).join('') || '<div class="obs">Nada a relatar ainda.</div>'}</div>
      <div class="insp-acoes"><button class="botao seguir">${seguindo ? 'Parar de seguir' : 'Seguir'}</button></div>`;
    this.raiz.querySelector<HTMLButtonElement>('.fechar')!.onclick = () => this.acoes.fechar();
    this.raiz.querySelector<HTMLButtonElement>('.seguir')!.onclick = () => this.acoes.seguir();
    this.raiz.hidden = false;
  }

  private blocoSatisfacao(e: EstadoUnidade, insp: Inspecao): string {
    const vaga = e.situacao === 'vaga';
    const valor = vaga ? insp.expectativa : e.satisfacao;
    const nivel = valor >= 70 ? 'boa' : valor >= 40 ? 'ok' : 'ruim';
    const c = e.componentes;
    const itens: [string, number][] = [
      ['Estresse dos ocupantes', -c.estresse * 0.6],
      ['Ruído da vizinhança', -c.ruido],
      ['Onde comer por perto', c.servicos],
      ['Nível de preço', c.preco],
      ['Pouco movimento', c.clientes],
      ['Lobby do prédio', c.lobby ?? 0],
    ];
    const detalhes = itens
      .filter(([, v]) => Math.round(v) !== 0)
      .map(([k, v]) => `<div class="kv sub"><span>${k}</span><b class="${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}</b></div>`)
      .join('');
    const aviso =
      e.avisos > 0
        ? `<div class="alerta-acesso">Inquilino insatisfeito: ${e.avisos} de 2 avisos. Sai no próximo fechamento se a satisfação continuar abaixo de ${SATISFACAO_MINIMA[e.preco]} (limite do preço ${NIVEIS_PRECO[e.preco].nome.toLowerCase()}).</div>`
        : '';
    return `
      <div class="satisf">
        <div class="kv"><span>${vaga ? 'Satisfação esperada' : 'Satisfação'}</span><b>${Math.round(valor)}</b></div>
        <div class="barra"><div class="${nivel}" style="width:${Math.round(valor)}%"></div></div>
        ${detalhes}
      </div>
      ${aviso}`;
  }

  private blocoPreco(e: EstadoUnidade): string {
    const opcoes = (Object.keys(NIVEIS_PRECO) as NivelPreco[])
      .map((n) => {
        const p = NIVEIS_PRECO[n];
        const sat = p.satisfacao ? ` · satisfação ${p.satisfacao > 0 ? '+' : ''}${p.satisfacao}` : '';
        return `<option value="${n}" ${n === e.preco ? 'selected' : ''}>${p.nome} (×${p.mult.toLocaleString('pt-BR')}${sat}, sai abaixo de ${SATISFACAO_MINIMA[n]})</option>`;
      })
      .join('');
    return `<label class="insp-modo">Preço<select class="sel-preco">${opcoes}</select></label>`;
  }
}

function rotuloSituacao(t: TipoUnidade, e: EstadoUnidade): string {
  switch (t.receita_tipo) {
    case 'aluguel_tri':
      return e.situacao === 'vaga' ? 'Para alugar' : 'Alugado';
    case 'venda':
      return e.situacao === 'vaga' ? (e.desvalorizado ? 'À venda (−30%)' : 'À venda') : 'Vendido';
    case 'diaria':
      return {
        vaga: 'Livre',
        hospedada: 'Hóspedes esta noite',
        suja: 'Aguardando limpeza',
        infestada: 'Pragas! Aguardando limpeza',
        ocupada: 'Ocupado',
      }[e.situacao];
    default:
      return 'Funcionando';
  }
}

function rotuloReceita(t: TipoUnidade, e: EstadoUnidade): string {
  const v = Math.round(t.receita_valor * NIVEIS_PRECO[e.preco].mult * (e.desvalorizado ? 0.7 : 1));
  switch (t.receita_tipo) {
    case 'aluguel_tri':
      return `${dinheiro(v)} / trimestre`;
    case 'venda':
      return `${dinheiro(v)} na venda`;
    case 'diaria':
      return `${dinheiro(v)} / noite`;
    case 'por_cliente':
      return `${dinheiro(v)} por cliente`;
    default:
      return '—';
  }
}
