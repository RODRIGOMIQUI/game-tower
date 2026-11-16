// Roda a simulação fora do thread principal. Converte tempo real em ticks
// conforme a velocidade e publica o estado para o render.
import { Jogo, type Save } from '../sim/jogo';
import { data } from '../sim/relogio';
import { comprimir, descomprimir, gravar, ler, listar } from './armazenamento';
import { guardarRecursosOffline } from '../offline';
import { TICKS_POR_SEGUNDO_1X, type Velocidade } from '../sim/relogio';
import type { DaSim, ParaSim } from './protocolo';

// Tipagem mínima do escopo do Worker (a lib "webworker" conflita com "dom" no mesmo tsconfig).
const escopo = self as unknown as {
  postMessage(msg: DaSim, transferir: Transferable[]): void;
  onmessage: ((e: MessageEvent<ParaSim>) => void) | null;
};

let jogo: Jogo | null = null;

// Versão publicada: guarda os arquivos do Worker para jogar offline.
if (import.meta.env.PROD) setTimeout(guardarRecursosOffline, 4000);
let velocidade: Velocidade = 1;
let acumulado = 0;
let ultimo = performance.now();
let versaoEnviada = -1;
let tickEnviado = -1;
let dinheiroEnviado = NaN;
let inspecionado = 0;
let pessoaInspecionada = 0;
/** Ticks simulados por segundo real (medido), para o painel de desempenho. */
let ticksPorSegundo = 0;
let ticksJanela = 0;
let inicioJanela = performance.now();

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
        progresso: jogo.progresso(),
        eventosLigados: jogo.eventos.ligado,
        podeDesfazer: jogo.podeDesfazer,
        contexto: jogo.contexto(),
        ticksPorSegundo,
        cenario: jogo.cenario
          ? {
              nome: jogo.cenario.nome,
              objetivo: jogo.cenario.objetivo,
              progresso: jogo.avaliarCenario().progresso,
              concluido: jogo.cenarioConcluido,
            }
          : null,
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
        focos: [...jogo.eventos.focos.keys()],
        festival: jogo.eventos.festival,
        ficha: pessoaInspecionada ? jogo.populacao.ficha(pessoaInspecionada) : null,
      },
      [pessoas.buffer, carros.buffer, unidades.buffer],
    );
  }
}

/** Troca o jogo atual (novo ou carregado) e força o reenvio de tudo. */
function trocarJogo(j: Jogo): void {
  jogo = j;
  versaoEnviada = -1;
  tickEnviado = -1;
  inspecionado = 0;
  pessoaInspecionada = 0;
  publicar(true);
}

async function salvarEm(slot: string): Promise<void> {
  if (!jogo) return;
  try {
    await gravar(slot, jogo.salvar());
    enviar({ tipo: 'salvo', slot, ok: true });
    enviar({ tipo: 'saves', lista: await listar() });
  } catch (err) {
    enviar({ tipo: 'salvo', slot, ok: false, erro: String(err) });
  }
}

function carregarDe(save: Save | null): void {
  try {
    if (!save) throw new Error('Nenhum jogo salvo neste espaço');
    trocarJogo(Jogo.carregar(save));
    enviar({ tipo: 'carregado', ok: true });
  } catch (err) {
    enviar({ tipo: 'carregado', ok: false, erro: err instanceof Error ? err.message : String(err) });
  }
}

escopo.onmessage = async (e) => {
  const msg = e.data;
  if (msg.tipo === 'iniciar') {
    trocarJogo(new Jogo({ seed: msg.novo.seed, sandbox: msg.novo.sandbox, cenario: msg.novo.cenario }));
    return;
  }
  if (msg.tipo === 'listarSaves') {
    enviar({ tipo: 'saves', lista: await listar().catch(() => []) });
    return;
  }
  if (msg.tipo === 'carregar') {
    carregarDe(await ler(msg.slot).catch(() => null));
    return;
  }
  if (msg.tipo === 'importar') {
    carregarDe(await descomprimir(msg.dados).catch(() => null));
    return;
  }
  if (!jogo) {
    return;
  } else if (msg.tipo === 'salvar') {
    await salvarEm(msg.slot);
  } else if (msg.tipo === 'exportar') {
    const dados = await comprimir(jogo.salvar());
    const d = data(jogo.tick);
    enviar({ tipo: 'exportado', dados, nome: `gametower-ano${d.ano}-T${d.trimestre}-dia${d.diaNoTri}.gametower` }, [dados]);
  } else if (msg.tipo === 'relatorio') {
    enviar({ tipo: 'relatorio', historico: jogo.historico });
  } else if (msg.tipo === 'comando') {
    enviar({ tipo: 'resultado', id: msg.id, resultado: jogo.comando(msg.cmd) });
    publicar(true);
  } else if (msg.tipo === 'inspecionar') {
    inspecionado = msg.uid;
    publicar(true);
  } else if (msg.tipo === 'depurar' && import.meta.env.DEV) {
    if (msg.acao === 'torreGrande') {
      // Torre de ~12 mil pessoas para medir desempenho (Fase 8).
      const { montarTorreGrande } = await import('../sim/torre-grande');
      montarTorreGrande(jogo);
    } else depurar(jogo, msg.acao);
    publicar(true);
  } else if (msg.tipo === 'inspecionarPessoa') {
    pessoaInspecionada = msg.id;
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
  ticksJanela += n;
  if (agora - inicioJanela >= 1000) {
    ticksPorSegundo = (ticksJanela * 1000) / (agora - inicioJanela);
    ticksJanela = 0;
    inicioJanela = agora;
  }
  if (n > 0) {
    const eventos = jogo.avancar(n);
    if (eventos.length) enviar({ tipo: 'eventos', eventos });
    // Salvamento automático a cada fechamento de trimestre.
    if (eventos.some((ev) => ev.tipo === 'trimestre') && !jogo.encerrado) void salvarEm('auto');
  }
  publicar();
}, 50);

/** Dispara eventos à força (só em desenvolvimento). */
function depurar(j: Jogo, acao: 'incendio' | 'pane' | 'festival'): void {
  const ctx = (j as unknown as { contextoEventos(): Parameters<Jogo['eventos']['iniciarIncendio']>[1] }).contextoEventos();
  if (acao === 'incendio') {
    const ev = j.eventos.iniciarIncendio(j.tick, ctx);
    if (ev) enviar({ tipo: 'eventos', eventos: [ev] });
  } else if (acao === 'pane') {
    const poco = [...j.transito.pocos.values()][0];
    const carro = poco?.carros[0];
    if (!poco || !carro) return;
    carro.pane = 120;
    (j.eventos as unknown as { panes: Map<number, number> }).panes.set(carro.id, poco.uid);
    enviar({ tipo: 'eventos', eventos: [{ tipo: 'pane', uid: poco.uid, andar: carro.pos }] });
  } else {
    j.eventos.festival = true;
    enviar({ tipo: 'eventos', eventos: [{ tipo: 'festival' }] });
  }
}
