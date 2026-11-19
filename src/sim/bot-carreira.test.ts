// Balanceamento (Fase 9): um jogador automático com dinheiro de verdade ($2 milhões)
// cresce a torre só quando o caixa permite. Mede quando cada estrela chega e
// compara com as metas de docs/economia.md §4. Lento: `LONGO=1 npm run sim:bot`.
import { expect, it } from 'vitest';
import { tipo } from './dados';
import { Jogo, type EventoJogo } from './jogo';
import { LARGURA } from './mundo';
import { data } from './relogio';
import { EXPRESSOS, EXPRESSOS_TOPO, PADRAO, preencher, TOPO } from './torre-grande';
import { dinheiro as fmt } from '../ui/formato';

/** Reserva mínima de caixa para manutenção e imprevistos. */
const RESERVA = 250_000;

type Passo = { nome: string; custo: number; fazer: (j: Jogo) => boolean };

/** Tenta construir; true se algo foi feito. */
function c(j: Jogo, item: string, x0: number, y0: number, x1 = x0, y1 = y0): boolean {
  return j.comando({ tipo: 'construir', item, x0, y0, x1, y1 }).ok;
}

/** Trechos de cada zona: entre os poços padrão, cada um com seu poço. */
const MODULOS: [number, number][] = [[0, 30], [31, 100], [101, 170], [171, 240], [241, 310], [311, 341], [342, 359]];

function passosZona(base: number, andares = 13): Passo[] {
  const p: Passo[] = [];
  for (const [a, b] of MODULOS) {
    const cols = b - a + 1;
    if (base === 0) p.push({ nome: `lobby ${a}`, custo: cols * 3000, fazer: (j) => c(j, 'lobby', a, 0, b, 0) });
    else p.push({ nome: `sky ${base} ${a}`, custo: cols * 4000, fazer: (j) => c(j, 'sky_lobby', a, base, b, base) });
    p.push({ nome: `piso ${base} ${a}`, custo: cols * andares * 500, fazer: (j) => c(j, 'piso', a, base + 1, b, base + andares) });
    const poco = PADRAO.find((x) => x >= a && x <= b);
    if (poco !== undefined) {
      p.push({ nome: `poço ${base} ${poco}`, custo: 300_000, fazer: (j) => {
        if (!c(j, 'elevador_padrao', poco, base, poco, base + andares)) return false;
        const uid = j.mundo.unidadeEm(poco, base)!.uid;
        j.comando({ tipo: 'carros', uid, delta: 1 });
        j.comando({ tipo: 'modo', uid, modo: 'pico_manha' });
        return true;
      } });
    }
    p.push({ nome: `lanchonete ${base} ${a}`, custo: 100_000, fazer: (j) => c(j, 'lanchonete', a, base + 2) || true });
    for (let y = base + 1; y <= base + andares; y++) {
      p.push({ nome: `escritórios ${y} ${a}`, custo: 160_000, fazer: (j) => {
        const antes = j.mundo.unidades.size;
        preencher(j, y, 'escritorio', a, y === 27 && a >= 311 ? a - 1 : b);
        return j.mundo.unidades.size > antes || true;
      } });
    }
  }
  return p;
}

function passosExpressos(): Passo[] {
  return [...EXPRESSOS, ...EXPRESSOS_TOPO].map((x) => ({
    nome: `expresso ${x}`,
    custo: 6 * 84 * 500 + 400_000 + 300_000,
    fazer: (j: Jogo) => {
      // Os expressos do topo vão até a Coroa (97); os demais até o último sky lobby.
      const topo = EXPRESSOS_TOPO.includes(x) ? 97 : 84;
      c(j, 'piso', x, 1, x + 5, topo);
      if (!c(j, 'elevador_expresso', x, 0, x, topo)) return false;
      const uid = j.mundo.unidadeEm(x, 0)!.uid;
      for (let i = 0; i < 3; i++) j.comando({ tipo: 'carros', uid, delta: 1 });
      return true;
    },
  }));
}

const LONGO = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LONGO;

