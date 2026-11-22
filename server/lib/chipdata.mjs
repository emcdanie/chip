// Ask BELLA answers from CHIP's measured data first (Elleta, 23 Nov: "how come i cant talk to the
// agents here and get real data?? like when i ask you?"). A small read-only layer over what CHIP
// already measures, a router that picks which reads a question needs, and a prompt that gives the
// local model those results as its only context. Nothing here writes, runs a paid model or reads typed
// numbers: every fact is read from a file, a command or a check when the question is asked.
//
// A source is async (ctx) => { id, title, source, at, facts, columns, rows } or null.
//   facts: [{ label, value, ok? }]  the numbers the reply lists, each with its source and time
//   columns + rows: the real rows behind them, for "Show data" (structured, never raw markdown)
// ctx holds every reader, so tests pass fixtures; defaultCtx() is the real one.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT, BELLA_JSON, BELLA_DIR } from './config.mjs';

const iso = (ms) => new Date(ms).toISOString();
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const mtime = (f) => {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return null;
  }
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- the sources ---------- */

// On system: the guard's own verdict, the baseline it ratchets against, and how many BELLA parts the app imports.
async function onSystem(ctx) {
  const g = await ctx.guard();
  const base = ctx.baseline();
  const used = ctx.partsUsed();
  const bella = ctx.bella();
  const total = bella?.components?.length ?? null;
  const facts = [];
  if (g) facts.push({ label: 'On-system guard', value: g.ok ? 'clean: no new off-system code' : 'fails', ok: g.ok });
  const rows = [];
  if (base) {
    const files = Object.entries(base.files ?? {});
    const byKind = {};
    for (const [file, kinds] of files) for (const [k, n] of Object.entries(kinds)) (byKind[k] ??= []).push([file, n]);
    const sum = files.reduce((s, [, kinds]) => s + Object.values(kinds).reduce((a, b) => a + b, 0), 0);
    facts.push({ label: 'Old off-system constructs held by the baseline', value: `${sum} in ${plural(files.length, 'file')}` });
    for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].reduce((s, x) => s + x[1], 0) - a[1].reduce((s, x) => s + x[1], 0)))
      rows.push({ Construct: k, Count: list.reduce((s, x) => s + x[1], 0), Files: list.length });
  }
  if (used) facts.push({ label: 'BELLA parts the app uses', value: total ? `${used.length} of ${total}` : String(used.length) });
  if (!facts.length) return null;
  return { id: 'onSystem', title: 'On system', source: 'on-system guard + data/on-system-baseline.json + app/src imports', at: g?.at ?? ctx.mtimeOf('baseline') ?? ctx.now(), facts, columns: ['Construct', 'Count', 'Files'], rows, detail: g && !g.ok ? g.output : undefined };
}

async function drift(ctx) {
  const d = ctx.drift();
  if (!d) return null;
  const rows = (d.parts ?? []).filter((p) => p.differ || p.specBehind?.length || p.noSpec).slice(0, 25).map((p) => ({ Part: p.name, 'Differs from Figma': p.differ, 'Spec behind code': p.specBehind?.length ?? 0, 'No spec': p.noSpec ? 'yes' : '' }));
  return {
    id: 'drift', title: 'Drift', source: 'BELLA specs (Health · Drift)', at: d.at ? Date.parse(d.at) : ctx.now(),
    facts: [
      { label: 'Parts that drift from Figma', value: `${d.drifting} of ${d.compared} compared`, ok: d.drifting === 0 },
      { label: 'Specs behind the code', value: `${d.specBehind} parts`, ok: d.specBehind === 0 },
      { label: 'Parts with no spec yet', value: `${d.noSpec} of ${d.total}`, ok: d.noSpec === 0 },
    ],
    columns: ['Part', 'Differs from Figma', 'Spec behind code', 'No spec'], rows,
  };
}

