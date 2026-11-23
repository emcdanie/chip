// Data sweep: every number CHIP shows, recomputed from its source and compared
// (Elleta, 22 Nov 2026: "can we also make sure that the data being presented in
// CHIP is actually correct.. I feel like it isn't"; rule Real: "it shows real
// data … never sample or invented numbers"). Runs beside clip-sweep.mjs and
// grid-sweep.mjs before every report.
//
// Each check reads what a page says (its text at 1100, light) and works out the
// true value on its own: BELLA's files (components, stories, contracts, the
// machine-readable spec, Storybook's manifest, token CSS), git, and GitHub (gh).
// It never takes the page's own model or CHIP's snapshot as the truth; the
// snapshot is itself checked against BELLA's HEAD. Built from the 22 Nov
// independent data check's scripts (19 of 45 numbers were wrong).
//
// Usage: node scripts/data-sweep.mjs [--app http://localhost:3160] [--out dir]
// Needs a CHIP server and Playwright in BELLA_DIR (as clip-sweep.mjs); gh for
// the CI and PR checks (a check whose source can't be read is "not measured",
// never a pass). Exit 1 on any mismatch.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-data-sweep'));
const ROOT = new URL('..', import.meta.url).pathname;
const B = bellaDir();
const { chromium } = createRequire(join(B, 'package.json'))('playwright');

const sh = (cmd, args, cwd = B) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1 << 26 }).trim();
  } catch {
    return null;
  }
};
const json = async (path) => (await fetch(`${APP}${path}`)).json();
const read = (p) => readFileSync(join(B, p), 'utf8');
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// ---- truth from BELLA's own files ------------------------------------------
const comps = readdirSync(join(B, 'src/components'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(B, 'src/components', d.name, `${d.name}.tsx`)))
  .map((d) => d.name)
  .sort();
