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

// How it was built: what the record says, never what sounds likely. Order from the git logs, rules from the
// dated CLAUDE.md / maintaining.md headings, where it is written down from the files' own dates. "Who" is the
// co-author line on commits; where that is the record it says an agent built it from Elleta's rules.
async function built(ctx) {
  const b = ctx.builtInfo();
  if (!b) return null;
  const day = (d) => (d ? String(d).slice(0, 10) : 'unknown date');
  const facts = [];
  for (const r of b.repos ?? []) facts.push({ label: `Order made: ${r.name}`, value: `first commit ${day(r.first?.date)} ("${r.first?.subject ?? ''}"), ${r.count} commits since, latest ${day(r.last?.date)}` });
  const all = (b.repos ?? []).reduce((a, r) => a + r.count, 0);
  const co = (b.repos ?? []).reduce((a, r) => a + r.coAuthored, 0);
  if (all) facts.push({ label: 'Who made it', value: `${co} of ${all} commits carry a Claude co-author line: an agent built it from Elleta's rules` });
  for (const r of b.rules ?? []) facts.push({ label: `Rules that shaped it: ${r.file}`, value: `${r.count} ${r.kind}${r.latest ? `, latest "${r.latest.title}" (${r.latest.date})` : ''}` });
  for (const d of b.docs ?? []) facts.push({ label: `Documented in ${d.name}`, value: `${d.what}, updated ${day(d.at)}` });
  if (!facts.length) return null;
  // three short blocks, written from the facts (no model: the record is the answer)
  const first = (b.repos ?? []).map((r) => `${r.name} ${day(r.first?.date)}`).join(', ');
  const latest = (b.repos ?? []).map((r) => day(r.last?.date)).sort().at(-1);
  const rulesLine = (b.rules ?? []).map((r) => `${r.file} (${r.count} ${r.kind}${r.latest ? `, latest ${r.latest.date}` : ''})`).join('; ');
  const docsLine = (b.docs ?? []).map((d) => d.name).join(', ');
  const reply = [
    all ? `**${co} of ${all} commits** carry a Claude co-author line: an agent built it from Elleta's rules.` : "The record doesn't say who made it.",
    `- Order: first commits ${first}; the latest is ${latest}.`,
    `- Rules: ${rulesLine || 'none found'}.`,
    `- Documented: ${docsLine || 'nowhere I can read'}.`,
  ].join('\n');
  return {
    reply, id: 'built', title: 'How it was built', source: 'git logs, CLAUDE.md, maintaining.md, decisions-while-away.md, handoff.md, docs/plans',
    at: ctx.now(), facts,
    columns: ['Block', 'Source', 'Date', 'What'],
    rows: [
      ...(b.repos ?? []).flatMap((r) => [{ Block: 'Order', Source: `${r.name} git log`, Date: day(r.first?.date), What: `first: ${r.first?.subject ?? ''}` }, { Block: 'Order', Source: `${r.name} git log`, Date: day(r.last?.date), What: `latest: ${r.last?.subject ?? ''}` }]),
      ...(b.rules ?? []).flatMap((r) => (r.recent ?? []).map((x) => ({ Block: 'Rules', Source: r.file, Date: x.date, What: x.title }))),
      ...(b.docs ?? []).map((d) => ({ Block: 'Documented', Source: d.name, Date: day(d.at), What: d.what })),
    ],
  };
}

