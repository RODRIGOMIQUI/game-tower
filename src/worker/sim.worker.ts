// Roda a simulação fora do thread principal. Converte tempo real em ticks
// conforme a velocidade e publica o estado para o render.
import { Jogo } from '../sim/jogo';
import { TICKS_POR_SEGUNDO_1X, type Velocidade } from '../sim/relogio';
import type { DaSim, ParaSim } from './protocolo';

// Tipagem mínima do escopo do Worker (a lib "webworker" conflita com "dom" no mesmo tsconfig).
const escopo = self as unknown as {
  postMessage(msg: DaSim, transferir: Transferable[]): void;
  onmessage: ((e: MessageEvent<ParaSim>) => void) | null;
};

let jogo: Jogo | null = null;
let velocidade: Velocidade = 1;
let acumulado = 0;
let ultimo = performance.now();
let versaoEnviada = -1;
let tickEnviado = -1;
let dinheiroEnviado = NaN;
let inspecionado = 0;

function enviar(msg: DaSim, transferir: Transferable[] = []): void {
  escopo.postMessage(msg, transferir);
}

function publicar(forcar = false): void {
  if (!jogo) return;
  if (jogo.versaoMundo !== versaoEnviada) {
    versaoEnviada = jogo.versaoMundo;
    const mundo = jogo.snapshotMundo();
    enviar({ tipo: 'mundo', versao: versaoEnviada, mundo }, [mundo.estrutura.buffer, mundo.ocupacao.buffer]);
  }
  if (forcar || jogo.tick !== tickEnviado || jogo.dinheiro !== dinheiroEnviado) {
    tickEnviado = jogo.tick;
    dinheiroEnviado = jogo.dinheiro;
    enviar({
      tipo: 'estado',
      estado: {
        tick: jogo.tick,
        dinheiro: jogo.dinheiro,
        estrela: jogo.estrela,
        populacao: jogo.populacaoTotal(),
        velocidade,
        sandbox: jogo.sandbox,
        pessoas: jogo.populacao.estatisticas(),
        livro: jogo.livro,
        encerrado: jogo.encerrado,
      },
    });
    const pessoas = jogo.populacao.visiveis();
    const carros = jogo.carros();
    const unidades = jogo.inquilinos.resumo();
    const est = inspecionado ? (jogo.inquilinos.get(inspecionado) ?? null) : null;
    enviar(
      {
        tipo: 'dinamico',
        tick: jogo.tick,
        pessoas,
        carros,
        pocos: jogo.resumoPocos(),
        semAcesso: jogo.semAcesso,
        unidades,
        versaoUnidades: jogo.inquilinos.versao,
        inspecao: inspecionado
          ? {
              estado: est,
              expectativa: est ? jogo.inquilinos.expectativa(est) : 0,
              ocupantes: jogo.populacao.ocupantes(inspecionado).length,
              lotacao: jogo.populacao.lotacaoDe(inspecionado),
            }
          : null,
      },
      [pessoas.buffer, carros.buffer, unidades.buffer],
    );
  }
}

escopo.onmessage = (e) => {
  const msg = e.data;
  if (msg.tipo === 'iniciar') {
    jogo = new Jogo({ seed: msg.seed, sandbox: msg.sandbox });
    publicar(true);
  } else if (!jogo) {
    return;
  } else if (msg.tipo === 'comando') {
    enviar({ tipo: 'resultado', id: msg.id, resultado: jogo.comando(msg.cmd) });
    publicar(true);
  } else if (msg.tipo === 'inspecionar') {
    inspecionado = msg.uid;
    publicar(true);
  } else if (msg.tipo === 'velocidade') {
    velocidade = msg.v;
    publicar(true);
  }
};

const MAX_TICKS_POR_PASSO = 600; // evita espiral se a aba ficar em segundo plano

setInterval(() => {
  const agora = performance.now();
  const dt = (agora - ultimo) / 1000;
  ultimo = agora;
  if (!jogo) return;
  acumulado += dt * TICKS_POR_SEGUNDO_1X * velocidade;
  const n = Math.min(Math.floor(acumulado), MAX_TICKS_POR_PASSO);
  acumulado = n === MAX_TICKS_POR_PASSO ? 0 : acumulado - n;
  if (n > 0) {
    const eventos = jogo.avancar(n);
    if (eventos.length) enviar({ tipo: 'eventos', eventos });
  }
  publicar();
}, 50);
