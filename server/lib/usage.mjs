// data/usage.jsonl (local, gitignored): one line per OBI answer and per manual
// override, so the router's rules can be tuned and the daily Claude budget held.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';

const FILE = join(DATA_DIR, 'usage.jsonl');

export function logUsage(entry) {
  appendFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

function entries() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

/** Claude answers Auto chose today (local date); hand picks do not spend Auto's budget. */
export function claudeToday() {
  const today = new Date().toDateString();
  return entries().filter((e) => e.type === 'ask' && e.provider === 'claude' && e.auto === true && new Date(e.at).toDateString() === today).length;
}

/** The week's most common overrides: [{ from, to, count }], most first. */
export function topOverrides(n = 3) {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const counts = {};
  for (const e of entries()) {
    if (e.type !== 'override' || new Date(e.at).getTime() < since) continue;
    const k = `${e.autoChose} → ${e.chose}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, count]) => {
    const [from, to] = k.split(' → ');
    return { from, to, count };
  });
}
