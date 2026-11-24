// "Add file key" without the key: she pastes the BELLA library's Figma link and CHIP takes the file ID
// from it (23 Nov: "what is a file key"). The ID goes to server/.env (gitignored) and into this process.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, ROOT } from './config.mjs';
import { markSaved, savedAt } from './connections.mjs';

const ENV = join(ROOT, 'server', '.env');

/** The file ID from a Figma link (design, file, board or proto), or a bare ID; null when it isn't one. */
export function keyFromLink(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]{10,40})/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,40}$/.test(t) ? t : null;
}

const READ_FILE = join(DATA_DIR, 'figma-read.json');
/** The last good read of the BELLA file: { at, name } or null. Never holds a token. */
export function lastFigmaRead(file = READ_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
export const figmaKeyState = () => ({ key: Boolean(process.env.FIGMA_FILE_KEY), token: Boolean(process.env.FIGMA_ACCESS_TOKEN), lastRead: lastFigmaRead(), tokenSavedAt: savedAt('figma-token') });

// A personal access token looks like figd_ plus letters, digits, - and _ (older ones: hex). Nothing with a space or a line break.
const TOKEN = /^[A-Za-z0-9_.-]{20,300}$/;

/** Writes FIGMA_ACCESS_TOKEN to server/.env (gitignored) and into this process. The token is never returned, logged or put in an error. */
export function saveFigmaToken(text, file = ENV, dates = undefined) {
  const token = String(text ?? '').trim();
  if (!TOKEN.test(token)) throw new Error('That does not look like a Figma token. Copy the whole token Figma showed you, with no spaces.');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const at = lines.findIndex((l) => /^FIGMA_ACCESS_TOKEN=/.test(l));
  if (at >= 0) lines[at] = `FIGMA_ACCESS_TOKEN=${token}`;
  else lines.push(`FIGMA_ACCESS_TOKEN=${token}`);
  writeFileSync(file, `${lines.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
  process.env.FIGMA_ACCESS_TOKEN = token;
  markSaved('figma-token', dates);
  return { ok: true, ...figmaKeyState() };
}

/** Reads the BELLA file's name from Figma with the saved token and key: "Connected to <name>". Words only, never the token. */
export async function testFigma({ get = defaultGet, file = READ_FILE } = {}) {
  const key = process.env.FIGMA_FILE_KEY;
  if (!key) return { ok: false, says: 'There is no Figma file key yet. Paste the BELLA library link first.' };
  if (!process.env.FIGMA_ACCESS_TOKEN) return { ok: false, says: 'There is no Figma token yet. Paste it first.' };
  const r = await get(`https://api.figma.com/v1/files/${key}?depth=1`, process.env.FIGMA_ACCESS_TOKEN);
  if (r.status === 403) return { ok: false, says: 'Figma said the token is not allowed: make a new one with file read access, then paste it again.' };
  if (r.status === 404) return { ok: false, says: 'Figma has no file with that key for this token. Check the library link.' };
  if (r.status === 429) return { ok: false, says: 'Figma is limiting reads right now. Try again in a minute.' };
  if (!r.ok) return { ok: false, says: `Figma answered ${r.status}. Try again in a minute.` };
  const name = r.body?.name ?? 'the file';
  const at = new Date().toISOString();
  try {
    writeFileSync(file, JSON.stringify({ at, name }));
  } catch {}
  return { ok: true, name, at, says: `Connected to ${name}` };
}

async function defaultGet(url, token) {
  try {
    const res = await fetch(url, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(15000) });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

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
