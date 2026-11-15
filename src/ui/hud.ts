// HUD em DOM: barra superior, paleta de construção, status e avisos.
import { disponivelNaFase, TIPOS, type Categoria, type TipoUnidade } from '../sim/dados';
import { formatarData, formatarHora, VELOCIDADES, type Velocidade } from '../sim/relogio';
import { COR_CATEGORIA } from '../render/paleta';
import type { EstadoResumo } from '../worker/protocolo';
import { dinheiro, inteiro } from './formato';

export const DEMOLIR = 'demolir';

/** Atalhos de teclado das ferramentas mais usadas. */
export const ATALHOS: Record<string, string> = {
  p: 'piso',
  l: 'lobby',
  e: 'escavacao',
  o: 'escritorio',
  a: 'apartamento',
  x: DEMOLIR,
};

const GRUPOS: [string, Categoria[]][] = [
  ['Estrutura', ['estrutura']],
  ['Trabalho e moradia', ['trabalho', 'moradia']],
  ['Hotel', ['hotel']],
  ['Comida e comércio', ['comida', 'comercio']],
  ['Lazer', ['lazer']],
  ['Serviços', ['servico']],
  ['Acesso', ['acesso']],
  ['Transporte', ['transito']],
  ['Marco', ['marco']],
];

const ROTULO_VELOCIDADE: Record<Velocidade, string> = { 0: '⏸', 1: '1×', 2: '2×', 4: '4×', 8: '8×' };

export interface AcoesHud {
  velocidade(v: Velocidade): void;
  ferramenta(id: string | null): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function hex(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}

export class Hud {
  private readonly dinheiroEl = el('span', 'valor');
  private readonly popEl = el('span', 'valor');
  private readonly estrelaEl = el('span', 'estrelas');
  private readonly dataEl = el('span', 'valor');
  private readonly horaEl = el('span', 'valor');
  private readonly sandboxEl = el('span', 'sandbox', 'SANDBOX');
  private readonly botoesVel = new Map<Velocidade, HTMLButtonElement>();
  private readonly botoesPaleta = new Map<string, HTMLButtonElement>();
  private readonly statusEsq = el('span');
  private readonly statusPlano = el('span');
  private ultimaTrava = '';

  constructor(private readonly acoes: AcoesHud) {
    this.montarTopo(document.getElementById('hud')!);
    this.montarPaleta(document.getElementById('paleta')!);
    const status = document.getElementById('status')!;
    status.classList.add('painel');
    status.append(
      this.statusEsq,
      this.statusPlano,
      el('span', 'dica', 'Arraste para construir · botão direito move a câmera · roda = zoom · Esc cancela'),
    );
  }

  private montarTopo(raiz: HTMLElement): void {
    raiz.classList.add('painel');
    const marca = el('div', 'marca');
    marca.append('Game', el('span', undefined, 'Tower'));
    const bloco = (rotulo: string, valor: HTMLElement) => {
      const d = el('div');
      d.append(el('span', 'rotulo', rotulo), valor);
      return d;
    };
    const vel = el('div', 'velocidades');
    for (const v of VELOCIDADES) {
      const b = el('button', undefined, ROTULO_VELOCIDADE[v]);
      b.title = v === 0 ? 'Pausar (Espaço)' : `Velocidade ${v}×`;
      b.onclick = () => this.acoes.velocidade(v);
      this.botoesVel.set(v, b);
      vel.append(b);
    }
    this.sandboxEl.hidden = true;
    raiz.append(
      marca,
      bloco('Caixa', this.dinheiroEl),
      bloco('População', this.popEl),
      this.estrelaEl,
      this.sandboxEl,
      el('div', 'espaco'),
      this.dataEl,
      this.horaEl,
      vel,
    );
  }

