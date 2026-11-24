// CHIP app: React + Vite, built from BELLA's own components and tokens.
// BELLA is read in place (no copy, no hex here) from the one BELLA that
// scripts/lib/bella-dir.mjs resolves; it fails loudly on a missing or wrong
// checkout. Its package only exports tokens, so the components come in
// through an alias.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { bellaDir } from '../scripts/lib/bella-dir.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
// BELLA_DIR points a worktree (or any other checkout) at BELLA
const BELLA = bellaDir();
const SERVER = 'http://127.0.0.1:3100';

// Preload the font files the first page draws with (Lexend for words, Geist Mono for numbers), so the app can start
// the moment they are in and never shows text in a fallback font (Elleta, 23 Nov evening). Build only: the files'
// hashed names exist once the bundle is written.
const PRELOAD = [/Lexend-Variable-latin-[\w-]+\.woff2$/, /GeistMono-Regular-[\w-]+\.woff2$/, /GeistMono-SemiBold-[\w-]+\.woff2$/];
const preloadFonts = {
  name: 'chip-preload-fonts',
  transformIndexHtml(html, ctx) {
    if (!ctx.bundle) return html;
    const files = Object.keys(ctx.bundle).filter((f) => PRELOAD.some((re) => re.test(f)) && !/latin-ext/.test(f));
    return { html, tags: files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head-prepend' })) };
  },
};

export default defineConfig({
  root: here,
  plugins: [react(), preloadFonts],
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
    proxy: { '/ask': SERVER, '/needs': SERVER, '/cmd': SERVER, '/health': SERVER, '/data': SERVER, '/notes': SERVER, '/source': SERVER, '/docs': SERVER, '/models': SERVER, '/host': SERVER, '/usage': SERVER, '/obi-docs': SERVER, '/visibility': SERVER, '/compare': SERVER, '/bella-doc': SERVER, '/bella-history': SERVER, '/bella-baseline': SERVER, '/bella-spec': SERVER, '/figma-lint': SERVER, '/bar': SERVER, '/search': SERVER, '/term/repos': SERVER, '/play': SERVER, '/projects': SERVER, '/starts': SERVER, '/contrast-pairs': SERVER, '/system-docs': SERVER, '/term': { target: SERVER, ws: true } },
  },
  build: { outDir: process.env.CHIP_OUT_DIR || resolve(here, 'dist'), emptyOutDir: true },
});
