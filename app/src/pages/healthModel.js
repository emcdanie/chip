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
  { id: 'dsds', title: 'DSDS', all: (n) => `All ${n} have one`, some: 'have no DSDS entry', action: 'Add entries' },
  { id: 'contrast', title: 'Contrast', all: (n) => `All ${n} have a pair`, some: 'lack a pair', action: 'Add pairs' },
  { id: 'a11y', title: 'A11y', all: (n) => `All ${n} have keyboard and label checks`, some: 'lack keyboard and label checks', action: 'Fill a11y' },
];

export const TARGET = 90;

const names = (list) => (list.length > 3 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', '));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** components: BELLA's list; gaps: /gaps .gaps ({ story: { Name: … } }); history: BELLA's commits. */
export function healthModel({ components = [], gaps = {}, history = [] }) {
  const n = components.length;
  const rows = CHECKS.map((c) => {
    const missing = Object.keys(gaps[c.id] ?? {});
    const pass = n - missing.length;
    return { ...c, pass, missing, fill: n ? Math.round((pass / n) * 100) : 0, line: missing.length ? `${missing.length} ${c.some}: ${names(missing)}` : c.all(n) };
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
    contrast: n ? { pct: contrast.fill, pass: contrast.pass, of: n, toGo: contrast.missing.length } : null,
    drift: null, // CHIP has no Figma baseline yet (/figma-baseline answers at: null)
    lowest: null, // CHIP has no measured contrast pairs yet (/contrast-pairs answers [])
    fixes: rows.filter((r) => r.missing.length).map((r) => ({ id: r.id, title: `${r.missing.length} ${r.some}`, names: names(r.missing), action: r.action })),
    fixCount: rows.reduce((s, r) => s + r.missing.length, 0),
  };
}

/** Reads CHIP's data (kept between pages); `model` is null only on the very first visit. */
export function useHealth() {
  const { data, error, at, reload } = useCached(['/data/bella.json', '/gaps']);
  const model = useMemo(() => (data ? healthModel({ components: data[0].components, gaps: data[1].gaps, history: data[0].history }) : null), [data]);
  const checked = at ? new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  return { model, error, reload, checked };
}
