// Health's numbers, worked out from CHIP's own data: BELLA's components
// (/data/bella.json), the gaps per check (/gaps) and BELLA's gate history.
// Nothing here is invented: a card CHIP has no data for gets `null` and the
// page shows the Empty state.
import { useMemo } from 'react';
import { planRun } from '../templates/RunPlan.jsx';
import useCached from '../templates/useCached.js';
import { gateRuns } from './gateSlots.js';

/* The six component checks, in Figma's order (Health · content 601:111049),
   with Figma's words for "all pass", "some fail" and the action. */
export const CHECKS = [
  { id: 'story', title: 'Story', all: (n) => `All ${n} have a story`, some: 'have no story', action: 'Add stories' },
  // what each gap measures, said as it is (data check, 22 Nov): docs = the description at the top of the Storybook
  // doc page (every part has the page); contract = a contract exists; a11y = the contract has accessibility notes
  { id: 'docs', title: 'Docs', all: (n) => `All ${n} have a description on their doc page`, some: 'have no description on their doc page', action: 'Add docs' },
  { id: 'contract', title: 'Contract', all: (n) => `All ${n} have a contract`, some: 'have no contract', action: 'Add contracts' },
  { id: 'dsds', title: 'Machine-readable spec', short: 'Spec', all: (n) => `All ${n} have one`, some: 'have no machine-readable spec', action: 'Add entries' },
  { id: 'contrast', title: 'Contrast', all: (n) => `All ${n} have a pair`, some: 'lack a pair', action: 'Add pairs' },
  { id: 'a11y', title: 'A11y', all: (n) => `All ${n} have accessibility notes in their contract`, some: 'have no accessibility notes in their contract', action: 'Fill a11y' },
];

export const TARGET = 90;

/* Who takes each fix, as Figma's Needs you cards said it (601:109235: pairs a maintainer,
   keyboard lines a developer); the code checks are a developer's. Docs names no role in Figma. */
// the role alone, no "a" (Elleta, 21 Nov)
const WHO = { contrast: 'maintainer', a11y: 'developer', story: 'developer', contract: 'developer', dsds: 'developer' };


const names = (list) => (list.length > 3 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', '));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** components: BELLA's list; gaps: /gaps .gaps ({ story: { Name: … } }); history: BELLA's commits. */
export function healthModel({ components = [], gaps = {}, history = [], pairs = null, checks = null }) {
  const n = components.length;
  // a fix opens the first part that needs it on Components (#/system/components/<id>)
  const idOf = (name) => components.find((c) => c.name === name)?.id ?? name;
  const rows = CHECKS.map((c) => {
    const missing = Object.keys(gaps[c.id] ?? {});
    const pass = n - missing.length;
    // who takes the fix, at the end of the line (nothing made is lost: the Needs you cards said it)
    return { ...c, pass, missing, href: missing.length ? `#/system/components/${idOf(missing[0])}` : null, fill: n ? Math.round((pass / n) * 100) : 0, line: missing.length ? `${missing.length} ${c.some}: ${names(missing)}${WHO[c.id] ? ` · ${WHO[c.id]}` : ''}` : c.all(n) };
  });
  const total = n * CHECKS.length;
  const passed = rows.reduce((s, r) => s + r.pass, 0);
  const contrast = rows.find((r) => r.id === 'contrast');
  return {
    n,
    components,
    rows,
    // parts with at least one gap: the same count Components shows as Needs work
    health: n ? { pct: Math.round((passed / total) * 100), passed, total, failing: rows.filter((r) => r.missing.length), needsWork: new Set(rows.flatMap((r) => r.missing)).size } : null,
    // the gate as CHIP last ran it (/checks): its checks by name, the one source System map and Connectors read
    gate: gateFrom(checks?.gate, checks),
    contrast: n ? { pct: contrast.fill, pass: contrast.pass, of: n, toGo: contrast.missing.length, missing: contrast.missing, href: contrast.href } : null,
    gateDays: gateDays(checks),
    gateRuns: gateRuns(checks),
    gateReadAt: checks?.ciAt ?? null,
    lowest: lowestPair(pairs),
    fixCount: rows.reduce((s, r) => s + r.missing.length, 0),
  };
}

/* Figma's Gate view (767:102821): the last six days with recorded gate runs, newest first. Only what was
   recorded (her "verify them and fix it", 22 Nov): GitHub's CI runs of BELLA's branch (each runs the whole gate
   on a pushed commit) and CHIP's own runs of the gate checks (/checks log). Nothing is re-run on old commits, and
   a day with no record is not shown. Each line names its source. */