// Where the gaps are and how to improve, as a short ranked list from what CHIP already measures
async function improve(ctx) {
  const items = [];
  const rep = ctx.onSystemReport();
  for (const t of rep?.red ?? []) items.push({ item: t, source: 'on-system report (Red)' });
  for (const a of (ctx.audits() ?? []).filter((x) => x.ran && x.orders?.length).sort((x, y) => (x.value ?? 100) - (y.value ?? 100)).slice(0, 2)) items.push({ item: `${a.title} (${a.value ?? '?'} ${a.unit ?? ''}): ${a.orders[0]}`, source: `${a.title} audit, ${a.ran}` });
  const d = ctx.drift();
  if (d?.drifting) items.push({ item: `${d.drifting} of ${d.compared} compared parts drift from Figma`, source: 'Drift' });
  const g = ctx.gaps();
  if (g?.notInCode?.length) items.push({ item: `${g.notInCode.length} specified parts have no code part yet`, source: 'Gaps' });
  const t = ctx.designedText();
  if (t) {
    const lines = t.text.split('\n').filter((l) => /^- \*\*/.test(l));
    const n = (re) => lines.filter((l) => re.test(l.slice(-90))).length;
    const open = n(/\bmissing\b/i) + n(/\bbroken\b/i) + n(/\bpartly\b/i);
    if (open) items.push({ item: `${open} designed features are partly built, missing or broken`, source: 'designed-features.md' });
  }
  const board = ctx.board();
  if (board?.waiting) items.push({ item: `${board.waiting} board items wait on Elleta${board.todo ? `, ${board.todo} still to do` : ''}`, source: 'project board' });
  if (!items.length) return null;
  const top = items.slice(0, 6);
  const reply = `**${items.length} things to improve**, most valuable first: ${items[0].item}.\n${items.slice(1, 3).map((x, i) => `- ${i + 2}: ${x.item}.`).join('\n')}\n- The rest is listed below, each with its source.`;
  return {
    reply, id: 'improve', title: 'Gaps and how to improve', source: 'on-system report, audits, drift, gaps, designed-features.md, project board',
    at: ctx.now(), facts: top.map((x, i) => ({ label: `${i + 1}`, value: `${x.item} (${x.source})` })),
    columns: ['Rank', 'Item', 'Source'], rows: items.map((x, i) => ({ Rank: i + 1, Item: x.item, Source: x.source })),
  };
}

export const SOURCES = { onSystem, drift, gaps, health, audits, history, needs, contrast, sweep, designed, built, improve };

/* ---------- the router ---------- */

