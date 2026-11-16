// Ponto de entrada: liga Worker da simulação, render (PixiJS) e HUD (DOM).
import './ui/estilos.css';
import { Application } from 'pixi.js';
import { Cena } from './render/cena';
import { planejarConstrucao, planejarDemolicao, type Plano } from './sim/construcao';
import { tipo } from './sim/dados';
import { Mundo, nomeAndar, type Unidade } from './sim/mundo';
import { data, type Velocidade } from './sim/relogio';
import type { Celula } from './render/camera';
import { dinheiro } from './ui/formato';
import { ATALHOS, DEMOLIR, Hud } from './ui/hud';
import { Inspetor } from './ui/inspetor';
import type { DaSim, Dinamico, EstadoResumo, ParaSim } from './worker/protocolo';
import type { EventoProgressao } from './sim/progressao';
import type { EventoEspecial } from './sim/eventos';

const app = new Application();
const raiz = document.getElementById('jogo')!;
await app.init({ resizeTo: raiz, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2) });
raiz.appendChild(app.canvas);

app.resize(); // garante o tamanho final do contêiner antes de posicionar a câmera
const cena = new Cena(app);
const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const enviar = (msg: ParaSim) => worker.postMessage(msg);

// ------------------------------------------------------------------ estado local
let mundo = new Mundo();
let estado: EstadoResumo | null = null;
let ferramenta: string | null = null;
let arrasto: { inicio: Celula; fim: Celula } | null = null;
let pan: { x: number; y: number } | null = null;
let hover: Celula | null = null;
let ultimaVelocidade: Velocidade = 1;
let proximoId = 1;
let selecionado = 0;
let pessoaSelecionada = 0;
let seguindo = false;
let dinamico: Dinamico | null = null;
let clique: { x: number; y: number } | null = null;

const hud = new Hud({
  velocidade: (v) => mudarVelocidade(v),
  ferramenta: (id) => escolherFerramenta(id),
  eventos: (ligado) => enviar({ tipo: 'comando', id: proximoId++, cmd: { tipo: 'eventos', ligado } }),
});

const inspetor = new Inspetor({
  carros: (uid, delta) => enviar({ tipo: 'comando', id: proximoId++, cmd: { tipo: 'carros', uid, delta } }),
  modo: (uid, modo) => enviar({ tipo: 'comando', id: proximoId++, cmd: { tipo: 'modo', uid, modo } }),
  preco: (uid, nivel) => enviar({ tipo: 'comando', id: proximoId++, cmd: { tipo: 'preco', uid, nivel } }),
  seguir: () => {
    seguindo = !seguindo;
    atualizarInspetor();
  },
  fechar: () => selecionar(0),
});

function selecionar(uid: number): void {
  selecionado = uid;
  pessoaSelecionada = 0;
  seguindo = false;
  enviar({ tipo: 'inspecionarPessoa', id: 0 });
  enviar({ tipo: 'inspecionar', uid });
  atualizarInspetor();
  atualizarFantasma();
}

function selecionarPessoa(id: number): void {
  selecionado = 0;
  pessoaSelecionada = id;
  seguindo = false;
  enviar({ tipo: 'inspecionar', uid: 0 });
  enviar({ tipo: 'inspecionarPessoa', id });
  atualizarFantasma();
}

function atualizarInspetor(): void {
  if (pessoaSelecionada) {
    if (dinamico?.ficha?.id === pessoaSelecionada || dinamico?.ficha === null) inspetor.mostrarPessoa(dinamico.ficha, seguindo);
    return;
  }
  const u = selecionado ? mundo.unidades.get(selecionado) ?? null : null;
  if (!u) selecionado = 0;
  inspetor.mostrar(
    u,
    dinamico?.pocos.find((p) => p.uid === selecionado),
    !!dinamico?.semAcesso.includes(selecionado),
    dinamico?.inspecao ?? null,
  );
}

app.ticker.add(() => {
  const agora = performance.now();
  cena.desenharDinamica(agora, mundo);
  cena.desenharFogos(agora, !!dinamico?.festival && data(estado?.tick ?? 0).hora >= 18);
  if (seguindo && pessoaSelecionada) {
    const p = cena.posicaoPessoa(pessoaSelecionada, agora) ?? dinamico?.ficha?.posicao;
    if (p) cena.centralizarEm(p.x, p.y);
  }
});

