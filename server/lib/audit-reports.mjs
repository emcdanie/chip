// The full audit report (CHIP rule 23 Nov: "One full report of all audits, filterable"). Every figure is read
// from a saved file and nothing is typed: the benchmark's results.json for each run (Open Design System
// Benchmark, ~/DEV/tools/odsb/runs), the benchmark's SUMMARY.md and data/checks/bench-static.json for the
// readiness score, and the audit reports in docs/reference/audit (audits.mjs). Read only. A figure with no
// file behind it is left out, and the page says "Not measured".
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';
import { readAudits, auditHistory } from './audits.mjs';

const ODSB = () => process.env.CHIP_ODSB_DIR || join(homedir(), 'DEV/tools/odsb');
const SUMMARY = () => process.env.CHIP_BENCH_SUMMARY || join(homedir(), 'DEV/tools/bench-2026-10-08-baseline/SUMMARY.md');
const CHECKS_DIR = () => process.env.CHIP_CHECKS_DIR || join(DATA_DIR, 'checks');

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const day = (iso) => String(iso).slice(0, 10);
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

// plain names for the ten jobs (the task ids are the benchmark's own)
const JOB_NAMES = {
  'password-visibility': 'Reveal a typed password',
  'settings-toggle-section': 'Notification on/off settings',
  'paginated-activity-log': 'Paged activity log',
  'confirm-account-deletion': 'Confirm before deleting an account',
  'cancel-plan-action-hierarchy': 'Cancel-plan buttons in the right order',
  'onboarding-flow': 'First-run setup steps',
  'success-feedback': 'Message after saving',
  'connection-status-indicator': 'Sync and connection status',
  'empty-state-devices': 'Empty list of linked devices',
  'form-validation-errors': 'Errors on a form field',
};
// the six checks, in plain words (the benchmark's dimension ids are the keys)
const CHECK_NAMES = {
  apiFidelity: 'Real parts',
  judgment: 'Quality of the result',
  compile: 'Compiles',
  imports: 'Imports',
  a11yStatic: 'Accessibility',
  tokenDiscipline: 'Tokens',
};

