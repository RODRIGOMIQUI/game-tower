// Benchmark fora do Vitest, para perfilar com `node --cpu-prof`.
// Uso: npm run bench:perfil
import { Jogo } from '../../src/sim/jogo';
import { avancarAte } from '../../src/sim/teste-util';
import { montarTorreGrande } from '../../src/sim/torre-grande';

const j = new Jogo({ sandbox: true, seed: 3, eventos: false });
let t = performance.now();
montarTorreGrande(j);
console.log(`População ${j.populacaoTotal()} · montagem ${((performance.now() - t) / 1000).toFixed(1)} s`);
for (const [nome, h] of [['06h→07h', 7], ['07h→10h pico', 10], ['10h→16h', 16], ['16h→20h pico', 20], ['20h→06h', 6]] as const) {
  const tick0 = j.tick;
  t = performance.now();
  avancarAte(j, h);
  const s = (performance.now() - t) / 1000;
  console.log(`${nome.padEnd(14)} ${((j.tick - tick0) / s).toFixed(0).padStart(6)} ticks/s`);
}
console.log(`rotas pedidas ${j.roteador.calculadas} · árvores montadas ${j.roteador.arvoresMontadas}`);
// Meta do GDD: 1 ano de jogo (16 dias) em menos de 30 s.
const tickAno = j.tick;
t = performance.now();
j.avancar(16 * 1440);
const sAno = (performance.now() - t) / 1000;
console.log(`1 ano de jogo: ${sAno.toFixed(1)} s (${((j.tick - tickAno) / sAno).toFixed(0)} ticks/s)`);
