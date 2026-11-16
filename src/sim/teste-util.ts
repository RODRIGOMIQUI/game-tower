// Utilitários para montar prédios em testes e no cenário headless.
import { Jogo, type EventoJogo } from './jogo';
import { Estado } from './pessoas';

export function construir(j: Jogo, item: string, x0: number, y0: number, x1 = x0, y1 = y0): void {
  const r = j.comando({ tipo: 'construir', item, x0, y0, x1, y1 });
  if (!r.ok) throw new Error(`Falha ao construir ${item} em (${x0},${y0})-(${x1},${y1}): ${r.motivo}`);
}

export function jogoRico(): Jogo {
  return new Jogo({ sandbox: true, dinheiro: 1e12, seed: 7 });
}

/** Conta pessoas por estado. */
export function contarEstados(j: Jogo): Record<string, number> {
  const nomes = Object.fromEntries(Object.entries(Estado).map(([k, v]) => [v, k]));
  const r: Record<string, number> = {};
  for (const p of j.populacao.pessoas.values()) r[nomes[p.estado]!] = (r[nomes[p.estado]!] ?? 0) + 1;
  return r;
}

/** Avança até a hora `h` (0–23) do dia atual ou do seguinte. */
export function avancarAte(j: Jogo, h: number): EventoJogo[] {
  const alvo = h * 60;
  const agora = j.tick % 1440;
  return j.avancar(alvo > agora ? alvo - agora : 1440 - agora + alvo);
}
