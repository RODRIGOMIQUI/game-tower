// Planejamento e execução de construção/demolição. Ver docs/gdd.md §3.
// As mesmas funções rodam na simulação (autoritativa) e no thread principal
// (pré-visualização), garantindo que a prévia mostre exatamente o que vai acontecer.

import { disponivelNaFase, ehElevador, ehEstrutura, tipo, type TipoUnidade } from './dados';
import {
  ANDAR_MAX,
  dentro,
  Est,
  ESTRUTURA_POR_TIPO,
  idx,
  type CodigoEstrutura,
  type Mundo,
} from './mundo';
import { efeitosLobby, ehLobby, ehLobbyDuplo, ehMezanino, LOBBY_MIN_COLUNAS } from './lobbies';

export interface Contexto {
  dinheiro: number;
  estrela: number;
  /** Modo sandbox: ignora requisito de estrela. */
  ignorarEstrela?: boolean;
  /** Cenário: colunas permitidas. */
  lote?: [number, number];
  /** Cenário: quantos poços de elevador ainda podem ser construídos. */
  pocosRestantes?: number;
}

export interface ItemPlano {
  tipo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** true = célula de estrutura; false = unidade. */
  estrutura: boolean;
  /** Positivo = gasto; negativo = reembolso. */
  custo: number;
  ok: boolean;
  motivo?: string;
  /** Demolição de unidade. */
  uid?: number;
  /** Estrutura que havia na célula antes de construir (o desfazer a restaura). */
  anterior?: number;
}

export interface Plano {
  acao: 'construir' | 'demolir';
  itens: ItemPlano[];
  /** Soma do custo dos itens válidos. */
  custoTotal: number;
  validos: number;
  /** Primeiro motivo de falha, para exibir ao jogador. */
  motivo?: string;
}

/** Fração do custo devolvida ao demolir uma unidade vazia. */
export const REEMBOLSO_UNIDADE = 0.25;

function fecharPlano(acao: Plano['acao'], itens: ItemPlano[], motivo?: string): Plano {
  let custoTotal = 0;
  let validos = 0;
  for (const it of itens) {
    if (it.ok) {
      custoTotal += it.custo;
      validos++;
    } else motivo ??= it.motivo;
  }
  return { acao, itens, custoTotal, validos, motivo };
}