it.skipIf(!LONGO)('carreira com dinheiro real: ritmo das estrelas', () => {
  const j = new Jogo({ seed: 77 }); // caixa inicial padrão da carreira
  const fila: Passo[] = [...passosZona(0)];
  const feitos = new Set<string>();
  const marcos: string[] = [];
  const trimestres: string[] = [];
  const extras = (s: number): Passo[] => {
    const r: Passo[] = [];
    if (s >= 2 && !feitos.has('servicos')) {
      feitos.add('servicos');
      r.push({ nome: 'escavação', custo: 120 * 2000, fazer: (j) => c(j, 'escavacao', 0, -1, 119, -1) });
      r.push({ nome: 'segurança', custo: 100_000, fazer: (j) => c(j, 'seguranca', 0, -1) });
      r.push({ nome: 'limpeza', custo: 50_000, fazer: (j) => c(j, 'limpeza', 16, -1) });
    }
    if (s >= 3 && !feitos.has('zonaB')) {
      feitos.add('zonaB');
      r.push(...passosExpressos().slice(0, 2), ...passosZona(14));
      r.push({ nome: 'centro médico', custo: 300_000, fazer: (j) => c(j, 'centro_medico', 70, -1) });
      r.push({ nome: 'suítes', custo: 300_000, fazer: (j) => { preencher(j, 27, 'hotel_suite', 311, LARGURA - 1); return true; } });
      r.push({ nome: 'reciclagem', custo: 400_000 + 25 * 2000, fazer: (j) => c(j, 'escavacao', 100, -2, 124, -2) && c(j, 'reciclagem', 100, -2) });
      r.push(...passosExpressos().slice(2, 4), ...passosZona(28));
    }
    if (s >= 4 && !feitos.has('zonaD')) {
      feitos.add('zonaD');
      r.push({ nome: 'metrô', custo: 1_000_000 + 30 * 3 * 2000, fazer: (j) => c(j, 'escavacao', 280, -1, 309, -3) && c(j, 'metro', 280, -3) });
      r.push(...passosExpressos().slice(4, 6), ...passosZona(42));
    }
    if (s >= 5 && !feitos.has('zonaE')) {
      feitos.add('zonaE');
      r.push(...passosExpressos().slice(6), ...passosZona(56), ...passosZona(70));
      r.push({ nome: 'topo', custo: 60 * 16 * 500 + 20 * 4000, fazer: (j) => c(j, 'piso', TOPO.x0, 84, TOPO.x1, 99) && c(j, 'sky_lobby', 190, 97, TOPO.x1, 97) });
      r.push({
        nome: 'grand lobby',
        custo: 30 * 15_000,
        fazer: (j) => {
          j.comando({ tipo: 'demolir', x0: 150, y0: 1, x1: 179, y1: 1 });
          return c(j, 'grand_lobby', 150, 0, 179, 0);
        },
      });
      r.push({ nome: 'Coroa', custo: 3_000_000, fazer: (j) => c(j, 'coroa', TOPO.x0, 97) });
    }
    return r;
  };

  const inicio = performance.now();
  for (let dia = 0; dia < 16 * 12 && j.estrela < 6 && !j.encerrado; dia++) {
    // Requisitos de estrela (serviços) furam a fila, como faria um jogador.
    const novos = extras(j.estrela);
    const urgentes = novos.filter((p) => ['escavação', 'segurança', 'limpeza', 'centro médico', 'metrô'].includes(p.nome));
    fila.unshift(...urgentes);
    fila.push(...novos.filter((p) => !urgentes.includes(p)));
    // Constrói o que o caixa permite, em ordem.
    while (fila.length && j.dinheiro - fila[0]!.custo > RESERVA) {
      const p = fila.shift()!;
      p.fazer(j);
    }
    // Carros extras onde a espera passa de 15 min.
    for (const p of j.resumoPocos()) {
      if (p.esperaMedia > 15 && p.carros < 8 && j.dinheiro - 50_000 > RESERVA) j.comando({ tipo: 'carros', uid: p.uid, delta: 1 });
    }
    const ev: EventoJogo[] = j.avancar(1440);
    for (const e of ev) {
      const d = data(j.tick);
      const quando = `ano ${d.ano} T${d.trimestre} (dia ${d.diaTotal})`;
      if (e.tipo === 'estrela') marcos.push(`${quando}: ${e.nivel >= 6 ? 'Lendária' : `${e.nivel}★`} · pop ${j.populacaoTotal()}`);
      if (e.tipo === 'inspecao') marcos.push(`${quando}: inspeção ${e.aprovada ? 'aprovada' : 'reprovada'} (estresse ${Math.round(e.estresse)})`);
      if (e.tipo === 'inauguracao') marcos.push(`${quando}: inauguração ${e.sucesso ? 'ok' : 'fracassou'} (${e.presentes}/${e.convidados})`);
      if (e.tipo === 'falencia') marcos.push(`${quando}: FALÊNCIA`);
      if (e.tipo === 'trimestre' && d.trimestre === 1) {
        const r = e.livro.receitas;
        trimestres.push(`${quando}: caixa ${fmt(e.caixa)} · aluguel ${fmt(r.aluguel)} · comida ${fmt(r.comida)} · hotel ${fmt(r.hotel)} · pop ${j.populacaoTotal()}`);
      }
    }
  }
  const s = (performance.now() - inicio) / 1000;
  console.log(`\nMarcos:\n${marcos.join('\n')}\n\nInício de cada ano:\n${trimestres.join('\n')}\n\nFim: ${j.estrela >= 6 ? 'Lendária' : `${j.estrela}★`} · pop ${j.populacaoTotal()} · ${fmt(j.dinheiro)} · ${s.toFixed(0)} s reais\n`);
  void tipo;
  expect(j.encerrado).toBe(false);
}, 3_600_000);