// ----------------------------------------------------------------- simulação
worker.onmessage = (e: MessageEvent<DaSim>) => {
  const msg = e.data;
  switch (msg.tipo) {
    case 'estado':
      estado = msg.estado;
      hud.atualizar(estado);
      cena.atualizarCeu(data(estado.tick).minutoDoDia);
      break;
    case 'mundo':
      mundo = new Mundo(msg.mundo);
      cena.desenharMundo(mundo);
      atualizarInspetor();
      atualizarFantasma();
      break;
    case 'dinamico':
      dinamico = msg;
      cena.receberDinamica(msg, performance.now());
      cena.desenharAlertas(mundo, msg.semAcesso);
      cena.atualizarSituacoes(msg.unidades, msg.versaoUnidades);
      if (selecionado || pessoaSelecionada) atualizarInspetor();
      break;
    case 'resultado': {
      const r = msg.resultado;
      if (!r.ok) hud.aviso(r.motivo ?? 'Não foi possível', 'erro');
      else {
        if (r.acao === 'preco') break;
        const verbo = r.acao === 'construir' ? 'Construído' : r.acao === 'demolir' ? 'Demolido' : 'Elevador atualizado';
        const extra = r.motivo ? ` (parte falhou: ${r.motivo})` : '';
        hud.aviso(`${verbo}: ${r.feitos} · ${dinheiro(-r.custo)}${extra}`, r.motivo ? 'info' : 'ok');
      }
      break;
    }
    case 'eventos':
      for (const ev of msg.eventos) {
        if (ev.tipo === 'trimestre') {
          // O fechamento acontece à 00:00 do 1º dia do trimestre seguinte.
          const d = data(ev.tick - 1);
          const r = ev.livro.receitas;
          const receitas = r.aluguel + r.vendas + r.hotel + r.comida;
          const saidas = ev.saidas ? ` · ${ev.saidas} inquilino(s) saíram` : '';
          hud.aviso(
            `Fechamento T${d.trimestre}/ano ${d.ano}: receitas ${dinheiro(receitas)} · manutenção ${dinheiro(-ev.manutencao)} · construção ${dinheiro(-ev.livro.construcao)}${saidas}`,
            ev.caixa < 0 ? 'erro' : 'info',
          );
          if (ev.caixa < 0) hud.aviso('Caixa negativo! Dois trimestres seguidos assim e a torre vai à falência.', 'erro');
        } else if (ev.tipo === 'falencia') {
          document.getElementById('fim')!.hidden = false;
        } else if (ehProgressao(ev)) avisarProgressao(ev);
        else avisarEvento(ev);
      }
      break;
  }
};

const sandbox = new URLSearchParams(location.search).get('sandbox') === '1';
document.getElementById('novo-jogo')!.onclick = () => location.reload();
enviar({ tipo: 'iniciar', seed: Date.now() >>> 0, sandbox });

function ehProgressao(ev: EventoProgressao | EventoEspecial): ev is EventoProgressao {
  return ['estrela', 'inspecao_agendada', 'inspecao', 'inauguracao_agendada', 'inauguracao'].includes(ev.tipo);
}

/** Aviso que leva a câmera até a unidade quando clicado. */
function irAte(uid: number): (() => void) | undefined {
  return () => {
    const u = mundo.unidades.get(uid);
    if (u) cena.centralizarEm(u.x + u.largura / 2, u.y);
  };
}

function avisarEvento(ev: EventoEspecial): void {
  switch (ev.tipo) {
    case 'incendio':
      hud.aviso(
        `INCÊNDIO no andar ${nomeAndar(ev.andar)}! ${ev.brigada ? 'A brigada da segurança está a caminho.' : 'Sem brigada: bombeiros de fora chegam em 1h e vão cobrar caro.'}`,
        'perigo',
        9000,
        irAte(ev.uid),
      );
      break;
    case 'incendio_fim':
      hud.aviso(
        `Incêndio apagado: ${ev.danificadas} unidade(s) danificada(s), custo ${dinheiro(-ev.custo)}${ev.bombeiros ? ' (com bombeiros de fora)' : ''}.`,
        'info',
        7000,
      );
      break;
    case 'pane':
      hud.aviso(`Pane num elevador (andar ${nomeAndar(ev.andar)}): carro parado com gente dentro.`, 'erro', 6000, irAte(ev.uid));
      break;
    case 'pane_fim':
      hud.aviso('Elevador consertado.', 'ok');
      break;
    case 'pragas':
      hud.aviso(`Pragas em ${ev.uids.length} quarto(s) de hotel! Só a limpeza resolve.`, 'erro', 6000, irAte(ev.uids[0]!));
      break;
    case 'vip_chegou':
      hud.aviso('Um hóspede VIP reservou uma suíte. Capriche nos elevadores!', 'conquista', 7000, irAte(ev.uid));
      break;
    case 'vip':
      hud.aviso(
        ev.boa
          ? 'O VIP adorou a estadia: a reputação da torre subiu por alguns dias.'
          : `O VIP saiu irritado (estresse ${Math.round(ev.estresse)}): a reputação caiu por alguns dias.`,
        ev.boa ? 'conquista' : 'erro',
        7000,
      );
      break;
    case 'achado':
      hud.aviso(`Achado arqueológico no subsolo! A torre recebeu ${dinheiro(ev.valor)}.`, 'conquista', 8000, () =>
        cena.centralizarEm(ev.x, ev.y),
      );
      break;
    case 'festival':
      hud.aviso('Festival de ano novo! Muitos visitantes esta noite.', 'conquista', 8000);
      break;
  }
}

