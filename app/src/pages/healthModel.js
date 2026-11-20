// Health's numbers, worked out from CHIP's own data: BELLA's components
// (/data/bella.json), the gaps per check (/gaps) and BELLA's gate history.
// Nothing here is invented: a card CHIP has no data for gets `null` and the
// page shows the Empty state.
import { useMemo } from 'react';
import useCached from '../templates/useCached.js';

/* The six component checks, in Figma's order (Health · content 601:111049),
   with Figma's words for "all pass", "some fail" and the action. */
export const CHECKS = [
  { id: 'story', title: 'Story', all: (n) => `All ${n} have a story`, some: 'have no story', action: 'Add stories' },
  { id: 'docs', title: 'Docs', all: (n) => `All ${n} have a doc page`, some: 'have no doc page', action: 'Add docs' },
  { id: 'contract', title: 'Contract', all: (n) => `All ${n} match the code`, some: "don't match the code", action: 'Fix contracts' },
  { id: 'dsds', title: 'Machine-readable spec', all: (n) => `All ${n} have one`, some: 'have no machine-readable spec', action: 'Add entries' },
  { id: 'contrast', title: 'Contrast', all: (n) => `All ${n} have a pair`, some: 'lack a pair', action: 'Add pairs' },
  { id: 'a11y', title: 'A11y', all: (n) => `All ${n} have keyboard and label checks`, some: 'lack keyboard and label checks', action: 'Fill a11y' },
];

export const TARGET = 90;


const names = (list) => (list.length > 3 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', '));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** components: BELLA's list; gaps: /gaps .gaps ({ story: { Name: … } }); history: BELLA's commits. */
export function healthModel({ components = [], gaps = {}, history = [], pairs = null }) {
  const n = components.length;
  // a fix opens the first part that needs it on Components (#/components/<id>)
  const idOf = (name) => components.find((c) => c.name === name)?.id ?? name;
  const rows = CHECKS.map((c) => {
    const missing = Object.keys(gaps[c.id] ?? {});
    const pass = n - missing.length;
    return { ...c, pass, missing, href: missing.length ? `#/components/${idOf(missing[0])}` : null, fill: n ? Math.round((pass / n) * 100) : 0, line: missing.length ? `${missing.length} ${c.some}: ${names(missing)}` : c.all(n) };
  });
  const total = n * CHECKS.length;
  const passed = rows.reduce((s, r) => s + r.pass, 0);
  const runs = history.filter((h) => h.gate).sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  const last = runs[0];
  const parts = last ? [last.gate.contrastPairs, last.gate.contractParity].filter((x) => x != null) : [];
  const contrast = rows.find((r) => r.id === 'contrast');
  return {
    n,
    rows,
    health: n ? { pct: Math.round((passed / total) * 100), passed, total, failing: rows.filter((r) => r.missing.length) } : null,
    gate: last ? { ok: parts.filter(Boolean).length, of: parts.length, when: day(last.committedAt), allPass: last.gate.ok } : null,
    contrast: n ? { pct: contrast.fill, pass: contrast.pass, of: n, toGo: contrast.missing.length, href: contrast.href } : null,
    gateDays: gateDays(runs),
    lowest: lowestPair(pairs),
    fixCount: rows.reduce((s, r) => s + r.missing.length, 0),
  };
}

/* Figma's Gate view (767:102821): the last six days with gate runs, newest
   first: how many ran, how many passed, and which check failed most. A run is
   one of BELLA's commits with a gate result. */
const WEEKDAY = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
function gateDays(runs) {
  const by = new Map();
  for (const r of runs) {
    const k = r.committedAt.slice(0, 10);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by.entries()].slice(0, 6).map(([k, list]) => {
    const passed = list.filter((r) => r.gate.ok).length;
    const contrast = list.filter((r) => r.gate.contrastPairs === false).length;
    const contract = list.filter((r) => r.gate.contractParity === false).length;
    const worst = contrast >= contract ? (contrast ? `contrast failed ${contrast}` : null) : `contract failed ${contract}`;
    return { id: k, title: WEEKDAY(list[0].committedAt), runs: list.length, passed, line: passed === list.length ? (list.length === 1 ? 'The one run passed' : `All ${list.length} runs passed`) : `${passed} of ${list.length} ${list.length === 1 ? 'run' : 'runs'} passed${worst ? `: ${worst}` : ''}` };
  });
}

/* The weakest text pair BELLA's gate measures (/contrast-pairs: BELLA's own list
   and ratios), against the 7:1 bar every text pair has. null when BELLA has none. */
function lowestPair(res) {
  const text = (res?.pairs ?? []).filter((p) => p.bar >= 7 && p.worst != null);
  if (!text.length) return null;
  const w = text.reduce((a, b) => (b.worst < a.worst ? b : a));
  const below = text.filter((p) => !p.ok).length;
  return { ratio: w.worst, label: w.label, bar: 7, below, checked: res.checked };
}

/** Reads CHIP's data (kept between pages); `model` is null only on the very first visit. */
export function useHealth() {
  const { data, error, at, reload } = useCached(['/data/bella.json', '/gaps', '/contrast-pairs']);
  const model = useMemo(() => (data ? healthModel({ components: data[0].components, gaps: data[1].gaps, history: data[0].history, pairs: data[2] }) : null), [data]);
  const checked = at ? new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  return { model, error, reload, checked };
}

/* Hand a check's gaps to the agent (user test 21 Nov, item 2; rule: "Fix opens
   a ready plan; the job shows on Work"): BELLA's own brief for each part that
   misses the check (/gaps), as one run (POST /runs). The run's card shows in
   Work's Agent lane; a reviewer Accepts or Undoes it there. */
export async function handOff(row) {
  const r = await fetch('/gaps');
  const gaps = (await r.json().catch(() => ({}))).gaps?.[row.id] ?? {};
  const lines = row.missing.map((name) => gaps[name]?.brief).filter(Boolean);
  if (!lines.length) throw new Error('CHIP has no brief for these yet, so there is nothing to hand over');
  const brief = [`Close BELLA's ${row.title} gap for ${lines.length} ${lines.length === 1 ? 'part' : 'parts'}. For each:`, ...lines.map((l) => `- ${l}`), 'Change only what each line names. Ask before changing a token.'].join('\n');
  const res = await fetch('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief, title: `${row.action}: ${names(row.missing)}`, from: 'Health' }) });
  const run = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(run.error || 'CHIP did not answer');
  if (run.status === 'login' || run.status === 'failed') throw new Error(run.error || 'The agent could not start');
  window.dispatchEvent(new Event('chip:changed'));
  return run;
}
