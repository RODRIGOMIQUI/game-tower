// Relatórios (tecla R): gráficos dia a dia. Ver docs/gdd.md §11.
// Pequenos múltiplos, um eixo por gráfico (nunca dois), linhas finas,
// cursor vertical com dica ao passar o mouse e uma visão em tabela.
import type { RegistroDia } from '../sim/jogo';
import { dinheiro, inteiro } from './formato';

interface Serie {
  nome: string;
  cor: string;
  valor: (r: RegistroDia) => number;
}

interface Grafico {
  titulo: string;
  formato: (v: number) => string;
  series: Serie[];
  /** Eixo parte do zero (contagens e fluxos); senão, segue a faixa dos dados. */
  zero?: boolean;
}

// Cores categóricas validadas para o painel escuro (#1e2129): azul e laranja.
const AZUL = 'var(--serie-1)';
const LARANJA = 'var(--serie-2)';

const GRAFICOS: Grafico[] = [
  { titulo: 'Caixa', formato: dinheiro, series: [{ nome: 'Caixa', cor: AZUL, valor: (r) => r.caixa }] },
  {
    titulo: 'Receitas e despesas do dia',
    formato: dinheiro,
    zero: true,
    series: [
      { nome: 'Receitas', cor: AZUL, valor: (r) => r.receitas },
      { nome: 'Despesas', cor: LARANJA, valor: (r) => r.despesas },
    ],
  },
  { titulo: 'População', formato: inteiro, zero: true, series: [{ nome: 'População', cor: AZUL, valor: (r) => r.populacao }] },
  {
    titulo: 'Satisfação média',
    formato: (v) => v.toFixed(0),
    series: [{ nome: 'Satisfação', cor: AZUL, valor: (r) => r.satisfacao }],
  },
  {
    titulo: 'Espera média por elevador (min)',
    formato: (v) => v.toFixed(0),
    series: [{ nome: 'Espera', cor: AZUL, valor: (r) => r.espera }],
  },
  {
    titulo: 'Desistências por dia',
    formato: inteiro,
    zero: true,
    series: [{ nome: 'Desistências', cor: AZUL, valor: (r) => r.desistencias }],
  },
];

const L = 300;
const A = 120;
const M = { esq: 8, dir: 8, topo: 10, base: 18 };

export class Relatorios {
  private readonly raiz = document.getElementById('relatorios')!;
  private dados: RegistroDia[] = [];
  private tabela = false;

  constructor(private readonly fechar: () => void) {
    this.raiz.hidden = true;
  }

  get aberto(): boolean {
    return !this.raiz.hidden;
  }

  mostrar(dados: RegistroDia[]): void {
    this.dados = dados;
    this.raiz.hidden = false;
    this.render();
  }

  esconder(): void {
    this.raiz.hidden = true;
  }

  private render(): void {
    const r = this.raiz;
    r.replaceChildren();
    const caixa = document.createElement('div');
    caixa.className = 'painel relatorios-caixa';
    const topo = document.createElement('div');
    topo.className = 'insp-topo';
    const h = document.createElement('h2');
    h.textContent = 'Relatórios';
    const alternar = document.createElement('button');
    alternar.className = 'botao';
    alternar.textContent = this.tabela ? 'Ver gráficos' : 'Ver tabela';
    alternar.onclick = () => {
      this.tabela = !this.tabela;
      this.render();
    };
    const fechar = document.createElement('button');
    fechar.className = 'botao fechar';
    fechar.textContent = '✕';
    fechar.title = 'Fechar (R ou Esc)';
    fechar.onclick = () => this.fechar();
    const acoes = document.createElement('div');
    acoes.style.display = 'flex';
    acoes.style.gap = '6px';
    acoes.append(alternar, fechar);
    topo.append(h, acoes);
    caixa.append(topo);
    if (this.dados.length < 2) {
      const p = document.createElement('p');
      p.className = 'obs';
      p.textContent = 'Os relatórios começam a aparecer depois do primeiro dia completo.';
      caixa.append(p);
    } else if (this.tabela) caixa.append(this.tabelaHtml());
    else {
      const grade = document.createElement('div');
      grade.className = 'grade-graficos';
      for (const g of GRAFICOS) grade.append(this.grafico(g));
      caixa.append(grade);
    }
    r.append(caixa);
  }

