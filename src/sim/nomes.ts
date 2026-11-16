// Nomes fictícios para as pessoas (ficha da pessoa, docs/gdd.md §5.4).
// Determinístico pelo id: a mesma pessoa tem sempre o mesmo nome.

const PRIMEIROS = [
  'Ana', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João',
  'Karina', 'Lucas', 'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Rafaela', 'Samuel', 'Tânia', 'Vitor',
  'Yasmin', 'Caio', 'Débora', 'Enzo', 'Flávia', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Leonardo',
  'Mirela', 'Otávio', 'Priscila', 'Renato', 'Sofia', 'Tiago', 'Valéria', 'Wesley', 'Alice', 'Breno',
];
const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Hartmann', 'Ibrahim', 'Jardim',
  'Klein', 'Lacerda', 'Moreira', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Rezende', 'Siqueira', 'Teixeira',
  'Uchôa', 'Vasconcelos', 'Watanabe', 'Xavier', 'Yamamoto', 'Zanetti', 'Andrade', 'Brandão', 'Coelho', 'Dantas',
];

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function nomePessoa(id: number): string {
  const h = hash(id);
  return `${PRIMEIROS[h % PRIMEIROS.length]} ${SOBRENOMES[(h >>> 8) % SOBRENOMES.length]}`;
}
