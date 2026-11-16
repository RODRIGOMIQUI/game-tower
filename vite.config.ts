import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer pasta (GitHub Pages, arquivo local servido etc.).
  base: './',
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