  private grafico(g: Grafico): HTMLElement {
    const d = this.dados;
    const fig = document.createElement('figure');
    fig.className = 'grafico';
    const cab = document.createElement('figcaption');
    const titulo = document.createElement('span');
    titulo.textContent = g.titulo;
    const ultimo = document.createElement('b');
    ultimo.textContent = g.formato(g.series[0]!.valor(d[d.length - 1]!));
    cab.append(titulo, ultimo);
    fig.append(cab);
    if (g.series.length > 1) {
      // Legenda sempre presente com 2+ séries.
      const leg = document.createElement('div');
      leg.className = 'legenda';
      for (const s of g.series) {
        const item = document.createElement('span');
        const cor = document.createElement('i');
        cor.style.background = s.cor;
        item.append(cor, document.createTextNode(s.nome));
        leg.append(item);
      }
      fig.append(leg);
    }

    let min = Infinity;
    let max = -Infinity;
    for (const s of g.series) for (const r of d) {
      const v = s.valor(r);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (g.zero && min > 0) min = 0;
    if (!g.zero) {
      const folga = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
      min -= folga;
      max += folga;
    }
    if (max === min) max = min + 1;
    const x = (i: number) => M.esq + (i / (d.length - 1)) * (L - M.esq - M.dir);
    const y = (v: number) => M.topo + (1 - (v - min) / (max - min)) * (A - M.topo - M.base);

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', g.titulo);
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      svg.append(e);
      return e;
    };
    // Grade recessiva: base e topo, com o valor do topo (e da base, se não for zero).
    el('line', { x1: M.esq, x2: L - M.dir, y1: y(min), y2: y(min), class: 'eixo' });
    el('line', { x1: M.esq, x2: L - M.dir, y1: y(max), y2: y(max), class: 'grade' });
    const rotMax = el('text', { x: L - M.dir, y: y(max) - 2, class: 'rot', 'text-anchor': 'end' });
    rotMax.textContent = g.formato(max);
    if (!g.zero) {
      const rotMin = el('text', { x: L - M.dir, y: y(min) - 2, class: 'rot', 'text-anchor': 'end' });
      rotMin.textContent = g.formato(min);
    }
    const rotDia = el('text', { x: M.esq, y: A - 4, class: 'rot' });
    rotDia.textContent = `dia ${d[0]!.dia + 1}`;
    const rotFim = el('text', { x: L - M.dir, y: A - 4, class: 'rot', 'text-anchor': 'end' });
    rotFim.textContent = `dia ${d[d.length - 1]!.dia + 1}`;
    for (const s of g.series) {
      const pts = d.map((r, i) => `${x(i).toFixed(1)},${y(s.valor(r)).toFixed(1)}`).join(' ');
      el('polyline', { points: pts, fill: 'none', stroke: s.cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    }

    // Cursor vertical + marcadores + dica ao passar o mouse.
    const cursor = el('line', { y1: M.topo, y2: A - M.base, class: 'cursor', visibility: 'hidden' });
    const marcas = g.series.map((s) => el('circle', { r: 4, fill: s.cor, class: 'marca', visibility: 'hidden' }));
    const dica = document.createElement('div');
    dica.className = 'dica';
    dica.hidden = true;
    const alvo = el('rect', { x: 0, y: 0, width: L, height: A, fill: 'transparent' });
    alvo.addEventListener('pointermove', (ev) => {
      const box = svg.getBoundingClientRect();
      const fx = ((ev.clientX - box.left) / box.width) * L;
      const i = Math.max(0, Math.min(d.length - 1, Math.round(((fx - M.esq) / (L - M.esq - M.dir)) * (d.length - 1))));
      const cx = x(i);
      cursor.setAttribute('x1', String(cx));
      cursor.setAttribute('x2', String(cx));
      cursor.setAttribute('visibility', 'visible');
      g.series.forEach((s, k) => {
        marcas[k]!.setAttribute('cx', String(cx));
        marcas[k]!.setAttribute('cy', String(y(s.valor(d[i]!))));
        marcas[k]!.setAttribute('visibility', 'visible');
      });
      dica.replaceChildren();
      const dia = document.createElement('div');
      dia.className = 'dia';
      dia.textContent = `Dia ${d[i]!.dia + 1}`;
      dica.append(dia);
      for (const s of g.series) {
        const linha = document.createElement('div');
        const v = document.createElement('b');
        v.textContent = g.formato(s.valor(d[i]!));
        linha.append(v, document.createTextNode(` ${s.nome}`));
        dica.append(linha);
      }
      dica.hidden = false;
      dica.style.left = `${(cx / L) * 100}%`;
    });
    alvo.addEventListener('pointerleave', () => {
      cursor.setAttribute('visibility', 'hidden');
      for (const m of marcas) m.setAttribute('visibility', 'hidden');
      dica.hidden = true;
    });
    const area = document.createElement('div');
    area.className = 'area-grafico';
    area.append(svg, dica);
    fig.append(area);
    return fig;
  }

  private tabelaHtml(): HTMLElement {
    const t = document.createElement('table');
    t.className = 'tabela';
    const cab = ['Dia', 'Caixa', 'Receitas', 'Despesas', 'População', 'Satisfação', 'Espera (min)', 'Desistências'];
    const thead = t.createTHead().insertRow();
    for (const c of cab) {
      const th = document.createElement('th');
      th.textContent = c;
      thead.append(th);
    }
    const corpo = t.createTBody();
    for (const r of [...this.dados].reverse()) {
      const tr = corpo.insertRow();
      for (const v of [
        String(r.dia + 1), dinheiro(r.caixa), dinheiro(r.receitas), dinheiro(r.despesas), inteiro(r.populacao),
        r.satisfacao.toFixed(0), r.espera.toFixed(0), inteiro(r.desistencias),
      ]) tr.insertCell().textContent = v;
    }
    const div = document.createElement('div');
    div.className = 'tabela-rolagem';
    div.append(t);
    return div;
  }
}