async function gaps(ctx) {
  const g = ctx.gaps();
  if (!g) return null;
  const rows = [...g.notInCode.map((n) => ({ Part: n, Gap: 'Specified, no code part yet' })), ...g.notInBella.map((n) => ({ Part: n, Gap: 'Listed in AGENTS.md as not in BELLA yet' }))];
  return {
    id: 'gaps', title: 'Gaps', source: 'BELLA specs + AGENTS.md (Health · Gaps)', at: ctx.now(),
    facts: [{ label: 'Specified but not built', value: plural(g.notInCode.length, 'part'), ok: g.notInCode.length === 0 }, { label: 'Listed as not in BELLA yet', value: plural(g.notInBella.length, 'part'), ok: g.notInBella.length === 0 }],
    columns: ['Part', 'Gap'], rows,
  };
}

async function health(ctx) {
  const c = ctx.checks();
  const g = c?.gate;
  if (!g) return null;
  const WORD = { passed: 'passed', failed: 'failed', waiting: 'waiting on you', 'not-run': 'not run yet', running: 'running' };
  return {
    id: 'health', title: 'The gate', source: 'CHIP checks (Health · Gate)', at: g.ranAt ? Date.parse(g.ranAt) : ctx.now(),
    facts: [{ label: 'Gate checks passing', value: `${g.counts?.passed ?? 0} of ${g.counts?.total ?? g.members.length}`, ok: g.status === 'passed' }, ...(g.counts?.failed ? [{ label: 'Failing', value: String(g.counts.failed), ok: false }] : [])],
    columns: ['Check', 'Status'], rows: g.members.map((m) => ({ Check: m.name, Status: WORD[m.status] ?? m.status })),
  };
}

async function audits(ctx) {
  const a = ctx.audits();
  if (!a?.length) return null;
  const ran = a.filter((x) => x.ran);
  return {
    id: 'audits', title: 'Audits', source: 'saved reports in docs/reference/audit', at: Math.max(0, ...ran.map((x) => Date.parse(x.ran))) || ctx.now(),
    facts: ran.map((x) => ({ label: x.title, value: x.value == null ? `ran ${x.ran}` : `${x.value} ${x.unit}, ran ${x.ran}${x.prev ? `, was ${x.prev.value} on ${x.prev.day}` : ''}` })).concat(a.filter((x) => !x.ran).length ? [{ label: 'Not run', value: a.filter((x) => !x.ran).map((x) => x.title).join(', '), ok: false }] : []),
    columns: ['Audit', 'Ran', 'Score', 'First work order'], rows: a.map((x) => ({ Audit: x.title, Ran: x.ran ?? 'not run', Score: x.value == null ? '' : `${x.value} ${x.unit}`, 'First work order': x.orders?.[0] ?? '' })),
  };
}

async function history(ctx) {
  const since = ctx.since();
  const rows = ctx.commits(since);
  if (!rows) return null;
  const by = {};
  for (const r of rows) by[r.repo] = (by[r.repo] ?? 0) + 1;
  return {
    id: 'history', title: 'What changed', source: 'git log of chip-whole and bella-parts', at: ctx.now(),
    facts: [{ label: `Commits since ${ctx.sinceLabel()}`, value: String(rows.length) }, ...Object.entries(by).map(([k, n]) => ({ label: k, value: plural(n, 'commit') }))],
    columns: ['Repo', 'When', 'Change'], rows: rows.slice(0, 30).map((r) => ({ Repo: r.repo, When: r.when, Change: r.subject })),
  };
}

async function needs(ctx) {
  const n = await ctx.needs();
  if (!n?.items) return null;
  const waiting = n.items.filter((i) => /waiting/i.test(i.status ?? 'Waiting on you'));
  return {
    id: 'needs', title: 'Needs you', source: 'CHIP Needs you (git, PRs, checks)', at: ctx.now(),
    facts: [{ label: 'Items waiting on you', value: String(waiting.length), ok: waiting.length === 0 }, ...(n.gate ? [{ label: 'Gate', value: `${n.gate.passed} of ${n.gate.total} pass` }] : [])],
    columns: ['What', 'Kind', 'Risk'], rows: n.items.slice(0, 20).map((i) => ({ What: i.title, Kind: i.kind, Risk: i.risk })),
  };
}

