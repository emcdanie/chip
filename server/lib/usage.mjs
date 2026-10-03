// data/usage.jsonl (local, gitignored): the ledger. One line per answer,
// command, tool call and manual override, so the router's rules can be tuned,
// the daily Claude budget held, and the Usage card can say what stayed local.
// An answer line: { at, type: 'ask' | 'data', route: 'data' | 'local' | 'cloud',
// provider, model, prompt, output (tokens), ms, why }. A tool or command line:
// { at, type: 'tool', route: 'tool', server, tool, purpose, ms, ok }.
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
      const e = JSON.parse(l);
      return e && typeof e === 'object' && typeof e.at === 'string' ? [e] : []; // a damaged line is skipped
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

/** When each tool server was last used: { name: ISO date } (Connectors page). */
export function lastToolUses() {
  const out = {};
  for (const e of entries()) if (e.type === 'tool' && !e.cancelled && !e.refused) out[e.server] = e.at;
  return out;
}

// Lines written before the ledger had "route" as the router's reason; their
// place comes from the provider.
const placeOf = (e) =>
  ['data', 'local', 'cloud', 'tool'].includes(e.route) ? e.route : e.type === 'data' ? 'data' : e.type === 'tool' ? 'tool' : e.provider === 'claude' ? 'cloud' : 'local';

function pricing() {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, 'pricing.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** The last 7 days: answers by route, tokens kept local, value at API rates,
 *  share that never left the laptop, a daily series and tool calls. */
export function usageWeek(now = Date.now()) {
  // the last 7 calendar days, today included (local dates)
  const DAY = 24 * 3600 * 1000;
  const midnight = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const since = midnight(now) - 6 * DAY;
  const routes = { data: 0, local: 0, cloud: 0 };
  const tools = {};
  let promptLocal = 0, outputLocal = 0, cloudTokens = 0, uncounted = 0;
  const days = Array.from({ length: 7 }, () => 0); // answers kept local, oldest first
  for (const e of entries()) {
    const t = new Date(e.at).getTime();
    if (!(t >= since)) continue;
    const place = placeOf(e);
    if (e.type === 'tool') {
      if (!e.cancelled && !e.refused) tools[e.server ?? e.tool] = (tools[e.server ?? e.tool] ?? 0) + 1;
      continue;
    }
    if (e.type !== 'ask' && e.type !== 'data') continue;
    if (e.weak) continue; // no answer was made
    routes[place] = (routes[place] ?? 0) + 1;
    if (place === 'local' && e.prompt == null && !e.weak) uncounted += 1; // logged before tokens were counted
    if (place === 'local') {
      promptLocal += e.prompt ?? 0;
      outputLocal += e.output ?? 0;
    }
    if (place === 'cloud') cloudTokens += (e.prompt ?? 0) + (e.output ?? 0);
    if (place !== 'cloud') days[Math.min(6, Math.max(0, Math.round((midnight(t) - since) / DAY)))] += 1;
  }
  const answers = routes.data + routes.local + routes.cloud;
  const p = pricing();
  const rated = p && typeof p.inputPerMillion === 'number' && typeof p.outputPerMillion === 'number';
  return {
    routes,
    answers,
    keptLocalShare: answers ? (routes.data + routes.local) / answers : null,
    tokensLocal: promptLocal + outputLocal,
    uncounted,
    cloudTokens,
    value: rated ? { amount: (promptLocal * p.inputPerMillion + outputLocal * p.outputPerMillion) / 1e6, currency: p.currency ?? 'USD', model: p.model ?? 'Claude' } : null,
    days,
    tools,
  };
}