function intervalo(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** Planeja construir `tipoId` no retângulo arrastado de (x0,y0) a (x1,y1). */
export function planejarConstrucao(
  m: Mundo,
  tipoId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ctx: Contexto,
): Plano {
  const t = tipo(tipoId);
  if (!disponivelNaFase(tipoId)) return fecharPlano('construir', [], 'Ainda não disponível');
  if (t.estrela > ctx.estrela && !ctx.ignorarEstrela) {
    return fecharPlano('construir', [], `Requer ${t.estrela}★`);
  }
  if (ehElevador(tipoId) && ctx.pocosRestantes !== undefined && ctx.pocosRestantes <= 0) {
    return fecharPlano('construir', [], 'Limite de poços do cenário');
  }
  if (tipoId === 'coroa' && !ctx.ignorarEstrela && !efeitosLobby(m).grand) {
    return fecharPlano('construir', [], `Requer um Grand lobby de ${LOBBY_MIN_COLUNAS} colunas no térreo`);
  }
  const plano = ehEstrutura(tipoId)
    ? planejarEstrutura(m, t, x0, y0, x1, y1, ctx)
    : ehElevador(tipoId)
      ? planejarElevador(m, t, x0, y0, y1, ctx)
      : planejarUnidades(m, t, x0, y0, x1, y1, ctx);
  return ctx.lote ? restringirAoLote(plano, ctx.lote) : plano;
}

/** Cenários com terreno menor: itens fora das colunas permitidas ficam inválidos. */
function restringirAoLote(p: Plano, [a, b]: [number, number]): Plano {
  for (const it of p.itens) {
    if (it.ok && (it.x < a || it.x + it.largura - 1 > b)) {
      it.ok = false;
      it.motivo = 'Fora do lote';
    }
  }
  return fecharPlano(p.acao, p.itens);
}

/**
 * Poço de elevador: arrasta-se na vertical para definir os andares atendidos.
 * Custa o poço + 1 carro. Ver docs/gdd.md §6.
 */
function planejarElevador(m: Mundo, t: TipoUnidade, x: number, y0: number, y1: number, ctx: Contexto): Plano {
  const [ya, yb] = intervalo(y0, y1);
  const altura = yb - ya + 1;
  const custo = t.custo + t.custo_extra;
  const item: ItemPlano = {
    tipo: t.id, x, y: ya, largura: t.largura_col, altura, estrutura: false, custo, ok: true,
  };
  if (altura < 2) item.motivo = 'Arraste na vertical para definir os andares';
  else if (altura > t.altura_andares) item.motivo = `Alcance máximo: ${t.altura_andares} andares`;
  else item.motivo = validarCelulasLivres(m, x, ya, t.largura_col, altura, true);
  if (!item.motivo && custo > ctx.dinheiro) item.motivo = 'Dinheiro insuficiente';
  item.ok = !item.motivo;
  return fecharPlano('construir', [item]);
}

/**
 * Verifica terreno, piso e espaço livre num retângulo. `aceitaLobby` vale para
 * transporte; 'mezanino' aceita só o 1º andar do átrio (comida e lojas).
 */
function validarCelulasLivres(
  m: Mundo,
  x: number,
  y: number,
  largura: number,
  altura: number,
  aceitaLobby: boolean | 'mezanino',
): string | undefined {
  const topo = y + altura - 1;
  if (!dentro(x, y) || !dentro(x + largura - 1, topo)) return 'Fora do terreno';
  for (let yy = y; yy <= topo; yy++) {
    for (let xx = x; xx < x + largura; xx++) {
      const e = m.est(xx, yy);
      if (e === Est.Vazio) return 'Precisa de piso';
      if (ehLobby(e) && aceitaLobby !== true && !(aceitaLobby === 'mezanino' && ehMezanino(m, xx, yy))) {
        return 'Não pode ficar no lobby';
      }
      if (m.uidEm(xx, yy)) return 'Espaço ocupado';
    }
  }
  return undefined;
}

function planejarEstrutura(
  m: Mundo,
  t: TipoUnidade,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ctx: Contexto,
): Plano {
  const codigo = ESTRUTURA_POR_TIPO[t.id]!;
  const [xa, xb] = intervalo(x0, x1);
  const [ya, yb] = intervalo(y0, y1);
  if (ehLobbyDuplo(codigo)) return planejarLobbyDuplo(m, t, codigo, xa, xb, ya, yb, ctx);
  // Do chão para fora: acima sobe, subsolo desce. Assim cada célula pode se
  // apoiar em outra planejada antes dela.
  const ys: number[] = [];
  for (let y = ya; y <= yb; y++) ys.push(y);
  ys.sort((a, b) => distanciaDoChao(a) - distanciaDoChao(b));

  const planejadas = new Set<number>();
  const temEstrutura = (x: number, y: number) =>
    m.est(x, y) !== Est.Vazio || planejadas.has(idx(x, y));

  const itens: ItemPlano[] = [];
  let gasto = 0;
  for (const y of ys) {
    for (let x = xa; x <= xb; x++) {
      if (!dentro(x, y)) continue;
      const atual = m.est(x, y);
      if (atual === codigo) continue; // já existe: ignora sem erro
      const motivo = validarCelula(m, t.id, codigo, x, y, atual, temEstrutura);
      const item: ItemPlano = {
        tipo: t.id, x, y, largura: 1, altura: 1, estrutura: true, custo: t.custo, ok: !motivo, motivo, anterior: atual,
      };
      if (item.ok && gasto + t.custo > ctx.dinheiro) {
        item.ok = false;
        item.motivo = 'Dinheiro insuficiente';
      }
      if (item.ok) {
        gasto += t.custo;
        planejadas.add(idx(x, y));
      }
      itens.push(item);
      // Lobby simples no lugar de átrio/grand: o 1º andar volta a ser piso.
      if (item.ok && y === 0 && ehLobbyDuplo(atual)) {
        itens.push({ tipo: 'piso', x, y: 1, largura: 1, altura: 1, estrutura: true, custo: 0, ok: true, anterior: m.est(x, 1) });
      }
    }
  }
  return fecharPlano('construir', itens);
}

/**
 * Átrio e grand lobby: cada coluna leva a célula do térreo e a do 1º andar.
 * O custo fica na célula do térreo.
 */
function planejarLobbyDuplo(
  m: Mundo,
  t: TipoUnidade,
  codigo: CodigoEstrutura,
  xa: number,
  xb: number,
  ya: number,
  yb: number,
  ctx: Contexto,
): Plano {
  if (ya > 0 || yb < 0) return fecharPlano('construir', [], `${t.nome} só no térreo`);
  const itens: ItemPlano[] = [];
  let gasto = 0;
  for (let x = xa; x <= xb; x++) {
    if (!dentro(x, 0)) continue;
    const baixo = m.est(x, 0);
    const cima = m.est(x, 1);
    if (baixo === codigo && cima === codigo) continue;
    let motivo: string | undefined;
    if (baixo !== Est.Vazio && baixo !== Est.Piso && !ehLobby(baixo)) motivo = 'Já construído';
    else if (cima !== Est.Vazio && cima !== Est.Piso && !ehLobbyDuplo(cima)) motivo = 'Já construído no 1º andar';
    else {
      for (const y of [0, 1]) {
        const u = m.unidadeEm(x, y);
        if (!u) continue;
        const cat = tipo(u.tipo).categoria;
        const mezanino = y === 1 && codigo === Est.Atrio && (cat === 'comida' || cat === 'comercio');
        if (cat !== 'transito' && !mezanino) motivo = y === 0 ? 'Espaço ocupado' : 'Libere o 1º andar antes';
      }
    }
    if (!motivo && gasto + t.custo > ctx.dinheiro) motivo = 'Dinheiro insuficiente';
    if (!motivo) gasto += t.custo;
    const ok = !motivo;
    itens.push(
      { tipo: t.id, x, y: 0, largura: 1, altura: 1, estrutura: true, custo: t.custo, ok, motivo, anterior: baixo },
      { tipo: t.id, x, y: 1, largura: 1, altura: 1, estrutura: true, custo: 0, ok, motivo, anterior: cima },
    );
  }
  return fecharPlano('construir', itens);
}

function distanciaDoChao(y: number): number {
  return y >= 0 ? y : -y - 0.5;
}

/** Primeiro andar (y) onde cabe um sky lobby: o 15º. */
export const ANDAR_MIN_SKY_LOBBY = 14;

function validarCelula(
  m: Mundo,
  id: string,
  codigo: CodigoEstrutura,
  x: number,
  y: number,
  atual: number,
  temEstrutura: (x: number, y: number) => boolean,
): string | undefined {
  switch (codigo) {
    case Est.Piso:
      if (y < 0) return 'Piso só acima do solo (use Escavação)';
      if (atual !== Est.Vazio) return 'Já construído';
      if (y > 0 && !temEstrutura(x, y - 1)) return 'Sem apoio no andar de baixo';
      return undefined;
    case Est.Lobby:
    case Est.LobbyCorp:
      if (id === 'sky_lobby') {
        if (y < ANDAR_MIN_SKY_LOBBY) return 'Sky lobby só a partir do 15º andar';
        if (atual === Est.Vazio && !temEstrutura(x, y - 1)) return 'Sem apoio no andar de baixo';
        if (atual !== Est.Vazio && atual !== Est.Piso) return 'Já construído';
      } else if (y !== 0) return 'Lobby só no térreo';
      // No térreo, uma variante de lobby pode trocar outra.
      else if (atual !== Est.Vazio && atual !== Est.Piso && !ehLobby(atual)) return 'Já construído';
      // Elevadores e escadas podem ficar sobre lobby; outras unidades não.
      if (m.uidEm(x, y) && tipo(m.unidadeEm(x, y)!.tipo).categoria !== 'transito') return 'Espaço ocupado';
      return undefined;
    case Est.Escavado:
      if (y >= 0) return 'Escavação só no subsolo';
      if (atual !== Est.Vazio) return 'Já escavado';
      if (y < -1 && !temEstrutura(x, y + 1)) return 'Escave o andar de cima primeiro';
      return undefined;
    default:
      return 'Estrutura desconhecida';
  }
}

function planejarUnidades(
  m: Mundo,
  t: TipoUnidade,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ctx: Contexto,
): Plano {
  const l = t.largura_col;
  const a = t.altura_andares;
  // Clique: a unidade começa na célula do cursor (canto inferior esquerdo).
  // Arrasto: repete lado a lado (e em pilha) na direção do arrasto, sem passar
  // do ponto final.
  const xs = repeticoes(x0, x1, l);
  const ys = repeticoes(y0, y1, a);

  const itens: ItemPlano[] = [];
  let gasto = 0;
  for (const y of ys) {
    for (const x of xs) {
      const motivo = validarUnidade(m, t, x, y);
      const item: ItemPlano = {
        tipo: t.id, x, y, largura: l, altura: a, estrutura: false, custo: t.custo, ok: !motivo, motivo,
      };
      if (item.ok && gasto + t.custo > ctx.dinheiro) {
        item.ok = false;
        item.motivo = 'Dinheiro insuficiente';
      }
      if (item.ok) gasto += t.custo;
      itens.push(item);
    }
  }
  return fecharPlano('construir', itens);
}

/** Posições de início de unidades de tamanho `passo` cobrindo de `inicio` em direção a `fim`. */
function repeticoes(inicio: number, fim: number, passo: number): number[] {
  const r = [inicio];
  if (fim >= inicio) for (let p = inicio + passo; p + passo - 1 <= fim; p += passo) r.push(p);
  else for (let p = inicio - passo; p >= fim; p -= passo) r.push(p);
  return r;
}

function validarUnidade(m: Mundo, t: TipoUnidade, x: number, y: number): string | undefined {
  const l = t.largura_col;
  const a = t.altura_andares;
  const topo = y + a - 1;
  if (!dentro(x, y) || !dentro(x + l - 1, topo)) return 'Fora do terreno';
  switch (t.onde) {
    case 'acima':
      if (y < 0) return 'Só acima do solo';
      break;
    case 'subsolo':
      if (topo >= 0) return 'Só no subsolo';
      break;
    case 'terreo':
      if (y !== 0) return 'Só no térreo';
      break;
    case 'topo':
      if (topo !== ANDAR_MAX) return 'Só no topo da torre';
      break;
    case 'qualquer':
      break;
  }
  const transito = t.categoria === 'transito';
  const consumo = t.categoria === 'comida' || t.categoria === 'comercio';
  const motivo = validarCelulasLivres(m, x, y, l, a, transito || (consumo ? 'mezanino' : false));
  if (motivo) return motivo;
  // Escadas ligam o andar y ao y+1: precisa haver piso em cima.
  if (transito) {
    if (topo + 1 > ANDAR_MAX) return 'Sem andar acima';
    for (let xx = x; xx < x + l; xx++) if (m.est(xx, topo + 1) === Est.Vazio) return 'Precisa de piso no andar de cima';
  }
  return undefined;
}

/**
 * Planeja demolir o retângulo. Se houver unidades nele, só as unidades são
 * demolidas; senão, a estrutura. Assim um clique remove uma coisa por vez.
 */
/**
 * `semReembolso`: unidades com inquilino (ou já vendidas). Demoli-las despeja
 * quem está lá e não devolve nada (evita lucrar construindo, vendendo e
 * demolindo).
 */
export function planejarDemolicao(
  m: Mundo,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  semReembolso?: ReadonlySet<number>,
): Plano {
  const [xa, xb] = intervalo(x0, x1);
  const [ya, yb] = intervalo(y0, y1);

  const uids = new Set<number>();
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const uid = m.uidEm(x, y);
    if (uid) uids.add(uid);
  }
  if (uids.size > 0) {
    const itens = [...uids].map((uid): ItemPlano => {
      const u = m.unidades.get(uid)!;
      return {
        tipo: u.tipo, x: u.x, y: u.y, largura: u.largura, altura: u.altura, estrutura: false,
        custo: semReembolso?.has(uid) ? 0 : -Math.round(tipo(u.tipo).custo * REEMBOLSO_UNIDADE), ok: true, uid,
      };
    });
    return fecharPlano('demolir', itens);
  }

  // Estrutura: de fora para o chão, para que uma célula possa ser removida
  // junto com a que ela sustenta.
  // Átrio e grand lobby saem inteiros: a outra metade entra junto.
  const celulas = new Map<number, [number, number]>();
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (!dentro(x, y) || m.est(x, y) === Est.Vazio) continue;
      celulas.set(idx(x, y), [x, y]);
      if ((y === 0 || y === 1) && ehLobbyDuplo(m.est(x, y))) celulas.set(idx(x, 1 - y), [x, 1 - y]);
    }
  }
  const ordem = [...celulas.values()].sort(([, a], [, b]) => distanciaDoChao(b) - distanciaDoChao(a));
  const removidas = new Set<number>();
  const itens: ItemPlano[] = [];
  for (const [x, y] of ordem) {
    const e = m.est(x, y);
    const dep = y >= 0 ? y + 1 : y - 1; // célula que esta sustenta
    const sustenta = m.est(x, dep) !== Est.Vazio && !removidas.has(idx(x, dep));
    const motivo = sustenta
      ? y >= 0 ? 'Sustenta o andar de cima' : 'Há escavação abaixo'
      : m.uidEm(x, y) ? 'Há algo construído no átrio' : undefined;
    const item: ItemPlano = {
      tipo: tipoDaEstrutura(e), x, y, largura: 1, altura: 1, estrutura: true, custo: 0, ok: !motivo, motivo,
    };
    if (item.ok) removidas.add(idx(x, y));
    itens.push(item);
  }
  // Metade de um lobby duplo não pode sair sozinha.
  for (const it of itens) {
    if (!it.ok || (it.y !== 0 && it.y !== 1) || !ehLobbyDuplo(m.est(it.x, it.y))) continue;
    if (!removidas.has(idx(it.x, 1 - it.y))) {
      it.ok = false;
      it.motivo = 'Sustenta o andar de cima';
    }
  }
  return fecharPlano('demolir', itens);
}

