// CHIP app: React + Vite, built from BELLA's own components and tokens.
// BELLA is read in place from ../bella (no copy, no hex here). Its package
// only exports tokens, so the components come in through an alias.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const BELLA = resolve(here, '../../bella');
const SERVER = 'http://127.0.0.1:3100';

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@bella/components': resolve(BELLA, 'src/components'),
      '@bella/tokens.css': resolve(BELLA, 'tokens/bella.css'),
      '@bella/fonts.css': resolve(BELLA, '.storybook/fonts.css'),
    },
    // BELLA's components import react from its own node_modules; one copy only.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [resolve(here, '..'), BELLA] },
    proxy: { '/ask': SERVER, '/cmd': SERVER, '/health': SERVER, '/data': SERVER, '/notes': SERVER, '/source': SERVER, '/docs': SERVER, '/models': SERVER },
  },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
});
