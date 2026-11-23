// What CHIP knows about a connector it was set up with: the day a token was saved, and the Notion token itself going to
// server/.env (gitignored) and nowhere else. The date file never holds a secret (23 Nov 2026: a set up connector opens on
// "Connected since <date>", so the day has to be kept when the token is saved).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DATA_DIR, ROOT } from './config.mjs';

const DATES = join(DATA_DIR, 'connections.json');
const ENV = join(ROOT, 'server', '.env');

const readDates = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};
/** The ISO time a secret was saved through CHIP, or null (a token put in .env by hand has no day). */
export const savedAt = (name, file = DATES) => readDates(file)[name] ?? null;
export function markSaved(name, file = DATES, now = new Date()) {
  const all = readDates(file);
  all[name] = now.toISOString();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(all));
}

// An internal integration secret: ntn_ or secret_ then letters and digits. No spaces, no line breaks.
const NOTION = /^[A-Za-z0-9_-]{20,200}$/;
export const notionState = () => ({ token: Boolean(process.env.NOTION_API_TOKEN), savedAt: savedAt('notion-token') });

/** Writes NOTION_API_TOKEN to server/.env and into this process. Never returned, logged or put in an error. */
export function saveNotionToken(text, { env = ENV, dates = DATES } = {}) {
  const token = String(text ?? '').trim();
  if (!NOTION.test(token)) throw new Error('That does not look like a Notion secret. Copy the whole secret from the integration’s page, with no spaces.');
  const lines = existsSync(env) ? readFileSync(env, 'utf8').split('\n') : [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const at = lines.findIndex((l) => /^NOTION_API_TOKEN=/.test(l));
  if (at >= 0) lines[at] = `NOTION_API_TOKEN=${token}`;
  else lines.push(`NOTION_API_TOKEN=${token}`);
  writeFileSync(env, `${lines.join('\n')}\n`, { mode: 0o600 });
  process.env.NOTION_API_TOKEN = token;
  markSaved('notion-token', dates);
  return { ok: true, ...notionState() };
}