function avisarProgressao(ev: EventoProgressao): void {
  switch (ev.tipo) {
    case 'estrela':
      if (ev.nivel >= 6) hud.aviso('A torre é LENDÁRIA! Fim da campanha; continue construindo à vontade.', 'conquista', 10000);
      else {
        const lib = ev.desbloqueios.length ? ` Liberado: ${ev.desbloqueios.join(', ')}.` : '';
        hud.aviso(`A torre chegou a ${ev.nivel} estrelas!${lib}`, 'conquista', 8000);
      }
      break;
    case 'inspecao_agendada':
      hud.aviso('O inspetor visita a torre hoje às 10h. Mantenha os elevadores rápidos!', 'info', 6000);
      break;
    case 'inspecao':
      hud.aviso(
        ev.aprovada
          ? `Inspeção aprovada (estresse do inspetor ${Math.round(ev.estresse)}).`
          : `Inspeção reprovada (estresse ${Math.round(ev.estresse)}). Nova visita em um trimestre.`,
        ev.aprovada ? 'ok' : 'erro',
        6000,
      );
      break;
    case 'inauguracao_agendada':
      hud.aviso('Inauguração da Coroa hoje às 18h: 150 convidados vão subir até o topo.', 'info', 6000);
      break;
    case 'inauguracao':
      hud.aviso(
        ev.sucesso
          ? `Inauguração um sucesso: ${ev.presentes} de ${ev.convidados} convidados chegaram.`
          : `Inauguração fracassou: só ${ev.presentes} de ${ev.convidados} chegaram bem. Nova tentativa em um trimestre.`,
        ev.sucesso ? 'ok' : 'erro',
        6000,
      );
      break;
  }
}

function mudarVelocidade(v: Velocidade): void {
  if (v !== 0) ultimaVelocidade = v;
  enviar({ tipo: 'velocidade', v });
}

// ------------------------------------------------------------------ ferramentas
function escolherFerramenta(id: string | null): void {
  ferramenta = id;
  arrasto = null;
  hud.marcarFerramenta(id);
  cena.mostrarGrade(id !== null);
  app.canvas.style.cursor = id ? 'crosshair' : 'default';
  atualizarFantasma();
}

function planoAtual(): Plano | null {
  if (!ferramenta || !estado) return null;
  const a = arrasto?.inicio ?? hover;
  const b = arrasto?.fim ?? hover;
  if (!a || !b) return null;
  if (ferramenta === DEMOLIR) return planejarDemolicao(mundo, a.x, a.y, b.x, b.y);
  return planejarConstrucao(mundo, ferramenta, a.x, a.y, b.x, b.y, {
    dinheiro: estado.dinheiro,
    estrela: estado.estrela,
    ignorarEstrela: estado.sandbox,
  });
}

function atualizarFantasma(): void {
  const plano = planoAtual();
  const sobre: Unidade | null =
    (selecionado ? mundo.unidades.get(selecionado) : undefined) ??
    (hover && !ferramenta ? (mundo.unidadeEm(hover.x, hover.y) ?? null) : null);
  cena.desenharFantasma(plano, hover, sobre);

  // Status: onde está o cursor + resumo do plano
  let local = '';
  if (hover) {
    const u = mundo.unidadeEm(hover.x, hover.y);
    local = `Andar ${nomeAndar(hover.y)} · col ${hover.x + 1}${u ? ` · ${tipo(u.tipo).nome}` : ''}`;
  }
  if (!plano) return hud.status(local, '');
  if (plano.validos === 0) return hud.status(local, plano.motivo ?? '', plano.motivo ? 'erro' : '');
  const nome = ferramenta === DEMOLIR ? 'Demolir' : tipo(ferramenta!).nome;
  const falha = plano.motivo ? ` · ${plano.itens.length - plano.validos} inválido(s): ${plano.motivo}` : '';
  hud.status(local, `${nome} × ${plano.validos} · ${dinheiro(-plano.custoTotal)}${falha}`, plano.motivo ? 'erro' : 'ok');
}