/** The weights the benchmark scores with (rubric.config.ts), read, not copied. */
function weights() {
  const f = join(ODSB(), 'rubric.config.ts');
  if (!existsSync(f)) return null;
  const block = readFileSync(f, 'utf8').match(/weights:\s*\{([^}]*)\}/)?.[1];
  if (!block) return null;
  const w = Object.fromEntries([...block.matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  return Object.keys(CHECK_NAMES).every((k) => k in w) ? w : null;
}

/** Every full benchmark run that has both contexts or the AGENTS.md one, oldest first. */
function runs() {
  const base = join(ODSB(), 'runs');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .sort()
    .map((id) => ({ id, file: join(base, id, 'results.json') }))
    .filter((r) => existsSync(r.file) && !/smoke/.test(r.id))
    .map((r) => ({ ...r, data: readJson(r.file) }))
    .filter((r) => r.data?.aggregates?.some((a) => a.context === 'agents-md'))
    .map((r) => {
      const byCtx = { bare: {}, md: {} };
      for (const a of r.data.aggregates) {
        const ctx = a.context === 'agents-md' ? 'md' : a.context === 'bare' ? 'bare' : null;
        if (ctx) byCtx[ctx][a.taskId] = { overall: a.meanOverall, dims: a.meanDimensions, gate: a.worstGate };
      }
      return { id: r.id, day: day(r.data.manifest?.startedAt), dir: join(base, r.id), data: r.data, byCtx };
    });
}

const stoppedIn = (md) => !!md && md.dims.apiFidelity === 0 && md.dims.judgment === 0;
const meanOf = (ctx, ids) => round1(mean(ids.map((t) => ctx[t].overall)));

/** The agent's own last message in a cell, its first paragraph, cut at a sentence. */
function finalMessage(run, ctx, task) {
  const f = join(run.dir, 'cells', `bella_${ctx}_sonnet`, task, 'rep1', 'transcript.jsonl');
  if (!existsSync(f)) return null;
  let text = null;
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    if (!l.includes('"type":"result"') && !l.includes('"type": "result"')) continue;
    try {
      const o = JSON.parse(l);
      if (o.type === 'result' && typeof o.result === 'string') text = o.result;
    } catch {
      /* a partial line */
    }
  }
  return text ? text.split('\n\n')[0].replace(/`/g, '').trim() : null;
}

const WORD_FOR = (gap, tag) => {
  if (tag === 'stopped and asked') return { word: tag, tone: 'warning' };
  if (gap <= -3) return { word: tag === 'did not compile' ? tag : 'no file ahead', tone: 'danger' };
  if (gap >= 3) return { word: 'my note ahead', tone: 'success' };
  return { word: 'no real change', tone: 'neutral' };
};

function jobsOf(run, w) {
  const ids = Object.keys(run.byCtx.md).filter((t) => run.byCtx.bare[t]);
  const raw = run.data.records.filter((r) => r.cell.context === 'agents-md' || r.cell.context === 'bare');
  const rec = (ctx, t) => raw.find((r) => r.cell.context === ctx && r.taskId === t)?.result;
  return ids
    .map((t) => {
      const bare = run.byCtx.bare[t].overall;
      const md = run.byCtx.md[t].overall;
      const gap = round1(md - bare);
      const stopped = stoppedIn(run.byCtx.md[t]);
      const compileFail = run.byCtx.md[t].dims.compile === 0;
      const tag = stopped ? 'stopped and asked' : compileFail ? 'did not compile' : gap <= -3 ? 'no file ahead' : gap >= 3 ? 'my note ahead' : 'no real change';
      const { word, tone } = WORD_FOR(gap, tag);
      let why = null;
      let src = null;
      if (stopped) {
        why = finalMessage(run, 'agents-md', t);
        src = 'agent, final message';
      } else if (compileFail) {
        why = rec('agents-md', t)?.dimensions?.compile?.diffs?.[0]?.message ?? null;
        src = 'compiler';
      } else {
        // the side that lost: the check where it lost most, and the first thing the grader said about it
        const loser = gap >= 3 ? 'bare' : 'agents-md';
        const r = rec(loser, t);
        const dims = Object.entries(r?.dimensions ?? {}).filter(([, v]) => v.diffs?.length);
        const worst = dims.sort(([a, x], [b, y]) => w[b] * (100 - y.score) - w[a] * (100 - x.score))[0];
        if (worst) {
          const msg = worst[1].diffs[0].message.replace(/^[\w-]+: /, '');
          why = Math.abs(gap) < 3 ? msg : `${gap >= 3 ? 'No file' : 'AGENTS.md'} lost most on ${CHECK_NAMES[worst[0]].toLowerCase()}: ${msg}`;
          src = worst[0] === 'judgment' ? 'quality check' : worst[0] === 'compile' ? 'compiler' : 'static checks';
          if (gap >= 3) src += ' on the no-file run';
        }
      }
      return { id: t, name: JOB_NAMES[t] ?? t, bare: round1(bare), md: round1(md), gap, tag, word, tone, why, src };
    })
    .sort((a, b) => a.gap - b.gap);
}

/** The readiness score over time: the benchmark's own SUMMARY.md for the early runs, bench-static.json for now. */
function readiness() {
  const out = { composite: { p: [], src: [] }, static: { p: [], src: [] }, target: null, note: null, parts: null, failures: [], tier: null };
  const f = SUMMARY();
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8');
    const head = t.match(/^\|\s*\|\s*(\d+ \w+)\s*\|\s*(\d+ \w+)\s*\|\s*(\d+ \w+)\s*\|\s*$/m);
    const stat = t.match(/^\| Static surface[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/m);
    const comp = t.match(/^\| Composite with run\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)([^|]*)\|\s*([\d.]+)/m);
    const shipped = t.match(/^\| As shipped[^|]*\|\s*\*\*([\d.]+)\*\*/m);
    const tier = t.match(/AI-native tier ≥ ?(\d+)/);
    const dates = head ? [head[1], head[2], head[3]].map((d) => new Date(`${d} 2026 12:00 UTC`).toISOString().slice(0, 10)) : null;
    if (dates && stat && comp) {
      out.static.p = [[dates[0], shipped ? Number(shipped[1]) : Number(stat[1])], [dates[1], Number(stat[2])], [dates[2], Number(stat[3])]];
      out.composite.p = [[dates[0], Number(comp[1])], [dates[1], Number(comp[2])], [dates[2], Number(comp[4])]];
      out.note = comp[3].replace(/[()]/g, '').trim() ? { at: dates[1], text: comp[3].replace(/[()]/g, '').trim() } : null;
      out.composite.src.push('SUMMARY.md');
      out.static.src.push('SUMMARY.md');
    }
    if (tier) out.target = Number(tier[1]);
  }
  const bs = readJson(join(CHECKS_DIR(), 'bench-static.json'));
  if (bs?.score != null) {
    out.parts = bs.parts ?? null;
    out.failures = (bs.failures ?? []).slice(0, 12);
    out.tier = bs.tier ?? null;
    let at = null;
    try {
      const last = readFileSync(join(CHECKS_DIR(), 'log.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"bench-static"')).pop();
      at = last ? day(JSON.parse(last).ranAt) : null;
    } catch {
      /* no log */
    }
    if (at) {
      out.composite.p.push([at, bs.score]);
      out.composite.src.push('bench-static.json');
      // the surface-only score: the seven checks weighted 20, 20, 15, 15, 10, 10, 10; a check with no score is left out and the rest share its weight
      const W = [['Enablement surface', 20], ['Catalog quality', 20], ['Export hygiene', 15], ['Vocabulary convention-distance', 15], ['Token machine-readability', 10], ['Deprecation legibility', 10], ['Docs greppability', 10]];
      const have = W.filter(([k]) => bs.parts?.[k] != null);
      if (have.length) {
        out.static.p.push([at, round1(have.reduce((s, [k, wt]) => s + bs.parts[k] * wt, 0) / have.reduce((s, [, wt]) => s + wt, 0))]);
        out.static.src.push('bench-static.json parts, weighted as score.ts');
      }
    }
  }
  return out;
}

const fileOf = (a) => (a?.file ? `docs/reference/audit/${a.file}` : null);

/** The whole report: one object, read fresh from the files each time. */
export function readAuditReports() {
  const w = weights();
  const R = runs();
  if (!w || !R.length) return { ok: false, why: !w ? 'The benchmark rubric (rubric.config.ts) was not found.' : 'No benchmark run was found.' };
  const last = R[R.length - 1];
  const jobs = jobsOf(last, w);
  const ids = jobs.map((j) => j.id);
  const stopped = ids.filter((t) => stoppedIn(last.byCtx.md[t]));
  const eight = ids.filter((t) => !stopped.includes(t));
  const all10 = { bare: meanOf(last.byCtx.bare, ids), md: meanOf(last.byCtx.md, ids) };
  const eightM = { bare: meanOf(last.byCtx.bare, eight), md: meanOf(last.byCtx.md, eight), n: eight.length };
  const dimMean = (ctx, d) => round1(mean(ids.map((t) => last.byCtx[ctx][t].dims[d])));
  const checks = Object.keys(CHECK_NAMES)
    .map((d) => {
      const bare = dimMean('bare', d);
      const md = dimMean('md', d);
      return { id: d, name: CHECK_NAMES[d], bare, md, weight: w[d], share: round1(w[d] * (md - bare)) };
    })
    .sort((a, b) => a.share - b.share);

  const ctxMean = (run, ctx) => (Object.keys(run.byCtx[ctx]).length ? meanOf(run.byCtx[ctx], Object.keys(run.byCtx[ctx])) : null);
  const series = { bare: [], md: [] };
  const rows = R.map((r, i) => {
    const bare = r.byCtx.bare && Object.keys(r.byCtx.bare).length ? ctxMean(r, 'bare') : null;
    const md = ctxMean(r, 'md');
    if (bare != null) series.bare.push([r.day, bare]);
    series.md.push([r.day, md]);
    return { id: r.id, day: r.day, bare, md, how: i === 0 ? 'first AGENTS.md' : i === R.length - 1 ? 'all 10 jobs' : 'rewritten' };
  });
  const runList = [...rows, { id: `${last.id}-eight`, day: last.day, bare: eightM.bare, md: eightM.md, how: `the ${eightM.n} jobs BELLA can do` }];

  const m = last.data.manifest ?? {};
  const how = {
    runId: last.id,
    day: last.day,
    profile: m.profile ?? null,
    contexts: ['no file (bare)', 'AGENTS.md'],
    jobs: ids.length,
    reps: m.cells?.[0]?.spec?.reps ?? 1,
    cost: m.totalCostUsd != null ? Math.round(m.totalCostUsd * 100) / 100 : null,
    seconds: m.wallClockMs != null ? Math.round(m.wallClockMs / 1000) : null,
    agent: m.adapters?.['claude-code']?.version ?? null,
    bella: m.systems?.bella?.commit?.slice(0, 7) ?? null,
  };
  const ready = readiness();
  const A = readAudits();
  const audits = A.map((a) => {
    const hist = auditHistory(a.id);
    return { id: a.id, title: a.title, skill: a.skill, ran: a.ran, file: fileOf(a), value: a.value ?? null, unit: a.unit ?? null, orders: a.orders ?? [], red: a.red, yellow: a.yellow, green: a.green, checks: a.checks, runs: hist };
  });
  return {
    ok: true,
    read: new Date().toISOString(),
    bench: { how, run: last.id, day: last.day, all10, eight: eightM, stopped: stopped.length, stoppedIds: stopped, jobs, checks, series, runs: runList, runDirs: R.map((r) => r.id) },
    readiness: ready,
    audits,
  };
}
