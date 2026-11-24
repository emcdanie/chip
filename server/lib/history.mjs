// History (phase 6, 3 Nov late): what was agreed and changed, from BELLA's
// decision records, its CHANGELOG and git log, CHIP's git log, and CHIP's
// own action log (Accept / Undo from review cards). Search is plain words:
// a component name, a type word ("decision", "visual", "contract", "fix"),
// "breaking", a month, or anything else, matched against title and body.
// Nothing here calls a model.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE } from './checks.mjs';
import { readActions } from './review.mjs';

const git = (dir, args) => execFileSync('git', ['-C', dir, '--no-optional-locks', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
export const TYPES = ['Decision', 'Visual', 'Contract', 'Tokens', 'Fix', 'Docs', 'Tooling'];

function components() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8')).components.map((c) => c.name);
  } catch {
    return [];
  }
}

function typeOf(subject, files = []) {
  const s = subject.toLowerCase();
  if (/^fix|\bfix\b/.test(s)) return 'Fix';
  if (files.includes('tokens/contracts.json') || /contract|props?\b|api\b/.test(s)) return 'Contract';
  if (/^feat\(tokens\)|token|colour|color|theme|oklch|contrast/.test(s) || files.some((f) => f.startsWith('tokens/'))) return 'Tokens';
  if (/^docs|readme|guidance/.test(s)) return 'Docs';
  if (/^(chore|ci|build|test)/.test(s)) return 'Tooling';
  return 'Visual';
}

const SEP = '\x1f';
// every commit, so "All" is all (data check, 22 Nov: CHIP's newest 400 of 467 showed as All)
const logArgs = (ref) => ['log', ref, '--no-merges', '--date=iso-strict', `--format=%h${SEP}%ad${SEP}%an${SEP}%s${SEP}%b${SEP}`, '--name-only'];
function gitRecords(dir, repo, ref, raw = git(dir, logArgs(ref))) {
  const sep = SEP;
  const out = [];
  for (const block of raw.split(/\n(?=[0-9a-f]{7,}\x1f)/)) {
    const parts = block.split(sep);
    if (parts.length < 6) continue;
    const [sha, date, who, subject, body, rest] = parts;
    const files = rest.trim().split('\n').filter(Boolean);
    out.push({
      id: `${repo}:${sha.trim()}`,
      source: repo === 'bella' ? 'BELLA git' : 'CHIP git',
      repo,
      sha: sha.trim(),
      date,
      who,
      // the conventional prefix goes, its scope stays as words, so two "Built to the published Figma" records say which page ("Health: built to …")
      title: glyphWords(subject.replace(/^\w+(?:\(([^)]*)\))?!?:\s*/, (_, scope) => (scope ? `${scope.replace(/[-_]/g, ' ')}: ` : '')).replace(/^./, (c) => c.toUpperCase())),
      subject,
      why: glyphWords(body.trim().split('\n\n')[0] || null),
      type: typeOf(subject, files),
      breaking: /!:|BREAKING/.test(subject + body),
      status: 'Merged',
      files,
    });
  }
  return out;
}

/* UI glyphs written into a commit or changelog sentence ("ends in the ↗ that
   means open") read on the page as a stray open arrow inside the text; the
   arrow belongs at a row's end, never inside a sentence (Elleta, 22 Nov). In
   a record's words each glyph is named instead. */
const GLYPH_WORDS = [[/↗/g, 'up-right arrow'], [/›/g, 'chevron'], [/[→⇢]/g, 'to'], [/[↵⏎]/g, 'Return key']];
export const glyphWords = (t) => (t == null ? t : GLYPH_WORDS.reduce((s, [re, w]) => s.replace(re, w), String(t)));