const WEEKDAY = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function gateDays(checks) {
  const by = new Map();
  const at = (iso) => {
    const k = localDay(iso);
    if (!by.has(k)) by.set(k, { iso, ci: [], chip: [] });
    return by.get(k);
  };
  for (const r of checks?.ci ?? []) if (r.status === 'completed') at(r.createdAt).ci.push(r);
  for (const r of checks?.log ?? []) at(r.ranAt).chip.push(r);
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .map(([k, d]) => {
      const ciPassed = d.ci.filter((r) => r.conclusion === 'success').length;
      const chipPassed = d.chip.filter((r) => r.ok).length;
      const failed = d.chip.filter((r) => !r.ok).map((r) => r.name);
      const runs = d.ci.length + d.chip.length;
      const passed = ciPassed + chipPassed;
      // plain words (pin 6): "57 of 58 passed, 1 failed: contracts"; the commit ids stay on the day as data, not in the text
      const commits = [...new Set(d.chip.map((r) => r.commit).filter(Boolean))];
      const line = `${passed} of ${runs} passed${runs > passed ? `, ${runs - passed} failed${failed.length ? `: ${[...new Set(failed)].join(', ')}` : ''}` : ''}`;
      return { id: k, title: WEEKDAY(d.iso), runs, passed, line, commits };
    });
}

/* The weakest text pair BELLA's gate measures (/contrast-pairs: BELLA's own list
   and ratios), against the 7:1 bar every text pair has. null when BELLA has none. */
function lowestPair(res) {
  const text = (res?.pairs ?? []).filter((p) => p.bar >= 7 && p.worst != null);
  if (!text.length) return null;
  const w = text.reduce((a, b) => (b.worst < a.worst ? b : a));
  const below = text.filter((p) => !p.ok).length;
  // a failing run prints no count ("contrast pairs: 1 failing"), so the words come from its own summary
  return { ratio: w.worst, label: w.label, bar: 7, below, checked: res.checked, declared: res.declared ?? null, failing: res.checked ? null : res.summary?.match(/(\d+) failing/)?.[1] ?? null };
}

/* BELLA's gate as CHIP last ran it: how many of its checks pass, when, and which did not, by name. */
// which BELLA the gate ran on, said on screen (coordinator, 21 Nov: a run on October's branch looked like today's)
function gateFrom(g, checks) {
  if (!g?.members?.length) return null;
  const not = (s) => g.members.filter((m) => s.includes(m.status)).map((m) => m.name);
  // the gate's date is its oldest check's, never the newest one's for all five (data check, 22 Nov): a check that
  // last ran on an older commit than BELLA's HEAD is named with its own day and commit
  const runs = (checks?.checks ?? []).filter((c) => c.gate === true && c.ranAt);
  const oldest = runs.reduce((a, c) => (!a || Date.parse(c.ranAt) < Date.parse(a.ranAt) ? c : a), null);
  const behind = runs.filter((c) => c.commit && checks?.head && c.commit !== checks.head);
  return {
    ok: g.counts.passed,
    of: g.counts.total,
    when: oldest ? day(oldest.ranAt) : g.ranAt ? day(g.ranAt) : null,
    failing: not(['failed', 'waiting']),
    notRun: not(['not-run']),
    on: checks?.base ? `${checks.base}${checks.head ? ` @ ${checks.head}` : ''}` : null,
    behind: behind.map((c) => ({ name: c.name, when: day(c.ranAt), commit: c.commit })),
  };
}

/** Reads CHIP's data (kept between pages); `model` is null only on the very first visit. */
export function useHealth() {
  const { data, error, at, loading, reload, stale, last } = useCached(['/data/bella.json', '/gaps', '/contrast-pairs', '/checks'], { live: true });
  const model = useMemo(() => (data ? healthModel({ components: data[0].components, gaps: data[1].gaps, history: data[0].history, pairs: data[2], checks: data[3] }) : null), [data]);
  const checked = at ? new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  return { model, error, loading, reload, checked, stale, last };
}

/* Hand a check's gaps to the agent (user test 21 Nov, item 2; rule: "Fix opens
   a ready plan; the job shows on Work"): BELLA's own brief for each part that
   misses the check (/gaps), as one plan, one step per part. Nothing runs until
   she approves it (templates/RunPlan.jsx); the run's card then shows in Work's
   Agent lane, where a reviewer Accepts or Undoes it. Resolves with the run, or
   null when she closes the plan. */
export async function handOff(row) {
  const r = await fetch('/gaps');
  const gaps = (await r.json().catch(() => ({}))).gaps?.[row.id] ?? {};
  const parts = row.missing.filter((name) => gaps[name]?.brief);
  if (!parts.length) throw new Error('CHIP has no brief for these yet, so there is nothing to hand over');
  const brief = [`Close BELLA's ${row.title} gap for ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}. For each:`, ...parts.map((n) => `- ${gaps[n].brief}`), 'Change only what each line names. Ask before changing a token.'].join('\n');
  const steps = parts.map((n) => ({ id: n, title: `${row.action ?? row.title}: ${n}`, line: String(gaps[n].brief).split('\n').find((l) => /^Missing:/.test(l))?.replace(/^Missing:\s*/, '') }));
  return planRun({ title: `${row.action}: ${names(parts)}`, from: 'Health', brief, steps, summary: `${row.title} check · ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} missing it` });
}
