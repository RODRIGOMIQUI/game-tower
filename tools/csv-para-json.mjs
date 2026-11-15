// Converte docs/dados/unidades.csv em src/data/unidades.json (fonte única usada pelo jogo).
// Uso: npm run data
import { readFileSync, writeFileSync } from 'node:fs';

const NUMERICOS = new Set([
  'estrela', 'largura_col', 'altura_andares', 'custo', 'custo_extra',
  'manutencao_tri', 'receita_valor', 'capacidade', 'populacao', 'ruido_emite',
]);

const csv = readFileSync('docs/dados/unidades.csv', 'utf8').trim().split('\n');
const cabecalho = csv[0].split(',');
const unidades = csv.slice(1).map((linha, i) => {
  const campos = linha.split(',');
  if (campos.length !== cabecalho.length) {
    throw new Error(`Linha ${i + 2}: ${campos.length} campos, esperado ${cabecalho.length}`);
  }
  const u = {};
  cabecalho.forEach((nome, j) => {
    const v = campos[j];
    if (NUMERICOS.has(nome)) u[nome] = Number(v);
    else if (nome === 'sensivel_ruido') u[nome] = v === 'sim';
    else u[nome] = v;
  });
  return u;
});

writeFileSync('src/data/unidades.json', JSON.stringify(unidades, null, 2) + '\n');
console.log(`${unidades.length} unidades escritas em src/data/unidades.json`);