function changelogRecords() {
  const file = join(BELLA, 'CHANGELOG.md');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const out = [];
  let release = 'Unreleased';
  for (const sec of text.split(/\n(?=##+ )/)) {
    const h2 = sec.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
    if (h2) {
      release = h2[1];
      continue;
    }
    const h3 = sec.match(/^### (.+?)(?: \((\d{4}-\d{2}-\d{2})\))?\n([\s\S]*)/);
    if (!h3 || !h3[2]) continue; // undated "Added"/"Changed" groups belong to a release block
    const body = h3[3].trim();
    out.push({
      id: `changelog:${h3[2]}:${h3[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
      source: 'BELLA changelog',
      repo: 'bella',
      date: `${h3[2]}T12:00:00`,
      who: null,
      title: glyphWords(h3[1]),
      why: glyphWords(body.split('\n').find((l) => l.trim())?.replace(/^- /, '').replace(/\*\*/g, '') ?? null),
      body,
      type: /token|colour|ground|oklch|theme|highlight/i.test(h3[1] + body.slice(0, 300)) ? 'Tokens' : 'Visual',
      breaking: /BREAKING/.test(body),
      status: release === 'Unreleased' ? 'Merged' : 'Shipped',
      release,
    });
  }
  return out;
}

function decisionRecords() {
  const dir = join(BELLA, 'docs/decisions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const body = readFileSync(join(dir, f), 'utf8');
    const date = f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date(statSync(join(dir, f)).mtimeMs).toISOString().slice(0, 10);
    const title = body.match(/^# (.+?)(?: · .*)?$/m)?.[1] ?? f;
    const why = body.match(/\*\*Decision[^*]*\*\*:?\s*(.+)/)?.[1] ?? body.split('\n\n')[1] ?? null;
    return { id: `decision:${f}`, source: 'Decision record', repo: 'bella', path: `docs/decisions/${f}`, date: `${date}T12:00:00`, who: 'Elleta', title: glyphWords(title), why: glyphWords(why), body, type: 'Decision', breaking: false, status: 'Decided' };
  });
}

function actionRecords() {
  const all = readActions();
  const undone = new Set(all.filter((a) => a.kind === 'undo').map((a) => a.sha));
  // an agent run's Accept is logged as "keep" (runs.mjs, no check id); a review card's keep follows its own
  // "accept", so only the run's counts, once
  const accepted = (a) => a.kind === 'accept' || (a.kind === 'keep' && !a.check);
  return all.filter((a) => accepted(a) || a.kind === 'undo').map((a, i) => ({
    id: `chip:${a.kind}:${i}`,
    source: 'CHIP review card',
    repo: 'bella',
    sha: a.sha,
    date: a.at,
    who: 'Elleta, in CHIP',
    title: accepted(a) ? `Accepted: ${a.title}` : `Undone: ${a.title}`,
    why: accepted(a) ? `${a.sentence ?? ''} On local branch ${a.branch} (${a.sha}), gate green; ${a.base} unchanged.${undone.has(a.sha) ? ' Undone later.' : ''}` : `Undid the Accept: deleted local branch ${a.branch} (${a.sha}). ${a.base} never moved.`,
    type: 'Fix',
    breaking: false,
    status: accepted(a) && !undone.has(a.sha) ? 'On a branch' : 'Undone',
    branch: a.branch,
    files: a.files ?? [],
    measured: a.measured ?? null,
  }));
}

let cache = { key: null, records: [] };
// when readyHistory last confirmed the cache against both repos: within this, allRecords answers from the cache
// without asking git again (two synchronous rev-parses on every request)
let checkedAt = 0;
let building = null;
const FRESH_MS = 5000;

function buildRecords(bellaLog, chipLog) {
  const names = components();
  const records = [...decisionRecords(), ...changelogRecords(), ...gitRecords(BELLA, 'bella', BASE, bellaLog), ...gitRecords(ROOT, 'chip', 'HEAD', chipLog), ...actionRecords()].map((r) => {
    const text = `${r.title} ${r.why ?? ''} ${r.body ?? ''} ${(r.files ?? []).join(' ')}`;
    const comps = names.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    return { ...r, components: comps.slice(0, 6), text: text.toLowerCase() };
  });
  records.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return records;
}

function allRecords() {
  if (cache.records.length && Date.now() - checkedAt < FRESH_MS) return cache.records;
  const key = [git(BELLA, ['rev-parse', BASE]).trim(), git(ROOT, ['rev-parse', 'HEAD']).trim(), readActions().length].join(':');
  if (cache.key === key) return cache.records;
  cache = { key, records: buildRecords() };
  return cache.records;
}

/* The routes' way in (24 Nov: Health's Audits page waited about 10 s on :3160 because BELLA's full git log, 1.6 s,
   was read synchronously and held every other request). Git is asked without blocking the server, both repos at
   once; once records exist, a newer commit rebuilds them in the background while the last ones are served, so no
   request waits on the log after the first. */
const gitAsync = (dir, args) =>
  new Promise((ok, fail) => execFile('git', ['-C', dir, '--no-optional-locks', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }, (e, out) => (e ? fail(e) : ok(out))));
export async function readyHistory() {
  const [bella, chip] = await Promise.all([gitAsync(BELLA, ['rev-parse', BASE]), gitAsync(ROOT, ['rev-parse', 'HEAD'])]);
  const key = [bella.trim(), chip.trim(), readActions().length].join(':');
  if (cache.key === key) {
    checkedAt = Date.now();
    return;
  }
  building ??= Promise.all([gitAsync(BELLA, logArgs(BASE)), gitAsync(ROOT, logArgs('HEAD'))])
    .then(([bellaLog, chipLog]) => {
      cache = { key, records: buildRecords(bellaLog, chipLog) };
      checkedAt = Date.now();
    })
    .finally(() => {
      building = null;
    });
  if (cache.records.length) {
    checkedAt = Date.now(); // the last records stand while the new ones are read
    return;
  }
  await building;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const TYPE_WORDS = { decision: 'Decision', decisions: 'Decision', decided: 'Decision', visual: 'Visual', visuals: 'Visual', contract: 'Contract', contracts: 'Contract', api: 'Contract', token: 'Tokens', tokens: 'Tokens', colour: 'Tokens', color: 'Tokens', fix: 'Fix', fixes: 'Fix', fixed: 'Fix', docs: 'Docs', guidance: 'Docs' };
const STOP = new Set('a an the in on of to for and or what when why how did does do we was is are change changed changes since about show me all any with from by that this which last'.split(' '));

/** Turns plain words into filters, the way the mock's search does. */
export function parse(q) {
  const words = String(q ?? '').toLowerCase().match(/[\p{L}\p{N}#.-]+/gu) ?? [];
  const names = components();
  const parsed = { components: [], types: [], since: null, breaking: false, repo: null, terms: [] };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const comp = names.find((n) => n.toLowerCase() === w.replace(/'s$/, ''));
    if (comp) parsed.components.push(comp);
    else if (TYPE_WORDS[w]) parsed.types.push(TYPE_WORDS[w]);
    else if (w === 'breaking') parsed.breaking = true;
    else if (MONTHS.includes(w) || MONTHS.some((m) => m.slice(0, 3) === w)) {
      const m = MONTHS.findIndex((x) => x === w || x.slice(0, 3) === w);
      const now = new Date();
      const y = m > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      parsed.since = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    } else if (w === 'chip' || w === 'bella') parsed.repo = w;
    else if (!STOP.has(w) && w.length > 1) parsed.terms.push(w);
  }
  parsed.components = [...new Set(parsed.components)];
  parsed.types = [...new Set(parsed.types)];
  return parsed;
}

/** GET /history?q=&type=&component=&since=&breaking=&repo=&sort= */
export function searchHistory(query) {
  const q = query.q ?? '';
  const p = parse(q);
  const list = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).filter(Boolean);
  const f = {
    types: [...new Set([...p.types, ...list(query.type)])],
    components: [...new Set([...p.components, ...list(query.component)])],
    since: query.since || p.since,
    breaking: query.breaking === '1' || query.breaking === 'true' || p.breaking,
    repo: query.repo || p.repo,
    status: list(query.status),
  };
  const all = allRecords();
  const match = (r, skip) => {
    if (skip !== 'types' && f.types.length && !f.types.includes(r.type)) return false;
    if (skip !== 'components' && f.components.length && !f.components.some((c) => r.components.includes(c))) return false;
    if (f.since && r.date < f.since) return false;
    if (skip !== 'breaking' && f.breaking && !r.breaking) return false;
    if (f.repo && r.repo !== f.repo && !(f.repo === 'chip' && r.source === 'CHIP review card')) return false;
    if (skip !== 'status' && f.status.length && !f.status.includes(r.status)) return false;
    return p.terms.every((t) => r.text.includes(t)) || (p.terms.length > 1 && p.terms.filter((t) => r.text.includes(t)).length >= Math.ceil(p.terms.length * 0.6));
  };
  let records = all.filter((r) => match(r));
  if (p.terms.length) records = records.map((r) => ({ r, s: p.terms.filter((t) => r.title.toLowerCase().includes(t)).length * 3 + p.terms.filter((t) => r.text.includes(t)).length })).sort((a, b) => b.s - a.s || Date.parse(b.r.date) - Date.parse(a.r.date)).map((x) => x.r);
  if (query.sort === 'oldest') records = [...records].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  // counts for the quick chips and the drawer: what each option would show,
  // with every other filter as it is (so a count always matches its results)
  const typeCounts = Object.fromEntries(TYPES.map((t) => [t, all.filter((r) => match(r, 'types') && r.type === t).length]));
  const compCounts = {};
  for (const r of all.filter((x) => match(x, 'components'))) for (const c of r.components) compCounts[c] = (compCounts[c] ?? 0) + 1;
  const statusCounts = {};
  for (const r of all.filter((x) => match(x, 'status'))) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return {
    q,
    parsed: p,
    filters: f,
    total: all.length,
    count: records.length,
    counts: { types: typeCounts, anyType: all.filter((r) => match(r, 'types')).length, components: compCounts, status: statusCounts, breaking: all.filter((r) => match(r, 'breaking') && r.breaking).length },
    // as many as the page asks for (History asks 400 and shows 10 at a time), never more than 1000; 80 when it doesn't say
    records: records.slice(0, Math.min(Number(query.limit) || 80, 1000)).map(({ text, body, ...r }) => ({ ...r, files: (r.files ?? []).slice(0, 12) })),
    timeline: records.slice(0, 60).map((r) => ({ id: r.id, date: r.date, title: r.title, type: r.type })),
  };
}

/** GET /history/record?id= : the full record, with the diff for a commit. */
export function historyRecord(id) {
  const r = allRecords().find((x) => x.id === id);
  if (!r) return null;
  const { text, ...rec } = r;
  if (r.sha && (r.source === 'BELLA git' || r.source === 'CHIP git')) {
    const dir = r.repo === 'bella' ? BELLA : ROOT;
    rec.body = git(dir, ['log', '-1', '--format=%B', r.sha]).trim();
    rec.stat = git(dir, ['show', '--stat', '--format=', r.sha]).trim();
    rec.diff = git(dir, ['show', '--format=', '--no-color', r.sha]).slice(0, 12000);
  }
  // the record before and after this one that touched the same component: Compare versions
  if (r.components.length) {
    const same = allRecords().filter((x) => x.components.includes(r.components[0]));
    const i = same.findIndex((x) => x.id === id);
    rec.versions = { component: r.components[0], newer: same[i - 1]?.id ?? null, older: same[i + 1]?.id ?? null, count: same.length };
  }
  return rec;
}

/* A screenshot a commit saved (a part's story picture), as it was before the commit and after it: the
   record's "What changed" picture (her 18 Nov History mock: the part before and after, large). Only a
   .png the record itself lists; a side that doesn't exist (a new or deleted picture) is null. */
export function historyPicture(id, path, side) {
  const r = allRecords().find((x) => x.id === id);
  if (!r?.sha || !(r.source === 'BELLA git' || r.source === 'CHIP git')) return null;
  if (!/\.png$/i.test(path) || !(r.files ?? []).includes(path)) return null;
  const dir = r.repo === 'bella' ? BELLA : ROOT;
  try {
    return execFileSync('git', ['-C', dir, '--no-optional-locks', 'show', `${r.sha}${side === 'before' ? '^' : ''}:${path}`], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