async function contrast(ctx) {
  const cp = ctx.bella()?.gates?.contrastPairs;
  if (!cp) return null;
  const failing = (ctx.bella().components ?? []).filter((c) => c.health?.contrast?.status === 'fail');
  return {
    id: 'contrast', title: 'Contrast', source: 'data/bella.json · gates.contrastPairs', at: ctx.mtimeOf('bella') ?? ctx.now(),
    facts: [{ label: 'Contrast checks', value: `${cp.checked} across ${cp.pairs} pairs in 4 themes`, ok: cp.ok !== false }, { label: 'Parts with a failing pair', value: String(failing.length), ok: failing.length === 0 }],
    columns: ['Part', 'Failing pairs'], rows: failing.map((c) => ({ Part: c.name, 'Failing pairs': (c.health.contrast.failing ?? []).length })),
  };
}

// one part, named in the question
async function component(ctx, name) {
  const c = (ctx.bella()?.components ?? []).find((x) => x.name === name);
  if (!c) return null;
  const yes = (v) => (v ? 'yes' : 'no');
  return {
    id: 'component', title: name, source: 'data/bella.json (Components)', at: ctx.mtimeOf('bella') ?? ctx.now(),
    facts: [
      { label: 'Story', value: yes(c.hasStory), ok: !!c.hasStory }, { label: 'Docs page', value: yes(c.hasDocs), ok: !!c.hasDocs },
      { label: 'Contract', value: yes(c.hasContract), ok: !!c.hasContract }, { label: 'A11y notes', value: yes(c.hasA11yNotes), ok: !!c.hasA11yNotes },
      { label: 'Contrast', value: c.health?.contrast?.status ?? 'not measured', ok: c.health?.contrast?.status === 'pass' },
      { label: 'Used by the app', value: ctx.partsUsed()?.includes(name) ? 'yes' : 'no' },
    ],
    columns: ['Field', 'Value'], rows: [['Category', c.category], ['Variants', (c.variants ?? []).join(', ') || 'none'], ['Props', (c.props ?? []).length], ['Tokens', c.tokens?.count ?? 0]].map(([Field, Value]) => ({ Field, Value })),
  };
}

// the data sweep: every number CHIP shows, recomputed and compared (scripts/data-sweep.mjs), read from its last results
async function sweep(ctx) {
  const r = ctx.sweep();
  if (!r) return null;
  const list = r.results ?? [];
  const bad = list.filter((x) => x.ok === false);
  return {
    id: 'sweep', title: 'Data sweep', source: 'data-sweep results.json', at: r.at,
    facts: [{ label: 'Numbers that match their source', value: `${list.length - bad.length} of ${list.length}`, ok: bad.length === 0 }],
    columns: ['Number', 'Page', 'Shown', 'Measured'], rows: bad.slice(0, 20).map((x) => ({ Number: x.what ?? '', Page: x.page ?? '', Shown: x.shown ?? '', Measured: x.truth ?? '' })),
  };
}

// designed-features.md: how many designed features are present, partly, waiting, broken
async function designed(ctx) {
  const t = ctx.designedText();
  if (!t) return null;
  const lines = t.text.split('\n').filter((l) => /^- \*\*/.test(l));
  const count = (re) => lines.filter((l) => re.test(l.slice(-90))).length;
  const states = { present: count(/\bpresent\b/i), restored: count(/\brestored\b/i), partly: count(/\bpartly\b/i), 'waits on BELLA': count(/waits? on bella/i), broken: count(/\bbroken\b/i), missing: count(/\bmissing\b/i) };
  return {
    id: 'designed', title: 'Designed features', source: 'docs/reference/designed-features.md', at: t.at,
    facts: [{ label: 'Designed features listed', value: String(lines.length) }, ...Object.entries(states).filter(([, n]) => n).map(([k, n]) => ({ label: k[0].toUpperCase() + k.slice(1), value: String(n), ok: k === 'present' || k === 'restored' ? true : false }))],
    columns: ['State', 'Features'], rows: Object.entries(states).map(([State, Features]) => ({ State, Features })),
  };
}

export const SOURCES = { onSystem, drift, gaps, health, audits, history, needs, contrast, sweep, designed };

/* ---------- the router ---------- */