// -------------------------------------------------------------------- entrada
const canvas = app.canvas;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // ponteiro sintético/inativo: segue sem captura
  }
  const c = cena.celulaEm(e.offsetX, e.offsetY);
  if (e.button === 0 && ferramenta) arrasto = { inicio: c, fim: c };
  else pan = { x: e.offsetX, y: e.offsetY };
  clique = e.button === 0 && !ferramenta ? { x: e.offsetX, y: e.offsetY } : null;
  atualizarFantasma();
});

canvas.addEventListener('pointermove', (e) => {
  if (pan) {
    if (Math.hypot(e.offsetX - pan.x, e.offsetY - pan.y) > 2) seguindo = false;
    cena.camera.mover(e.offsetX - pan.x, e.offsetY - pan.y);
    cena.aplicarCamera();
    pan = { x: e.offsetX, y: e.offsetY };
  }
  const c = cena.celulaEm(e.offsetX, e.offsetY);
  if (hover && c.x === hover.x && c.y === hover.y && !pan) return;
  hover = c;
  if (arrasto) arrasto.fim = c;
  atualizarFantasma();
});

canvas.addEventListener('pointerup', (e) => {
  if (arrasto && e.button === 0 && ferramenta) {
    const { inicio: a, fim: b } = arrasto;
    const cmd =
      ferramenta === DEMOLIR
        ? ({ tipo: 'demolir', x0: a.x, y0: a.y, x1: b.x, y1: b.y } as const)
        : ({ tipo: 'construir', item: ferramenta, x0: a.x, y0: a.y, x1: b.x, y1: b.y } as const);
    enviar({ tipo: 'comando', id: proximoId++, cmd });
  }
  // Clique sem ferramenta (sem arrastar): seleciona a pessoa ou a unidade sob o cursor.
  if (clique && Math.hypot(e.offsetX - clique.x, e.offsetY - clique.y) < 4) {
    const pessoa = cena.pessoaEm(e.offsetX, e.offsetY);
    if (pessoa) selecionarPessoa(pessoa);
    else {
      const c = cena.celulaEm(e.offsetX, e.offsetY);
      selecionar(mundo.uidEm(c.x, c.y));
    }
  }
  clique = null;
  arrasto = null;
  pan = null;
  atualizarFantasma();
});

canvas.addEventListener('pointerleave', () => {
  if (arrasto || pan) return;
  hover = null;
  atualizarFantasma();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cena.camera.zoom(e.deltaY < 0 ? 1 : -1, e.offsetX, e.offsetY);
    cena.aplicarCamera();
    hover = cena.celulaEm(e.offsetX, e.offsetY);
    atualizarFantasma();
  },
  { passive: false },
);

const PASSO_TECLA = 80;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  const mover = (dx: number, dy: number) => {
    cena.camera.mover(dx, dy);
    cena.aplicarCamera();
  };
  if (k === ' ') {
    e.preventDefault();
    mudarVelocidade(estado?.velocidade === 0 ? ultimaVelocidade : 0);
  } else if (k === 'escape') {
    if (arrasto) {
      arrasto = null;
      atualizarFantasma();
    } else if (selecionado || pessoaSelecionada) selecionar(0);
    else escolherFerramenta(null);
  } else if (['1', '2', '3', '4'].includes(k)) mudarVelocidade(([1, 2, 4, 8] as const)[Number(k) - 1]!);
  else if (k === 'arrowleft') mover(PASSO_TECLA, 0);
  else if (k === 'arrowright') mover(-PASSO_TECLA, 0);
  else if (k === 'arrowup') mover(0, PASSO_TECLA);
  else if (k === 'arrowdown') mover(0, -PASSO_TECLA);
  else if (k === '+' || k === '=') {
    cena.camera.zoom(1, cena.larguraTela / 2, cena.alturaTela / 2);
    cena.aplicarCamera();
  } else if (k === '-') {
    cena.camera.zoom(-1, cena.larguraTela / 2, cena.alturaTela / 2);
    cena.aplicarCamera();
  } else if (ATALHOS[k]) escolherFerramenta(ferramenta === ATALHOS[k] ? null : ATALHOS[k]!);
});

// Depuração em desenvolvimento: inspecionar pelo console do navegador.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __gt: { app, cena, mundo: () => mundo, estado: () => estado, dinamico: () => dinamico, enviar },
  });
}