function tipoDaEstrutura(codigo: number): string {
  for (const [id, c] of Object.entries(ESTRUTURA_POR_TIPO)) if (c === codigo) return id;
  return 'piso';
}

/** Aplica os itens válidos do plano. O chamador garante que o plano foi feito sobre este mundo. */
export function executarPlano(m: Mundo, plano: Plano): void {
  for (const it of plano.itens) {
    if (!it.ok) continue;
    if (plano.acao === 'construir') {
      if (it.estrutura) m.setEst(it.x, it.y, ESTRUTURA_POR_TIPO[it.tipo]!);
      else m.adicionarUnidade(it.tipo, it.x, it.y, it.largura, it.altura);
    } else if (it.uid) m.removerUnidade(it.uid);
    else m.setEst(it.x, it.y, Est.Vazio);
  }
}

// ------------------------------------------------------------------ desfazer

/**
 * Desfaz uma construção: remove as unidades criadas (`uids`) e as células de
 * estrutura do plano. Só aplica se tudo puder sair; senão devolve o motivo.
 */
export function desfazerConstrucao(m: Mundo, itens: ItemPlano[], uids: number[]): string | undefined {
  const celulas = itens.filter((i) => i.estrutura);
  const removidas = new Set(celulas.filter((c) => !c.anterior).map((c) => idx(c.x, c.y)));
  const unidades = new Set(uids.filter((u) => m.unidades.has(u)));
  for (const c of celulas) {
    if (c.anterior) continue; // volta a ser o que era (ex.: lobby sobre piso)
    const uid = m.uidEm(c.x, c.y);
    if (uid && !unidades.has(uid)) return 'Há outra coisa construída ali; desfaça ou demola antes';
    const dep = c.y >= 0 ? c.y + 1 : c.y - 1;
    if (m.est(c.x, dep) !== Est.Vazio && !removidas.has(idx(c.x, dep))) {
      return 'Algo foi construído em cima; desfaça ou demola antes';
    }
  }
  for (const uid of unidades) m.removerUnidade(uid);
  for (const c of celulas) m.setEst(c.x, c.y, (c.anterior ?? Est.Vazio) as CodigoEstrutura);
  return undefined;
}