const TOPICS = [
  ['onSystem', /\bon[- ]system\b|\boff[- ]system\b|\bbella[- ]only\b|\busing (its|the|bella'?s?) (own )?(components|parts)\b|\bguard\b|\bbaseline\b|\bbuilt from bella\b|\bcomponents? (is|are) (it|chip) using\b|\bparts? (used|in use)\b/i],
  ['drift', /\bdrift\w*\b|\bout of sync\b|\bspec (is )?behind\b/i],
  ['gaps', /\bgaps?\b|\bnot (built|in bella)\b|\bcan'?t do yet\b/i],
  ['health', /\bhealth\b|\bgate\b|\bchecks\b|\bpassing\b|\bfailing\b|\bgreen\b|\bci\b/i],
  ['audits', /\baudits?\b|\binspections?\b|\bscores?\b|\bratings?\b/i],
  ['history', /\bwhat changed\b|\bchanged\b|\btoday\b|\byesterday\b|\bthis week\b|\brecent(ly)?\b|\bcommits?\b|\bhistory\b|\bshipped\b|\bwhat happened\b/i],
  ['needs', /\bneed(s)? (me|you|elleta)\b|\bwaiting on (me|you)\b|\bblocked\b|\bmy review\b|\bto ?do\b|\bpull requests?\b|\bprs?\b|\bwhat (should|do) i\b/i],
  ['contrast', /\bcontrast\b|\bwcag\b|\baaa\b|\b7:1\b/i],
  ['sweep', /\bdata sweep\b|\bsweep\b|\b(is|are) (the|these) (numbers|data)\b|\breal data\b|\bnumbers (right|correct|match)\b/i],
  ['designed', /\bdesigned\b|\bfeatures?\b|\bapproved screens?\b/i],
];
export const TOPIC_IDS = [...TOPICS.map(([id]) => id), 'component'];
const MAX_SOURCES = 3;

/** The source ids a question needs, by keywords; the part named in it, if any. */
export function classify(question, partNames = []) {
  const q = String(question ?? '');
  const ids = TOPICS.filter(([, re]) => re.test(q)).map(([id]) => id);
  const part = partNames.find((n) => new RegExp(`\\b${n}\\b`, 'i').test(q)) ?? null;
  // a part named in the question is its own source, unless the question is about the whole app
  if (part && !ids.includes('onSystem')) ids.unshift('component');
  return { ids: ids.slice(0, MAX_SOURCES), part };
}

/** When keywords find nothing: the local model picks ids from the list, or none. `pick` is injectable for tests. */
export async function pickWithModel(question, pick) {
  if (!pick) return [];
  try {
    const out = await pick(`Pick which of these CHIP data sources a question needs: ${TOPICS.map(([id]) => id).join(', ')}. Answer with the ids only, comma separated, or "none" if the question is not about CHIP's own measured data.\nQuestion: ${question}`);
    return String(out).toLowerCase().split(/[^a-z]+/i).map((x) => TOPICS.find(([id]) => id.toLowerCase() === x)?.[0]).filter(Boolean).slice(0, MAX_SOURCES);
  } catch {
    return [];
  }
}

/** Run the reads a question needs. Returns { ids, results: [source result], failed: [ids that threw or had no data] }. */
export async function gather(question, ctx, { pick } = {}) {
  const names = (ctx.bella()?.components ?? []).map((c) => c.name);
  let { ids, part } = classify(question, names);
  if (!ids.length) ids = await pickWithModel(question, pick);
  const results = [];
  const failed = [];
  for (const id of ids) {
    try {
      const r = id === 'component' ? await component(ctx, part) : await SOURCES[id](ctx);
      if (r) results.push(r);
      else failed.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { ids, results, failed };
}

/* ---------- the prompt ---------- */

export const DATA_SYSTEM = `You are BELLA, the assistant inside CHIP, for Elleta, who runs the BELLA design system.

Answer ONLY from the DATA block in the message. Rules:
- Two or three short sentences, plain words, no headings, no lists, no emoji, no offers. Start with the answer and its number; never explain what a word means.
- Say the numbers exactly as the DATA gives them, with the source's name and when it was measured ("measured 16:49").
- If the DATA does not answer the question, say "I don't have data for that." and stop.
- Never guess, never add general knowledge, never quote a document.
- Never write numbers that are not in the DATA.`;

const hhmm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const measured = (ms) => `measured ${hhmm(ms)}`;

/** The DATA block: one section per source, its facts with their measured time. */
export function dataPrompt(question, results) {
  const blocks = results.map((r) => [`## ${r.title} (source: ${r.source}, ${measured(r.at)})`, ...r.facts.map((f) => `- ${f.label}: ${f.value}`)].join('\n'));
  return `DATA\n\n${blocks.join('\n\n')}\n\nQuestion: ${question}`;
}

/** What the reply carries for the page: the sources, the numbers with where and when, and the real rows. */
export function shapeData(results) {
  return {
    sources: results.map((r, i) => ({ n: i + 1, title: r.title, path: r.source, when: iso(r.at), score: 1, findings: r.facts.slice(0, 6).map((f) => ({ text: `${f.label}: ${f.value}`, ok: f.ok })) })),
    data: results.map((r, i) => ({ n: i + 1, title: r.title, source: r.source, when: iso(r.at), measured: measured(r.at), facts: r.facts, columns: r.columns, rows: r.rows })),
  };
}

// a reply a model wrote about numbers must not hold a number the data does not: checked before it is shown
export function numbersHeld(reply, results) {
  const known = new Set(results.flatMap((r) => [...r.facts.map((f) => `${f.value}`), hhmm(r.at), ...r.rows.flatMap((x) => Object.values(x).map(String))]).join(' ').match(/\d+/g) ?? []);
  return (String(reply).match(/\d+/g) ?? []).every((n) => known.has(n));
}

// no model: the same answer from the facts alone (a model that is off, or one that wrote an unknown number)
export function plainReply(results) {
  return results.map((r) => `${r.title}: ${r.facts.slice(0, 3).map((f) => `${f.label.toLowerCase()} ${f.value}`).join('; ')}.`).join(' ');
}

export const NO_DATA = "I don't have data for that.";

/* ---------- the real readers ---------- */

let guardCache = null;
function runGuard() {
  if (guardCache && Date.now() - guardCache.at < 60_000) return guardCache;
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/on-system-guard.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  guardCache = { at: Date.now(), ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(0, 600) };
  return guardCache;
}

const REPOS = [['chip-whole', ROOT], ['bella-parts', BELLA_DIR]];
function gitCommits(since) {
  const out = [];
  for (const [repo, dir] of REPOS) {
    try {
      const text = execFileSync('git', ['-C', dir, 'log', `--since=${since}`, '--no-merges', '--format=%h\t%ct\t%s'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
      for (const l of text.split('\n').filter(Boolean)) {
        const [, ct, ...s] = l.split('\t');
        out.push({ repo, t: +ct * 1000, when: hhmm(+ct * 1000), subject: s.join(' ').split(/\s[:.]\s|: /)[0].slice(0, 110) });
      }
    } catch {}
  }
  return out.sort((a, b) => b.t - a.t);
}

function importedParts(src) {
  const found = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/@bella\/components\/(\w+)\//g)) found.add(m[1]);
    }
  };
  if (existsSync(src)) walk(src);
  return [...found].sort();
}

export function defaultCtx(deps = {}) {
  const midnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const files = { baseline: join(ROOT, 'data/on-system-baseline.json'), bella: BELLA_JSON };
  return {
    now: () => Date.now(),
    mtimeOf: (k) => mtime(files[k]),
    guard: async () => runGuard(),
    baseline: () => readJson(files.baseline),
    bella: () => readJson(files.bella),
    partsUsed: () => importedParts(join(ROOT, 'app/src')),
    drift: () => deps.drift?.() ?? null,
    gaps: () => deps.gaps?.() ?? null,
    checks: () => deps.checks?.() ?? null,
    audits: () => deps.audits?.() ?? null,
    needs: async () => (await deps.needs?.()) ?? null,
    since: () => midnight().toISOString(),
    sinceLabel: () => 'midnight',
    commits: (since) => gitCommits(since),
    sweep: () => {
      const f = join(process.env.TMPDIR || '/tmp', 'chip-data-sweep/results.json');
      const results = readJson(f);
      return Array.isArray(results) ? { results, at: mtime(f) } : results ? { ...results, at: mtime(f) } : null;
    },
    designedText: () => {
      const f = join(homedir(), 'DEV/chip/docs/reference/designed-features.md');
      return existsSync(f) ? { text: readFileSync(f, 'utf8'), at: mtime(f) } : null;
    },
  };
}