const N = comps.length;
const contracts = JSON.parse(read('tokens/contracts.json')).component ?? {};
const dsdsNames = new Set([...read('bella.dsds.yaml').matchAll(/name: (\w+)/g)].map((m) => m[1]));
const manifestFile = join(B, 'storybook-static/manifests/components.json');
const manBy = {};
if (existsSync(manifestFile))
  for (const e of Object.values(JSON.parse(readFileSync(manifestFile, 'utf8')).components ?? {})) {
    const m = (e.reactDocgen?.definedInFile ?? '').match(/src\/components\/([^/]+)\//);
    if (m) manBy[m[1]] = e;
  }
const css = read('tokens/bella.css');
// What the Chip theme resolves, as the app shows it: :root (BELLA's own light), then the chip-light overrides, and for
// dark the chip-dark overrides on top. A token BELLA's own light theme defines but Chip overrides is not used by
// what Chip draws (23 Nov: Button's transparent background is bella-light's; Chip gives it a surface fill).
const blockVars = (pick) => {
  const out = {};
  for (const b of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (pick(b[1])) for (const m of b[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2];
  return out;
};
const rootV = blockVars((sel) => /:root/.test(sel));
const lightV = { ...rootV, ...blockVars((sel) => /chip-light/.test(sel)) };
const darkV = { ...lightV, ...blockVars((sel) => /chip-dark/.test(sel)) };
const defs = {};
for (const t of new Set([...Object.keys(lightV), ...Object.keys(darkV)])) defs[t] = [...new Set([lightV[t], darkV[t]].filter(Boolean))];
const closure = (t, s = new Set()) => {
  if (s.has(t)) return s;
  s.add(t);
  for (const v of defs[t] ?? []) for (const r of v.matchAll(/var\((--[\w-]+)/g)) closure(r[1], s);
  return s;
};
const srcOf = (c) => {
  const dir = join(B, 'src/components', c);
  return readdirSync(dir)
    .filter((f) => /\.(tsx|ts|css)$/.test(f) && !f.includes('.stories.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
};
const tokensOf = Object.fromEntries(comps.map((c) => [c, (() => { const all = new Set(); for (const m of srcOf(c).matchAll(/var\((--[\w-]+)/g)) closure(m[1], all); return all; })()]));

const missing = {
  story: comps.filter((c) => !existsSync(join(B, 'src/components', c, `${c}.stories.tsx`))),
  contract: comps.filter((c) => !contracts[kebab(c)]?.$extensions?.bella),
  dsds: comps.filter((c) => !dsdsNames.has(c)),
  a11y: comps.filter((c) => { const a = contracts[kebab(c)]?.$extensions?.bella?.a11y; return !(a && (Array.isArray(a) ? a.length : true)); }),
  docs: existsSync(manifestFile) ? comps.filter((c) => !manBy[c]?.description?.trim()) : null,
};

const results = [];
const check = (page, what, shown, truth, note = '') => {
  const ok = truth === null ? null : String(shown) === String(truth);
  results.push({ page, what, shown: shown ?? '(not on the page)', truth: truth ?? 'not measured', ok, note });
};

// ---- the pages' text --------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const text = {};
// a page's text is read only once it has stopped changing (live counts arrive after the first paint), so a
// first run no longer reads a stale count; three equal reads a second apart, at most 25 s
const settled = async (p) => {
  const read = () => p.evaluate(() => (document.querySelector('#main') ?? document.body).innerText);
  let last = await read();
  for (let same = 0, i = 0; same < 3 && i < 25; i++) {
    await p.waitForTimeout(1000);
    const now = await read();
    same = now === last ? same + 1 : 0;
    last = now;
  }
};
const ratios = {};
for (const page of ['health', 'foundations', 'connectors', 'team', 'history', 'not-again', 'work', 'system-map', 'components']) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await p.goto(`${APP}/#/${page}`);
  await p.waitForTimeout(1500);
  await settled(p);
  text[page] = await p.evaluate(() => (document.querySelector('#main') ?? document.body).innerText);
  if (page === 'system-map') {
    // the Stories & tests node's detail card, where the run's counts and day are
    await p.evaluate(() => [...document.querySelectorAll('button')].find((e) => /^Stories & tests:/.test(e.getAttribute('aria-label') ?? ''))?.click());
    await p.waitForTimeout(600);
    text[page] = await p.evaluate(() => (document.querySelector('#main') ?? document.body).innerText);
  }
  if (page === 'health') {
    // the Gate runs view of Component checks
    await p.evaluate(() => [...document.querySelectorAll('button,[role=radio],label')].find((e) => e.textContent.trim() === 'Gate runs')?.click());
    await p.waitForTimeout(800);
    text['health-gate'] = await p.evaluate(() => { const x = document.querySelector('#main').innerText; return x.slice(x.lastIndexOf('Component checks')).split('\nAudits\n')[0]; });
  }
  if (page === 'foundations')
    // an "on X" colour, measured on X in Chip light, worked out here from the tokens
    Object.assign(ratios, await p.evaluate(() => {
      const probe = document.createElement('span');
      probe.setAttribute('data-theme', 'chip-light');
      document.body.appendChild(probe);
      const rgb = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); };
      const lum = ([r, g, b]) => [r, g, b].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const out = { 'on action': ratio(rgb('--color-content-brand-knockout'), rgb('--color-background-brand')).toFixed(1) };
      probe.remove();
      return out;
    }));
  writeFileSync(join(OUT, `${page}.txt`), text[page]);
  await p.close();
}
await browser.close();
const grab = (page, re) => text[page].match(re);

// ---- snapshot freshness -----------------------------------------------------
const head = sh('git', ['rev-parse', '--short', 'HEAD']);
for (const f of ['bella.json', 'foundations.json']) {
  const commit = JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')).source?.commit;
  check('all', `data/${f} is BELLA's HEAD`, commit, head);
}

// ---- Health -----------------------------------------------------------------
const pairs = (await json('/contrast-pairs')).pairs ?? [];
const pairToks = new Set(pairs.flatMap((p) => [p.fg, ...String(p.bg).split(' over ')]).flatMap((s) => s.match(/--[\w-]+/g) ?? []));
missing.contrast = comps.filter((c) => ![...tokensOf[c]].some((t) => pairToks.has(t)));
// Weather rows (22 Nov): the check's short name, then its count on the next line
const ROWS = { Story: 'story', Docs: 'docs', Contract: 'contract', Spec: 'dsds', Contrast: 'contrast', A11y: 'a11y' };
for (const [title, id] of Object.entries(ROWS)) {
  const m = text.health.match(new RegExp(`\\n${title}\\n(\\d+)/(\\d+)`));
  check('health', `${title} row`, m ? `${m[1]}/${m[2]}` : null, missing[id] ? `${N - missing[id].length}/${N}` : null);
}
const measured = Object.values(missing).filter(Boolean);
const passTruth = measured.reduce((a, l) => a + N - l.length, 0);
check('health', 'System health pass', grab('health', /(\d+) of (\d+) pass/)?.slice(1).join(' of '), `${passTruth} of ${N * measured.length}`);
const needWork = new Set(measured.flat()).size;
check('health', 'Parts that need work', grab('health', /Parts that need work\n(\d+ of \d+) parts/)?.[1], `${needWork} of ${N}`);
// Drift comes from BELLA's specs (/drift), the same count the card shows
const drift = await json('/drift').catch(() => null);
if (drift?.total) check('health', 'Drift: parts that differ', grab('health', /Drift from BELLA\n+(?:\d+\n+)?(\d+)\n+of (\d+)/i)?.slice(1).join(' of '), `${drift.differing} of ${drift.total}`);
const checks = await json('/checks');
const behind = (checks.checks ?? []).filter((c) => c.gate === true && c.commit && c.commit !== checks.head);
for (const c of behind) check('health', `Gate names ${c.name}, behind HEAD`, text.health.includes(`${c.name} last ran ${day(c.ranAt)}`) ? 'named' : 'not named', 'named');

// Gate runs: only recorded runs, each day's count recomputed from its sources: GitHub's CI runs (gh) and CHIP's
// own gate check runs (data/checks/log.jsonl and each result file's latest and previous run). A day with no record
// must not be shown.
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const WEEKDAY = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
// every run of the repo, as Gate runs shows them (all branches, a cancelled or skipped run is neither pass nor failure)
const ciRaw = sh('gh', ['api', '--paginate', 'repos/{owner}/{repo}/actions/runs?per_page=100', '--jq', '.workflow_runs[] | {conclusion, status, createdAt: .created_at}']);
const ciAll = ciRaw ? ciRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped') : null;
const GATE_IDS = ['contrast', 'contract', 'agents-md', 'tokens-built', 'visual'];
const chipRuns = new Map();
const addRun = (e) => e?.ranAt && GATE_IDS.includes(e.id) && chipRuns.set(`${e.id}@${e.ranAt}`, e);
try { for (const l of readFileSync(join(ROOT, 'data/checks/log.jsonl'), 'utf8').split('\n')) if (l.trim()) addRun(JSON.parse(l)); } catch {}
for (const id of GATE_IDS) { try { const r = JSON.parse(readFileSync(join(ROOT, 'data/checks', `${id}.json`), 'utf8')); addRun({ id, ...r }); addRun(r.previous && { id, ...r.previous }); } catch {} }
const perDay = new Map();
const bump = (iso, ok) => { const k = localDay(iso); const d = perDay.get(k) ?? { iso, runs: 0, passed: 0 }; d.runs++; if (ok) d.passed++; perDay.set(k, d); };
for (const r of ciAll ?? []) if (r.status === 'completed') bump(r.createdAt, r.conclusion === 'success');
for (const r of chipRuns.values()) bump(r.ranAt, r.ok);
const days = [...perDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
// the chart (BarChart, her pick C, 23 Nov) opens on D: the headline is the latest recorded day's passed/runs;
// a day with no record has no bars, nothing is made up
{
  const [, d] = days[0] ?? [];
  const m = text['health-gate']?.match(/(\d+)\/(\d+)\s*\n?\s*RUNS/i);
  check('health', `Gate runs chart, latest day ${d ? WEEKDAY(d.iso) : ''} (recorded)`, m ? `${m[1]}/${m[2]}` : undefined, ciAll && d ? `${d.passed}/${d.runs}` : null);
}

{
  const m = text['health-gate']?.match(/(\d+) of (\d+) CI runs passed since/);
  const done = (ciAll ?? []).filter((r) => r.status === 'completed');
  check('health', 'Gate runs: CI runs passed of recorded', m ? `${m[1]} of ${m[2]}` : undefined, ciAll ? `${done.filter((r) => r.conclusion === 'success').length} of ${done.length}` : null);
}

// ---- System map -------------------------------------------------------------
const cssVars = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])).size;
check('system-map', 'Tokens: CSS variables', grab('system-map', /(\d+) CSS variables/)?.[1], cssVars);
// Processes' Stories node no longer shows the run's test count or commit (23 Nov); the commit the checks ran on is
// said on Health's Checks card, so that is what is read: it must be BELLA's HEAD
// 23 Nov: the card carries no commit id (her chart rule: ids sit behind the link, in the drawer); the id shown there is read from /checks
check('health', 'Checks card: no commit id in its text', grab('health', /@ ([0-9a-f]{7})/)?.[1] ?? 'none', 'none');
// Bench: the score as the bench last wrote it, with the day of the agent run it leans on, stale after a week
const odsb = join(process.env.HOME, 'DEV/tools/odsb/runs');
const lastAgent = existsSync(odsb) ? readdirSync(odsb).filter((d) => existsSync(join(odsb, d, 'manifest.json'))).sort().at(-1) : null;
const benchScore = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data/checks/bench-static.json'), 'utf8')).score; } catch { return null; } })();
const agentAt = lastAgent ? JSON.parse(readFileSync(join(odsb, lastAgent, 'manifest.json'), 'utf8')).startedAt : null;
check('system-map', 'Bench score, its agent run day and staleness', grab('system-map', /(Score [\d.]+ · [^\n]+)/)?.[1], benchScore != null && agentAt ? `Score ${benchScore} · ${day(agentAt)}${Date.now() - Date.parse(agentAt) > 7 * 86400000 ? ', stale' : ''}` : null);
check('system-map', 'Contracts', grab('system-map', /(\d+ of \d+) have a contract/)?.[1], `${N - missing.contract.length} of ${N}`);

// ---- Connectors: CI as GitHub ran it --------------------------------------
const ci = JSON.parse(sh('gh', ['run', 'list', '--branch', checks.base, '--limit', '1', '--json', 'conclusion,status,createdAt,headSha']) ?? 'null')?.[0] ?? null;
check('connectors', 'GitHub CI result', grab('connectors', /GitHub CI\n+(\w+)/)?.[1], ci ? (ci.status !== 'completed' ? 'Running' : ci.conclusion === 'success' ? 'Passed' : 'Failed') : null);
check('connectors', 'GitHub CI day and commit', grab('connectors', /GitHub CI\n+\w+\n+([^\n]+)/)?.[1], ci ? `${day(ci.createdAt)} · ${ci.headSha.slice(0, 7)}` : null);

// ---- Team: every open PR ----------------------------------------------------
const projects = (await json('/projects')).projects ?? [];
const prCounts = projects.map((p) => JSON.parse(sh('gh', ['pr', 'list', '--state', 'open', '--limit', '500', '--json', 'number'], p.repo) ?? 'null'));
check('team', 'Open PRs', grab('team', /(\d+)\nopen PRs?/)?.[1], prCounts.every(Array.isArray) ? prCounts.reduce((a, l) => a + l.length, 0) : null);
check('team', 'No "asks for you" (Needs you\'s word)', /asks? for you/.test(text.team) ? 'said' : 'not said', 'not said');
const older = Number(grab('team', /(\d+) older asks?/)?.[1] ?? 0);
if (older) check('team', `"Every ask is answered" not said while ${older} older asks are open`, /Every ask is answered/.test(text.team) ? 'said' : 'not said', 'not said');

// ---- History: All is all ----------------------------------------------------
const commits = Number(sh('git', ['rev-list', '--count', '--no-merges', checks.base]) ?? NaN) + Number(sh('git', ['rev-list', '--count', '--no-merges', 'HEAD'], ROOT) ?? NaN);
const all = Number(grab('history', /All (\d+)/)?.[1] ?? NaN);
check('history', 'All covers every commit', all >= commits ? 'yes' : `${all} < ${commits}`, Number.isNaN(commits) ? null : 'yes');

// ---- Foundations ------------------------------------------------------------
const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
const roles = Object.keys(bella.palette ?? {}).filter((t) => t.startsWith('--color-'));
// Readers that are not parts: BELLA's foundations (src/foundations) and CHIP's own app (app/src), read here on their
// own (23 Nov: Highlight.module.css reads --color-content-highlight and the page said "Nothing").
const nonPart = new Set();
const readAll = (dir) => {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) readAll(p);
    else if (/\.(css|tsx?|jsx?)$/.test(f.name) && !/\.stories\.|TokenSheet/.test(f.name)) for (const m of readFileSync(p, 'utf8').matchAll(/var\((--[\w-]+)/g)) closure(m[1], nonPart);
  }
};
readAll(join(B, 'src/foundations'));
readAll(join(ROOT, 'app/src'));
const used = roles.filter((t) => nonPart.has(t) || comps.some((c) => tokensOf[c].has(t))).length;
check('foundations', 'Used', grab('foundations', /Used (\d+)/)?.[1], used);
check('foundations', 'Used by nothing', grab('foundations', /Used by nothing (\d+)/)?.[1], roles.length - used);
check('foundations', 'on action, measured on the action fill', grab('foundations', /on action\n#[0-9A-F]{6}\n([\d.]+):1 on action/)?.[1], ratios['on action']);

// ---- Components, Not again, Work ------------------------------------------
check('components', 'No typed "on main"', /\bon main\b/.test(text.components) ? 'said' : 'not said', 'not said');
const runs = (await json('/runs')).runs ?? [];
const names = [...readFileSync(join(ROOT, 'app/src/pages/notAgainModel.js'), 'utf8').matchAll(/\{ name: '([^']+)', check:/g)].map((m) => m[1]);
const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const week = runs.filter((r) => names.some((n) => String(r.title ?? '').startsWith(n)) && new Date(r.startedAt) >= monday).length;
check('not-again', 'Runs this week (saved fixes only)', grab('not-again', /Runs this week\n+(\d+)/)?.[1], week);
const onBoard = runs.filter((r) => ['failed', 'login', 'starting', 'running', 'gate', 'passed'].includes(r.status) && new Date(r.startedAt).toDateString() !== new Date().toDateString());
for (const r of onBoard) check('work', `Run "${r.title}" names its day`, text.work.includes(`${day(r.startedAt)} `) ? 'named' : 'time only', 'named');

// the board in her Notion lanes: Ideas is the progress board's to-dos, her tasks and the components
// with a gap (the same set Health counts as Parts that need work), less what she moved out
const board = await json('/work/board').catch(() => null);
if (board) {
  const place = board.board?.place ?? {};
  const busy = new Set(runs.filter((r) => ['starting', 'running', 'gate', 'passed'].includes(r.status)).map((r) => r.title));
  const ideas = [
    ...board.progress.items.filter((i) => i.stage === 'To do').map((i) => [i.id, i.title]),
    ...board.progress.tasks.map((t) => [t.id, t.title]),
    ...[...new Set(measured.flat())].map((n) => [`comp-${n}`, n]),
  ];
  // a placement whose card no longer exists (a finished or removed item) draws nothing, so it is not counted
  const known = new Set([...(await json('/needs').catch(() => ({}))).items?.map((n) => n.id) ?? [], ...runs.map((r) => r.id), ...board.progress.items.map((i) => i.id), ...(board.sessions ?? []).map((x) => x.id)]);
  const ideasNow = ideas.filter(([id, t]) => (!place[id] || place[id].lane === 'ideas') && !busy.has(t)).length + Object.entries(place).filter(([id, p]) => p.lane === 'ideas' && !ideas.some(([i]) => i === id) && known.has(id)).length;
  check('work', 'Ideas: to-dos, your tasks and parts that need work', grab('work', /\bIdeas\n(\d+)/)?.[1], ideasNow);
}

// ---- report -----------------------------------------------------------------
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.ok === false);
const notMeasured = results.filter((r) => r.ok === null);
for (const r of results) console.log(`${r.ok === true ? 'ok  ' : r.ok === false ? 'FAIL' : 'n/m '} ${r.page.padEnd(11)} ${r.what}: shown ${r.shown}, true ${r.truth}`);
console.log(`data-sweep: ${results.length - bad.length - notMeasured.length} of ${results.length} match, ${bad.length} wrong, ${notMeasured.length} not measured · ${OUT}`);
process.exit(bad.length ? 1 : 0);