/**
 * Desfaz uma demolição: reconstrói estrutura e unidades (vagas) nos mesmos
 * lugares. As unidades voltam com uid novo: devolve o mapa uid antigo → novo.
 */
export function desfazerDemolicao(m: Mundo, itens: ItemPlano[]): { motivo?: string; uids: Map<number, number> } {
  const uids = new Map<number, number>();
  const celulas = itens.filter((i) => i.estrutura).sort((a, b) => distanciaDoChao(a.y) - distanciaDoChao(b.y));
  const unidades = itens.filter((i) => !i.estrutura);
  // Checagem antes de mudar qualquer coisa.
  const novas = new Set<number>();
  for (const c of celulas) {
    if (m.est(c.x, c.y) !== Est.Vazio || m.uidEm(c.x, c.y)) return { motivo: 'O espaço já foi usado; demola o que está lá antes', uids };
    const apoio = c.y >= 0 ? c.y - 1 : c.y + 1;
    const temApoio = c.y === 0 || c.y === -1 || m.est(c.x, apoio) !== Est.Vazio || novas.has(idx(c.x, apoio));
    if (!temApoio) return { motivo: 'Sem apoio para reconstruir', uids };
    novas.add(idx(c.x, c.y));
  }
  for (const u of unidades) {
    for (let y = u.y; y < u.y + u.altura; y++) {
      for (let x = u.x; x < u.x + u.largura; x++) {
        if (m.uidEm(x, y)) return { motivo: 'O espaço já foi usado; demola o que está lá antes', uids };
        if (m.est(x, y) === Est.Vazio && !novas.has(idx(x, y))) return { motivo: 'Sem piso para reconstruir', uids };
      }
    }
  }
  for (const c of celulas) m.setEst(c.x, c.y, ESTRUTURA_POR_TIPO[c.tipo]!);
  for (const u of unidades) {
    const nova = m.adicionarUnidade(u.tipo, u.x, u.y, u.largura, u.altura);
    if (u.uid) uids.set(u.uid, nova.uid);
  }
  return { uids };
}
