import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('câmera', () => {
  it('não empurra o chão para fora da tela ao limitar', () => {
    const c = new Camera();
    c.centralizar(1440, 0, 1024, 768);
    c.oy = 522;
    c.limitar(1024, 768);
    expect(c.oy).toBe(522);
  });

  it('converte tela → célula (térreo logo acima do chão, B1 logo abaixo)', () => {
    const c = new Camera();
    c.ox = 0;
    c.oy = 500;
    expect(c.celulaEm(5, 499)).toEqual({ x: 0, y: 0 });
    expect(c.celulaEm(17, 501)).toEqual({ x: 1, y: -1 });
    expect(c.celulaEm(0, 500 - 72 - 1)).toEqual({ x: 0, y: 1 });
  });

  it('zoom mantém o ponto sob o cursor', () => {
    const c = new Camera();
    c.ox = 100;
    c.oy = 400;
    const antes = c.telaParaMundo(300, 200);
    c.zoom(1, 300, 200);
    const depois = c.telaParaMundo(300, 200);
    expect(depois.wx).toBeCloseTo(antes.wx, 0);
    expect(depois.wy).toBeCloseTo(antes.wy, 0);
  });
});