  private montarPaleta(raiz: HTMLElement): void {
    raiz.classList.add('painel');
    const demolir = this.itemPaleta(DEMOLIR, 'Demolir', 0xff5a3c, 'Devolve 25% de unidades', 'x');
    raiz.append(el('h3', undefined, 'Ferramentas'), demolir);
    const atalhoDe = Object.fromEntries(Object.entries(ATALHOS).map(([k, v]) => [v, k]));
    for (const [titulo, cats] of GRUPOS) {
      const tipos = TIPOS.filter((t) => cats.includes(t.categoria) && t.id !== 'sky_lobby');
      if (!tipos.length) continue;
      raiz.append(el('h3', undefined, titulo));
      for (const t of tipos) raiz.append(this.itemPaleta(t.id, t.nome, COR_CATEGORIA[t.categoria], detalhe(t), atalhoDe[t.id]));
    }
  }

  private itemPaleta(id: string, nome: string, cor: number, det: string, atalho?: string): HTMLButtonElement {
    const b = el('button', 'paleta-item');
    const c = el('span', 'cor');
    c.style.background = hex(cor);
    const direita = atalho ? el('span', 'atalho', atalho.toUpperCase()) : el('span', 'trava');
    b.append(c, el('span', 'nome', nome), direita, el('span', 'detalhe', det));
    b.onclick = () => this.acoes.ferramenta(b.classList.contains('ativo') ? null : id);
    this.botoesPaleta.set(id, b);
    return b;
  }

  atualizar(e: EstadoResumo): void {
    this.dinheiroEl.textContent = dinheiro(e.dinheiro);
    this.dinheiroEl.style.color = e.dinheiro < 0 ? 'var(--erro)' : '';
    this.popEl.textContent = inteiro(e.populacao);
    this.estrelaEl.textContent = '★'.repeat(e.estrela) + '☆'.repeat(5 - e.estrela);
    this.dataEl.textContent = formatarData(e.tick);
    this.horaEl.textContent = formatarHora(e.tick);
    this.sandboxEl.hidden = !e.sandbox;
    for (const [v, b] of this.botoesVel) b.classList.toggle('ativo', v === e.velocidade);
    this.atualizarTravas(e);
  }

  /** Desabilita itens acima da estrela atual ou de fases futuras. */
  private atualizarTravas(e: EstadoResumo): void {
    const chave = `${e.estrela}:${e.sandbox}`;
    if (chave === this.ultimaTrava) return;
    this.ultimaTrava = chave;
    for (const t of TIPOS) {
      const b = this.botoesPaleta.get(t.id);
      if (!b) continue;
      const trava = b.querySelector('.trava');
      let motivo = '';
      if (!disponivelNaFase(t.id)) motivo = 'em breve';
      else if (t.estrela > e.estrela && !e.sandbox) motivo = `${t.estrela}★`;
      b.disabled = motivo !== '';
      b.title = motivo === 'em breve' ? 'Chega na próxima fase' : motivo ? `Requer ${motivo}` : t.observacao;
      if (trava) trava.textContent = motivo;
    }
  }

  marcarFerramenta(id: string | null): void {
    for (const [k, b] of this.botoesPaleta) b.classList.toggle('ativo', k === id);
  }

  status(local: string, plano: string, tipo: 'ok' | 'erro' | '' = ''): void {
    this.statusEsq.textContent = local;
    this.statusPlano.textContent = plano;
    this.statusPlano.className = tipo;
  }

  aviso(texto: string, tipo: 'ok' | 'erro' | 'info' = 'ok'): void {
    const raiz = document.getElementById('avisos')!;
    const a = el('div', `aviso painel ${tipo}`, texto);
    raiz.prepend(a);
    while (raiz.children.length > 5) raiz.lastElementChild!.remove();
    setTimeout(() => {
      a.classList.add('saindo');
      setTimeout(() => a.remove(), 400);
    }, 2600);
  }
}

function detalhe(t: TipoUnidade): string {
  const tamanho = t.largura_col === 1 ? 'por coluna' : `${t.largura_col}×${t.altura_andares}`;
  return `${dinheiro(t.custo)} · ${tamanho}`;
}
