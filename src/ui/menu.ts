// Menu inicial e menu do jogo: nova partida, cenários, salvar/carregar,
// exportar/importar e a tela de atalhos.
import { CENARIOS } from '../sim/cenarios';
import { formatarData, formatarHora } from '../sim/relogio';
import type { SlotSalvo } from '../worker/armazenamento';
import type { NovoJogo } from '../worker/protocolo';
import { dinheiro, inteiro } from './formato';

export interface AcoesMenu {
  novo(n: NovoJogo): void;
  carregar(slot: string): void;
  salvar(slot: string): void;
  exportar(): void;
  importar(dados: ArrayBuffer): void;
  relatorios(): void;
  fechar(): void;
}

const SLOTS_MANUAIS = ['1', '2', '3'];

export const ATALHOS_TEXTO: [string, string][] = [
  ['Arrastar (botão esquerdo)', 'Construir em linha ou retângulo'],
  ['Botão direito / meio', 'Mover a câmera'],
  ['Roda, + e −', 'Zoom'],
  ['Setas', 'Mover a câmera'],
  ['Espaço', 'Pausar / continuar'],
  ['1 2 3 4', 'Velocidade 1× 2× 4× 8×'],
  ['P L E O A V T', 'Piso, lobby, escavação, escritório, apartamento, elevador, escada'],
  ['X', 'Demolir'],
  ['Ctrl+Z', 'Desfazer construção/demolição'],
  ['C', 'Trocar camada (estresse, satisfação, ruído, ocupação, espera, tráfego)'],
  ['R', 'Relatórios'],
  ['M', 'Menu do jogo (salvar, carregar…)'],
  ['?', 'Esta lista'],
  ['Esc', 'Cancelar / fechar'],
  ['Clique numa pessoa', 'Ficha da pessoa (e Seguir)'],
];

export class Menu {
  private readonly raiz = document.getElementById('menu')!;
  private saves: SlotSalvo[] = [];
  private tela: 'inicio' | 'jogo' | 'cenarios' | 'carregar' | 'salvar' | 'atalhos' = 'inicio';
  private emJogo = false;

  constructor(private readonly acoes: AcoesMenu) {}

  get aberto(): boolean {
    return !this.raiz.hidden;
  }

  atualizarSaves(lista: SlotSalvo[]): void {
    this.saves = lista;
    if (this.aberto) this.render();
  }

  abrirInicio(): void {
    this.emJogo = false;
    this.ir('inicio');
  }

  abrirJogo(): void {
    this.emJogo = true;
    this.ir('jogo');
  }

  abrirAtalhos(): void {
    this.ir('atalhos');
  }

  fechar(): void {
    this.raiz.hidden = true;
  }

  private ir(tela: Menu['tela']): void {
    this.tela = tela;
    this.raiz.hidden = false;
    this.render();
  }

  private render(): void {
    const corpo = {
      inicio: () => this.inicio(),
      jogo: () => this.jogo(),
      cenarios: () => this.cenarios(),
      carregar: () => this.listaSaves('carregar'),
      salvar: () => this.listaSaves('salvar'),
      atalhos: () => this.atalhos(),
    }[this.tela]();
    this.raiz.replaceChildren(corpo);
  }

  private caixa(titulo: string, voltar?: () => void): [HTMLElement, HTMLElement] {
    const c = el('div', 'painel menu-caixa');
    const topo = el('div', 'menu-topo');
    const h = el('h2', '', titulo);
    topo.append(h);
    if (voltar) topo.append(botao('← Voltar', voltar));
    else if (this.emJogo || this.tela === 'atalhos') topo.append(botao('✕', () => this.voltarAoJogo()));
    const conteudo = el('div', 'menu-conteudo');
    c.append(topo, conteudo);
    return [c, conteudo];
  }

  private voltarAoJogo(): void {
    if (this.emJogo || this.tela === 'atalhos') this.acoes.fechar();
  }

  private inicio(): HTMLElement {
    const [c, conteudo] = this.caixa('');
    const marca = el('div', 'menu-marca');
    marca.innerHTML = 'Game<span>Tower</span>';
    const sub = el('p', 'obs', 'Construa, ocupe e mantenha a torre andando.');
    conteudo.append(marca, sub);
    const auto = this.saves.find((s) => s.slot === 'auto');
    if (auto) conteudo.append(botao(`Continuar · ${descrever(auto)}`, () => this.acoes.carregar('auto'), 'principal'));
    conteudo.append(
      botao('Nova carreira', () => this.acoes.novo({ seed: Date.now() >>> 0, sandbox: false }), auto ? '' : 'principal'),
      botao('Sandbox (dinheiro livre, tudo liberado)', () => this.acoes.novo({ seed: Date.now() >>> 0, sandbox: true })),
      botao('Cenários', () => this.ir('cenarios')),
      botao('Carregar jogo salvo', () => this.ir('carregar')),
      this.botaoImportar(),
      botao('Atalhos de teclado', () => this.ir('atalhos')),
    );
    return c;
  }

