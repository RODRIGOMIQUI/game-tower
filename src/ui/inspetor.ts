// Painel de inspeção (direita): detalhes da unidade ou poço selecionado.
import { MAX_CARROS, tipo } from '../sim/dados';
import type { ResumoPoco } from '../sim/jogo';
import { nomeAndar, type Unidade } from '../sim/mundo';
import type { ModoElevador } from '../sim/transito';
import { dinheiro, inteiro } from './formato';

export interface AcoesInspetor {
  carros(uid: number, delta: 1 | -1): void;
  modo(uid: number, modo: ModoElevador): void;
  fechar(): void;
}

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

  mostrar(u: Unidade | null, poco: ResumoPoco | undefined, semAcesso: boolean): void {
    if (!u) {
      this.raiz.hidden = true;
      this.uidAtual = 0;
      this.chave = '';
      return;
    }
    // Só reconstrói o DOM quando algo visível mudou (evita perder o foco do select).
    const chave = JSON.stringify([u.uid, poco && [poco.carros, poco.modo, Math.round(poco.esperaMedia), poco.aguardando, poco.atendidos], semAcesso]);
    if (chave === this.chave) return;
    this.chave = chave;
    this.uidAtual = u.uid;
    const t = tipo(u.tipo);
    const andares = u.altura > 1 ? `Andares ${nomeAndar(u.y)}–${nomeAndar(u.y + u.altura - 1)}` : `Andar ${nomeAndar(u.y)}`;

    const linhas: string[] = [];
    const linha = (k: string, v: string) => linhas.push(`<div class="kv"><span>${k}</span><b>${v}</b></div>`);
    linha('Local', andares);
    if (poco) {
      linha('Carros', `${poco.carros} / ${MAX_CARROS}`);
      linha('Capacidade', `${t.capacidade} pessoas/carro`);
      linha('Espera média', `${poco.esperaMedia.toFixed(0)} min`);
      linha('Aguardando agora', inteiro(poco.aguardando));
      linha('Viagens atendidas', inteiro(poco.atendidos));
    } else if (t.populacao) {
      linha(t.categoria === 'moradia' ? 'Moradores' : 'Funcionários', String(t.populacao));
    } else if (t.capacidade) {
      linha('Capacidade', String(t.capacidade));
    }

    this.raiz.innerHTML = `
      <div class="insp-topo"><h2>${t.nome}</h2><button class="botao fechar" title="Fechar (Esc)">✕</button></div>
      ${semAcesso ? '<div class="alerta-acesso">Sem acesso: não há rota a partir do lobby.</div>' : ''}
      ${linhas.join('')}
      ${poco ? `
        <div class="insp-acoes">
          <button class="botao acao" data-d="-1" ${poco.carros <= 1 ? 'disabled' : ''}>− Carro</button>
          <button class="botao acao" data-d="1" title="${dinheiro(t.custo_extra)}" ${poco.carros >= MAX_CARROS ? 'disabled' : ''}>+ Carro</button>
        </div>
        <label class="insp-modo">Despacho
          <select>${MODOS.map(([v, n]) => `<option value="${v}" ${v === poco.modo ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>` : ''}
      <p class="obs">${t.observacao}</p>`;

    this.raiz.querySelector<HTMLButtonElement>('.fechar')!.onclick = () => this.acoes.fechar();
    for (const b of this.raiz.querySelectorAll<HTMLButtonElement>('.acao')) {
      b.onclick = () => this.acoes.carros(this.uidAtual, Number(b.dataset.d) as 1 | -1);
    }
    const sel = this.raiz.querySelector<HTMLSelectElement>('select');
    if (sel) sel.onchange = () => this.acoes.modo(this.uidAtual, sel.value as ModoElevador);
    this.raiz.hidden = false;
  }
}
