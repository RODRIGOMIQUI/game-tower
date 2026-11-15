/** RNG determinístico (mulberry32). O estado é um inteiro de 32 bits, fácil de salvar. */
export class Rng {
  constructor(public estado: number) {}

  /** Número em [0, 1). */
  proximo(): number {
    let t = (this.estado = (this.estado + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max]. */
  inteiro(min: number, max: number): number {
    return min + Math.floor(this.proximo() * (max - min + 1));
  }
}
