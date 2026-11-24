// CHIP's own Storybook (Elleta, 19 Nov 2026: "I do want Storybook to be up
// and running because I want to be able to test it in Chip and add stories
// where they're missing"). CHIP's templates and pages only, under
// "CHIP / Templates" and "CHIP / Pages", locked to the Chip theme. BELLA's
// Storybook composes it into its sidebar (BELLA .storybook/main.ts refs).
// The BELLA parts come from the one BELLA (scripts/lib/bella-dir.mjs), the
// same aliases as app/vite.config.js; CHIP's data is proxied to its server.
import { resolve } from 'node:path';
import { bellaDir } from '../scripts/lib/bella-dir.mjs';

const BELLA = bellaDir();
const SERVER = 'http://127.0.0.1:3100';

export default {
  stories: ['../app/src/**/*.stories.@(js|jsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@bella/components': resolve(BELLA, 'src/components'),
      '@bella/tokens.css': resolve(BELLA, 'tokens/bella.css'),
      '@bella/fonts.css': resolve(BELLA, '.storybook/fonts.css'),
    };
    config.resolve.dedupe = ['react', 'react-dom'];
    config.server = {
      ...(config.server || {}),
      proxy: { '/projects': SERVER, '/needs': SERVER, '/gaps': SERVER },
      // BELLA's fonts and parts live outside this repo
      fs: { ...(config.server?.fs || {}), allow: [resolve(import.meta.dirname, '..'), BELLA] },
    };
    return config;
  },
};
