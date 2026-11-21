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
const defs = {};
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) (defs[m[1]] ??= []).push(m[2]);
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
const ratios = {};
for (const page of ['health', 'foundations', 'connectors', 'team', 'history', 'not-again', 'work', 'system-map', 'components']) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await p.goto(`${APP}/#/${page}`);
  await p.waitForTimeout(3500);
  text[page] = await p.evaluate(() => (document.querySelector('#main') ?? document.body).innerText);
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
const ROWS = { Story: 'story', Docs: 'docs', Contract: 'contract', 'Machine-readable spec': 'dsds', Contrast: 'contrast', A11y: 'a11y' };
for (const [title, id] of Object.entries(ROWS)) {
  const m = text.health.match(new RegExp(`\\n${title}\\n[^\\n]*\\n(\\d+)/(\\d+)`));
  check('health', `${title} row`, m ? `${m[1]}/${m[2]}` : null, missing[id] ? `${N - missing[id].length}/${N}` : null);
}
const measured = Object.values(missing).filter(Boolean);
const passTruth = measured.reduce((a, l) => a + N - l.length, 0);
check('health', 'System health pass', grab('health', /(\d+) of (\d+) pass/)?.slice(1).join(' of '), `${passTruth} of ${N * measured.length}`);
const needWork = new Set(measured.flat()).size;
check('health', 'Parts that need work', grab('health', /Parts that need work\n(\d+ of \d+) parts/)?.[1], `${needWork} of ${N}`);
const base = await json('/figma-baseline').catch(() => null);
if (base?.at && base.notRead === base.total) check('health', 'Drift when Figma was not read', /Drift from BELLA\n+Not measured/.test(text.health) ? 'Not measured' : 'a number', 'Not measured');
const checks = await json('/checks');
const behind = (checks.checks ?? []).filter((c) => c.gate === true && c.commit && c.commit !== checks.head);
for (const c of behind) check('health', `Gate names ${c.name}, behind HEAD`, text.health.includes(`${c.name} last ran ${day(c.ranAt)} on ${c.commit}`) ? 'named' : 'not named', 'named');

// ---- System map -------------------------------------------------------------
const cssVars = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])).size;
check('system-map', 'Tokens: CSS variables', grab('system-map', /(\d+) CSS variables/)?.[1], cssVars);
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

// ---- History: All is all ----------------------------------------------------
const commits = Number(sh('git', ['rev-list', '--count', '--no-merges', checks.base]) ?? NaN) + Number(sh('git', ['rev-list', '--count', '--no-merges', 'HEAD'], ROOT) ?? NaN);
const all = Number(grab('history', /All (\d+)/)?.[1] ?? NaN);
check('history', 'All covers every commit', all >= commits ? 'yes' : `${all} < ${commits}`, Number.isNaN(commits) ? null : 'yes');

// ---- Foundations ------------------------------------------------------------
const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
const roles = Object.keys(bella.palette ?? {}).filter((t) => t.startsWith('--color-'));
const used = roles.filter((t) => comps.some((c) => tokensOf[c].has(t))).length;
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

// ---- report -----------------------------------------------------------------
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.ok === false);
const notMeasured = results.filter((r) => r.ok === null);
for (const r of results) console.log(`${r.ok === true ? 'ok  ' : r.ok === false ? 'FAIL' : 'n/m '} ${r.page.padEnd(11)} ${r.what}: shown ${r.shown}, true ${r.truth}`);
console.log(`data-sweep: ${results.length - bad.length - notMeasured.length} of ${results.length} match, ${bad.length} wrong, ${notMeasured.length} not measured · ${OUT}`);
process.exit(bad.length ? 1 : 0);