  private jogo(): HTMLElement {
    const [c, conteudo] = this.caixa('Menu');
    conteudo.append(
      botao('Voltar ao jogo', () => this.acoes.fechar(), 'principal'),
      botao('Salvar…', () => this.ir('salvar')),
      botao('Carregar…', () => this.ir('carregar')),
      botao('Exportar para arquivo', () => this.acoes.exportar()),
      this.botaoImportar(),
      botao('Relatórios', () => this.acoes.relatorios()),
      botao('Atalhos de teclado', () => this.ir('atalhos')),
      botao('Novo jogo…', () => this.abrirInicio()),
    );
    return c;
  }

  private cenarios(): HTMLElement {
    const [c, conteudo] = this.caixa('Cenários', () => this.ir(this.emJogo ? 'jogo' : 'inicio'));
    for (const cen of CENARIOS) {
      const card = el('button', 'cartao-cenario');
      card.append(el('b', '', cen.nome), el('span', '', cen.descricao), el('em', '', `Objetivo: ${cen.objetivo}`));
      card.onclick = () => this.acoes.novo({ seed: Date.now() >>> 0, sandbox: false, cenario: cen.id });
      conteudo.append(card);
    }
    return c;
  }

  private listaSaves(modo: 'carregar' | 'salvar'): HTMLElement {
    const [c, conteudo] = this.caixa(modo === 'salvar' ? 'Salvar' : 'Carregar', () => this.ir(this.emJogo ? 'jogo' : 'inicio'));
    const slots = modo === 'salvar' ? SLOTS_MANUAIS : ['auto', ...SLOTS_MANUAIS];
    for (const slot of slots) {
      const s = this.saves.find((x) => x.slot === slot);
      const nome = slot === 'auto' ? 'Automático' : `Espaço ${slot}`;
      const texto = s ? `${nome} · ${descrever(s)}` : `${nome} · vazio`;
      const b = botao(texto, () => (modo === 'salvar' ? this.acoes.salvar(slot) : this.acoes.carregar(slot)));
      if (modo === 'carregar' && !s) b.disabled = true;
      conteudo.append(b);
    }
    if (modo === 'salvar') conteudo.append(el('p', 'obs', 'O jogo também salva sozinho no espaço automático a cada fechamento de trimestre.'));
    return c;
  }

  private atalhos(): HTMLElement {
    const [c, conteudo] = this.caixa('Atalhos', this.emJogo ? () => this.ir('jogo') : this.raiz.hidden ? undefined : () => this.ir('inicio'));
    const t = el('table', 'tabela atalhos');
    for (const [k, v] of ATALHOS_TEXTO) {
      const tr = el('tr', '');
      tr.append(el('td', '', k), el('td', '', v));
      t.append(tr);
    }
    conteudo.append(t);
    return c;
  }

  private botaoImportar(): HTMLElement {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = '.gametower';
    entrada.hidden = true;
    entrada.onchange = async () => {
      const f = entrada.files?.[0];
      if (f) this.acoes.importar(await f.arrayBuffer());
    };
    const b = botao('Importar de arquivo…', () => entrada.click());
    const w = el('div', '');
    w.append(b, entrada);
    return w;
  }
}

function descrever(s: SlotSalvo): string {
  const m = s.meta;
  const quando = new Date(s.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const modo = m.sandbox ? 'sandbox' : `${m.estrela >= 6 ? 'Lendária' : `${m.estrela}★`}`;
  return `${formatarData(m.tick)} ${formatarHora(m.tick)} · ${modo} · ${inteiro(m.populacao)} pessoas · ${dinheiro(m.dinheiro)} · salvo ${quando}`;
}

function el(tag: string, classe: string, texto?: string): HTMLElement {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(texto: string, f: () => void, classe = ''): HTMLButtonElement {
  const b = el('button', `botao menu-botao ${classe}`, texto) as HTMLButtonElement;
  b.onclick = f;
  return b;
}
