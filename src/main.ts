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
import type { DaSim, EstadoResumo, ParaSim } from './worker/protocolo';

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

const hud = new Hud({
  velocidade: (v) => mudarVelocidade(v),
  ferramenta: (id) => escolherFerramenta(id),
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
      atualizarFantasma();
      break;
    case 'resultado': {
      const r = msg.resultado;
      if (!r.ok) hud.aviso(r.motivo ?? 'Não foi possível', 'erro');
      else {
        const verbo = r.acao === 'construir' ? 'Construído' : 'Demolido';
        const extra = r.motivo ? ` (parte falhou: ${r.motivo})` : '';
        hud.aviso(`${verbo}: ${r.feitos} · ${dinheiro(-r.custo)}${extra}`, r.motivo ? 'info' : 'ok');
      }
      break;
    }
    case 'eventos':
      for (const ev of msg.eventos) {
        if (ev.tipo === 'trimestre') {
          const d = data(ev.tick);
          hud.aviso(`Fechamento do trimestre · T${d.trimestre} ano ${d.ano} · manutenção ${dinheiro(-ev.manutencao)}`, 'info');
        }
      }
      break;
  }
};

const sandbox = new URLSearchParams(location.search).get('sandbox') === '1';
enviar({ tipo: 'iniciar', seed: Date.now() >>> 0, sandbox });

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
  const sobre: Unidade | null = hover && !ferramenta ? (mundo.unidadeEm(hover.x, hover.y) ?? null) : null;
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
  atualizarFantasma();
});

canvas.addEventListener('pointermove', (e) => {
  if (pan) {
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
    } else escolherFerramenta(null);
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
  Object.assign(window, { __gt: { app, cena, mundo: () => mundo, estado: () => estado } });
}
