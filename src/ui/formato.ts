const numero = new Intl.NumberFormat('pt-BR');

/** "$ 1.234.567" ou "−$ 1.234". */
export function dinheiro(v: number): string {
  return `${v < 0 ? '−' : ''}$ ${numero.format(Math.abs(Math.round(v)))}`;
}

export function inteiro(v: number): string {
  return numero.format(v);
}
