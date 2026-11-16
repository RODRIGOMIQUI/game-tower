import { defineConfig } from 'vite';

// Empacota o benchmark num único .mjs para rodar no Node puro.
export default defineConfig({
  build: {
    ssr: 'tools/bench/bench.ts',
    outDir: 'tools/bench/dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: 'bench.mjs' } },
  },
});
