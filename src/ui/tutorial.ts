// Tutorial guiado no começo da carreira. Ver docs/gdd.md §11.
// Cada passo avança sozinho quando o jogador faz o que foi pedido.
import { Est, type Mundo } from '../sim/mundo';
import { ehLobby } from '../sim/lobbies';
import type { EstadoResumo } from '../worker/protocolo';

interface Passo {
  texto: string;
  feito(m: Mundo, e: EstadoResumo): boolean;
}

const contar = (m: Mundo, tipo: string) => [...m.unidades.values()].filter((u) => u.tipo === tipo).length;

const PASSOS: Passo[] = [
  {
    texto: 'Comece pelo <b>lobby</b>: tecla <kbd>L</kbd> e arraste ao longo do chão. É por ele que as pessoas entram.',
    feito: (m) => {
      let n = 0;
      for (let x = 0; x < 360; x++) if (ehLobby(m.est(x, 0))) n++;
      return n >= 10;
    },
  },
  {
    texto: 'Agora o <b>piso</b> dos andares de cima: tecla <kbd>P</kbd> e arraste para cima a partir do andar 2.',
    feito: (m) => {
      for (let x = 0; x < 360; x++) if (m.est(x, 3) !== Est.Vazio) return true;
      return false;
    },
  },
  {
    texto: 'Sem elevador ninguém sobe. Tecla <kbd>V</kbd> e <b>arraste na vertical</b> do térreo até o último andar.',
    feito: (m) => contar(m, 'elevador_padrao') > 0,
  },
  {
    texto: 'Coloque alguns <b>escritórios</b> (tecla <kbd>O</kbd>) nos andares de cima. Eles pagam aluguel a cada trimestre.',
    feito: (m) => contar(m, 'escritorio') >= 3,
  },
  {
    texto: 'Os funcionários precisam almoçar: construa uma <b>lanchonete</b> (na paleta, em Comida e comércio).',
    feito: (m) => contar(m, 'lanchonete') > 0,
  },
  {
    texto: 'Acelere o tempo (tecla <kbd>3</kbd> ou <kbd>4</kbd>) e veja os inquilinos chegarem.',
    feito: (_m, e) => e.populacao >= 18,
  },
  {
    texto:
      'Pronto! Clique num escritório para ver satisfação e preço, num elevador para adicionar carros. <kbd>C</kbd> mostra camadas, <kbd>R</kbd> os relatórios, <kbd>?</kbd> os atalhos. Boa construção!',
    feito: () => false,
  },
];

const CHAVE = 'gametower:tutorial-feito';

export class Tutorial {
  private readonly raiz = document.getElementById('tutorial')!;
  private passo = 0;
  private ativo = false;

  /** Começa se o jogador ainda não fez (ou se `forcar`). */
  iniciar(forcar = false): void {
    let feito = false;
    try {
      feito = localStorage.getItem(CHAVE) === '1';
    } catch {
      // sem armazenamento: mostra mesmo assim
    }
    if (feito && !forcar) return;
    this.ativo = true;
    this.passo = 0;
    this.render();
  }

  parar(): void {
    this.ativo = false;
    this.raiz.hidden = true;
    try {
      localStorage.setItem(CHAVE, '1');
    } catch {
      // ignora
    }
  }

  atualizar(m: Mundo, e: EstadoResumo): void {
    if (!this.ativo) return;
    let mudou = false;
    while (this.passo < PASSOS.length - 1 && PASSOS[this.passo]!.feito(m, e)) {
      this.passo++;
      mudou = true;
    }
    if (mudou) this.render();
  }

  private render(): void {
    const p = PASSOS[this.passo]!;
    const ultimo = this.passo === PASSOS.length - 1;
    this.raiz.className = 'painel';
    this.raiz.innerHTML = `
      <div class="tut-passo">Tutorial · ${this.passo + 1}/${PASSOS.length}</div>
      <p>${p.texto}</p>
      <button class="botao">${ultimo ? 'Começar a jogar' : 'Pular tutorial'}</button>`;
    this.raiz.querySelector('button')!.onclick = () => this.parar();
    this.raiz.hidden = false;
  }
}
