// "Add file key" without the key: she pastes the BELLA library's Figma link and CHIP takes the file ID
// from it (23 Nov: "what is a file key"). The ID goes to server/.env (gitignored) and into this process.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const ENV = join(ROOT, 'server', '.env');

/** The file ID from a Figma link (design, file, board or proto), or a bare ID; null when it isn't one. */
export function keyFromLink(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]{10,40})/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,40}$/.test(t) ? t : null;
}

export const figmaKeyState = () => ({ key: Boolean(process.env.FIGMA_FILE_KEY), token: Boolean(process.env.FIGMA_ACCESS_TOKEN) });

export function saveFigmaKey(text, file = ENV) {
  const key = keyFromLink(text);
  if (!key) throw new Error('That is not a Figma link. Open the BELLA library in Figma and copy the address from the browser bar.');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const at = lines.findIndex((l) => /^FIGMA_FILE_KEY=/.test(l));
  if (at >= 0) lines[at] = `FIGMA_FILE_KEY=${key}`;
  else lines.push(`FIGMA_FILE_KEY=${key}`);
  writeFileSync(file, `${lines.join('\n').replace(/\n+$/, '')}\n`);
  process.env.FIGMA_FILE_KEY = key;
  return { ok: true, ...figmaKeyState() };
}