const TOPICS = [
  ['built', /\bhow (did|was|were|has)\b.*\b(build|built|made|make|create[d]?)\b|\bwho (built|made|wrote)\b|\bhow it was (built|made)\b|\bhow elleta (built|made)\b|\bwhere (is|are) it documented\b/i],
  ['improve', /\bgaps?\b.*\bimprov\w*|\bimprov\w*\b|\bwhat should (we|i) (fix|do|improve)\b|\bwhat'?s (missing|next)\b|\bhow can we (get better|improve)\b/i],
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
  let ids = TOPICS.filter(([, re]) => re.test(q)).map(([id]) => id);
  // the two overview questions carry their own parts: no second source repeats what they already list
  if (ids.includes('built')) ids = ['built'];
  else if (ids.includes('improve')) ids = ids.filter((x) => !['gaps', 'drift', 'audits', 'designed'].includes(x));
  const part = partNames.find((n) => new RegExp(`\\b${n}\\b`, 'i').test(q)) ?? null;
  // a part named in the question is its own source, unless the question is about the whole app
  if (part && !ids.includes('onSystem') && !ids.includes('built')) ids.unshift('component');
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
  if (results.length === 1 && results[0].reply) return results[0].reply;
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


const DOCS = join(homedir(), 'DEV/chip/docs/reference');
// the dated rules in a markdown file: "## Title (Elleta, 12 Nov 2026 ...)" -> { title, date }
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
export function datedHeadings(text) {
  const out = [];
  for (const l of String(text).split('\n')) {
    const h = l.match(/^#{2,3}\s+(.+?)\s*\(([^)]*?(\d{1,2}) ([A-Z][a-z]{2})[a-z]* (20\d\d)[^)]*)\)\s*$/);
    if (h) out.push({ title: h[1].replace(/\*\*/g, ''), date: `${h[5]}-${MONTHS[h[4].toLowerCase()] ?? '00'}-${h[3].padStart(2, '0')}` });
  }
  return out;
}
const sections = (text) => String(text).split('\n').filter((l) => /^#{2,3}\s/.test(l)).length;
function gitRepo(name, dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'log', '--no-merges', '--format=%ad\t%s\t%b%x00', '--date=short'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const commits = out.split('\0').map((c) => c.replace(/^\n/, '')).filter(Boolean).map((c) => { const [date, subject, ...b] = c.split('\t'); return { date, subject: subject.slice(0, 90), co: /Co-Authored-By:\s*Claude/i.test(b.join('\t')) }; });
    if (!commits.length) return null;
    return { name, count: commits.length, coAuthored: commits.filter((c) => c.co).length, first: commits.at(-1), last: commits[0] };
  } catch {
    return null;
  }
}
function builtInfo() {
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
  const repos = [['CHIP', ROOT], ['BELLA', BELLA_DIR]].map(([n, d]) => (existsSync(d) ? gitRepo(n, d) : null)).filter(Boolean);
  const rules = [];
  const chipRules = read(join(ROOT, 'CLAUDE.md'));
  if (chipRules) { const h = datedHeadings(chipRules); rules.push({ file: 'CHIP CLAUDE.md', kind: 'dated rules', count: h.length, latest: h.sort((a, b) => b.date.localeCompare(a.date))[0], recent: h.slice(0, 4) }); }
  const maint = read(join(BELLA_DIR, 'docs/agents/maintaining.md'));
  if (maint) { const h = datedHeadings(maint); rules.push({ file: 'BELLA maintaining.md', kind: `sections, ${h.length} dated`, count: sections(maint), latest: h.sort((a, b) => b.date.localeCompare(a.date))[0], recent: h.slice(0, 3) }); }
  const agents = read(join(BELLA_DIR, 'AGENTS.md'));
  if (agents) rules.push({ file: 'BELLA AGENTS.md', kind: 'sections', count: sections(agents), recent: [] });
  const docs = [];
  const add = (name, f, what) => { const at = mtime(f); if (at) docs.push({ name, at: iso(at), what }); };
  const dec = read(join(DOCS, 'decisions-while-away.md'));
  if (dec) docs.push({ name: 'decisions-while-away.md', at: iso(mtime(join(DOCS, 'decisions-while-away.md'))), what: `${(dec.match(/^- 20\d\d-/gm) ?? []).length} decisions, one line each: what, why, how to undo` });
  add('handoff.md', join(DOCS, 'inbox/handoff.md'), 'done, next, blockers, files, branch');
  const plans = join(homedir(), 'DEV/chip/docs/plans');
  if (existsSync(plans)) add('docs/plans', plans, `${readdirSync(plans).filter((f) => f.endsWith('.md')).length} plan files`);
  add('designed-features.md', join(DOCS, 'designed-features.md'), 'every approved feature, with its source and state');
  const specs = join(BELLA_DIR, 'specs/components');
  if (existsSync(specs)) add('specs/components', specs, `${readdirSync(specs).filter((f) => f.endsWith('.spec.yaml')).length} component specs`);
  return { repos, rules, docs };
}
// the newest saved on-system report: its Red findings, first sentence each
function onSystemReport() {
  const base = process.env.CHIP_AUDIT_DIR || join(DOCS, 'audit');
  if (!existsSync(base)) return null;
  for (const day of readdirSync(base).filter((d) => /^\d{4}-/.test(d)).sort().reverse()) {
    const f = join(base, day, 'chip-on-system.md');
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const red = text.split(/^### Red\s*$/m)[1]?.split(/^### /m)[0] ?? '';
    return { day, red: red.split('\n').filter((l) => /^- /.test(l)).map((l) => l.replace(/^- \*\*(.+?)\*\*.*$/, '$1').replace(/\.$/, '')).slice(0, 3) };
  }
  return null;
}
function boardCounts() {
  const j = readJson(join(DOCS, 'screens/progress/progress.json'));
  if (!j?.items) return null;
  const n = (st) => j.items.filter((i) => i.stage === st).length;
  return { waiting: n('Waiting on you'), todo: n('To do'), building: n('Building') };
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
    builtInfo,
    onSystemReport,
    board: boardCounts,
    designedText: () => {
      const f = join(homedir(), 'DEV/chip/docs/reference/designed-features.md');
      return existsSync(f) ? { text: readFileSync(f, 'utf8'), at: mtime(f) } : null;
    },
  };
}
