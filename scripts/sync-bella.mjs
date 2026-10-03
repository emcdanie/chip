#!/usr/bin/env node
// sync-bella: reads the real BELLA repo (read-only) and writes data/bella.json,
// plus data/bella.js (the same payload as a global) so the bridge can load it
// when opened from file://, where fetch() is blocked.
//
// Sources: storybook-static/manifests/components.json, src/components/,
// tokens/{bella.json,bella.css,component.json,semantic/{light,dark}.json},
// bella.dsds.yaml, and BELLA's own gate scripts contrast-pairs.mjs and
// contract-parity.mjs, run unmodified with cwd = BELLA.
//
// TODO: audit:visual (Storybook build + test-runner) is skipped for now; too
// slow for a sync. Wire it in as an opt-in flag.
//
// Never invents a number: stations without real data get score null.

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BELLA = process.env.BELLA_DIR || join(homedir(), 'DEV', 'bella');
const OUT_DIR = join(ROOT, 'data');

const read = (p) => readFileSync(join(BELLA, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

if (!existsSync(join(BELLA, 'package.json'))) {
  console.error(`sync-bella: BELLA not found at ${BELLA} (set BELLA_DIR)`);
  process.exit(1);
}

// ---- sources ------------------------------------------------------------
const manifest = readJson('storybook-static/manifests/components.json').components;
const contracts = readJson('tokens/component.json').component;
const bellaTokens = readJson('tokens/bella.json');
const semLight = readJson('tokens/semantic/light.json');
const semDark = readJson('tokens/semantic/dark.json');
const dsds = read('bella.dsds.yaml');
const css = read('tokens/bella.css');

const STORYBOOK = (readJson('package.json').homepage || '').replace(/\/?$/, '/');

const git = (...args) => execFileSync('git', ['-C', BELLA, ...args], { encoding: 'utf8' }).trim();
const source = {
  repo: 'bella',
  commit: git('rev-parse', '--short', 'HEAD'),
  committedAt: git('log', '-1', '--format=%cI'),
  version: bellaTokens.$metadata?.version ?? null,
};

// DSDS component entries: `- kind: component` followed by `name: X`
const dsdsNames = new Set(
  [...dsds.matchAll(/^ {2}- kind: component\n(?: {4}.*\n)*? {4}name: (.+)$/gm)].map((m) => m[1].trim())
);

// Manifest entries keyed by component display name (components-* and brand-*)
const manifestByName = {};
for (const entry of Object.values(manifest)) {
  const file = entry.reactDocgen?.definedInFile || '';
  const m = file.match(/src\/components\/([^/]+)\//);
  if (m) manifestByName[m[1]] = entry;
}

// ---- token resolution (bella.css, both themes) ---------------------------
function cssBlock(re) {
  const m = css.match(re);
  if (!m) return {};
  let depth = 1, i = m.index + m[0].length;
  const start = i;
  while (depth && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const vars = {};
  for (const d of css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}
const lightVars = cssBlock(/:root\s*\{/);
const darkVars = { ...lightVars, ...cssBlock(/\[data-theme=["']?dark["']?\]\s*\{/) };

// a token's final value in one theme, following var() references
function resolve(vars, name, seen = new Set()) {
  if (!name || seen.has(name)) return null;
  seen.add(name);
  const v = vars[name];
  if (v === undefined) return null;
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], seen) : v;
}

// every var a token reaches through var() chains, in either theme
function closure(name, out = new Set()) {
  if (out.has(name)) return out;
  out.add(name);
  for (const vars of [lightVars, darkVars]) {
    const v = vars[name];
    if (!v) continue;
    for (const r of v.matchAll(/var\((--[\w-]+)/g)) closure(r[1], out);
  }
  return out;
}

// ---- components ---------------------------------------------------------
const compDir = join(BELLA, 'src/components');
const names = readdirSync(compDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(compDir, d.name, `${d.name}.tsx`)))
  .map((d) => d.name)
  .sort();

const components = names.map((name) => {
  const dir = join(compDir, name);
  const files = readdirSync(dir).sort();
  const srcFiles = files.filter((f) => /\.(tsx|ts|css)$/.test(f) && !f.includes('.stories.'));
  const src = srcFiles.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  const tokens = [...new Set([...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].sort();
  const imports = [...new Set(
    [...src.matchAll(/from '\.\.\/([A-Z]\w+)\//g)].map((m) => m[1]).filter((n) => names.includes(n) && n !== name)
  )].sort();

  const key = kebab(name);
  const contract = contracts[key]?.$extensions?.bella ?? null;
  const man = manifestByName[name] ?? null;
  const description = (man?.description || contract?.description || '').trim() || null;

  // Anatomy is recorded in the contract ($extensions.bella.anatomy), never
  // made up here. Each part names its DOM target (a selector inside the
  // component root), a zone shape and a layer kind. pin and anchor are
  // measured by the app from the rendered component, in the specimen's own
  // coordinate space, so they stay null in the data.
  const parts = (contract?.anatomy ?? []).map((p, i) => ({
    key: p.key,
    n: i + 1,
    title: p.title,
    detail: p.detail,
    token: p.token,
    value: { light: resolve(lightVars, p.token), dark: resolve(darkVars, p.token) },
    kind: p.kind,
    trigger: p.trigger ?? null,
    target: p.target,
    zone: p.zone,
    z: i,
    pin: null,
    anchor: null,
  }));
  const minTarget = tokens.find((t) => /^--component-.*min-height$/.test(t));

  // Contract slots the Specimen sandbox may change, for the first variant
  // (or the unvariant block). A slot exists only when the component's own
  // source reads that token; nothing is guessed.
  const v = contract?.variants?.[0];
  const slot = (...suffixes) => {
    for (const sfx of suffixes) {
      for (const t of [v && `--component-${key}-${v}-${sfx}`, `--component-${key}-default-${sfx}`, `--component-${key}-${sfx}`]) {
        if (t && tokens.includes(t)) return { token: t, light: resolve(lightVars, t), dark: resolve(darkVars, t) };
      }
    }
    return null;
  };
  const background = slot('fill-hi', 'background');
  const sandbox = {
    minHeight: slot('min-height'),
    paddingY: slot('padding-y'),
    paddingX: slot('padding-x'),
    label: slot('foreground'),
    background,
    // a gradient plate: its second stop follows the background slot
    backgroundPair: background?.token.endsWith('-fill-hi') ? slot('fill-lo') : null,
    ringWidth: tokens.includes('--ring-focus-width') ? { token: '--ring-focus-width', light: resolve(lightVars, '--ring-focus-width'), dark: resolve(darkVars, '--ring-focus-width') } : null,
    ringOffset: tokens.includes('--ring-focus-offset') ? { token: '--ring-focus-offset', light: resolve(lightVars, '--ring-focus-offset'), dark: resolve(darkVars, '--ring-focus-offset') } : null,
  };

  return {
    id: key,
    name,
    description,
    hasStory: files.some((f) => f.endsWith('.stories.tsx')),
    hasDocs: Boolean(man?.description?.trim()),
    inDsds: dsdsNames.has(name),
    hasContract: Boolean(contract),
    hasA11yNotes: Boolean(contract?.a11y && (Array.isArray(contract.a11y) ? contract.a11y.length : true)),
    props: man?.reactDocgen?.props ? Object.keys(man.reactDocgen.props).sort() : [],
    variants: contract?.variants ?? [],
    states: contract?.states ?? [],
    a11y: contract?.a11y ?? null,
    minTarget: minTarget ? { token: minTarget, value: resolve(lightVars, minTarget) } : null,
    sandbox,
    parts,
    anatomySource: `tokens/component.json → component.${key}.$extensions.bella.anatomy`,
    storyUrl: man?.id ? `${STORYBOOK}?path=/docs/${man.id}--docs` : null,
    composedFrom: imports,
    tokens: {
      count: tokens.length,
      component: tokens.filter((t) => t.startsWith('--component-')).length,
      semantic: tokens.filter((t) => t.startsWith('--color-semantic-') || t.startsWith('--semantic-')).length,
      list: tokens,
    },
    _closure: new Set(tokens.flatMap((t) => [...closure(t)])),
  };
});

// composition depth: 0 = imports no BELLA component, n = 1 + max depth of imports
const byName = Object.fromEntries(components.map((c) => [c.name, c]));
function depth(c, seen = new Set()) {
  if (seen.has(c.name)) return 0;
  seen.add(c.name);
  return c.composedFrom.length ? 1 + Math.max(...c.composedFrom.map((n) => depth(byName[n], seen))) : 0;
}
for (const c of components) {
  c.compositionDepth = depth(c);
  c.composesInto = components.filter((o) => o.composedFrom.includes(c.name)).map((o) => o.name);
}

// ---- BELLA gate scripts (unmodified) ------------------------------------
function runGate(script, args = []) {
  const r = spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: BELLA, encoding: 'utf8' });
  return { script, exitCode: r.status, ok: r.status === 0, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

// contrast-pairs: pairs declared in the script, failures parsed from its output
const contrastRun = runGate('contrast-pairs.mjs');
const pairSrc = read('scripts/contrast-pairs.mjs');
const pairs = [...pairSrc.matchAll(/\['([^']+)',\s*'(--[\w-]+)',\s*'(--[\w-]+)',\s*(\w+|[\d.]+)\]/g)]
  .map((m) => ({ label: m[1], fg: m[2], bg: m[3] }))
  .filter((p) => !p.label.includes('forbidden'));
const failedLabels = new Set(
  [...contrastRun.stderr.matchAll(/^\s*- (?:light|dark): (.+?) (?:is|now passes) /gm)].map((m) => m[1])
);

// contract-parity: "checked a, b" and "key: ..." failure lines
const parityRun = runGate('contract-parity.mjs');
const checked = new Set((parityRun.stdout.match(/checked (.+)/)?.[1] ?? '').split(', ').filter((s) => s && s !== 'none'));
const exempt = (parityRun.stdout.match(/\(exempt\): (.+)/)?.[1] ?? '').split(', ').filter((s) => s && s !== 'none');
const parityFailures = {};
for (const m of parityRun.stderr.matchAll(/^\s{2}([a-z-]+): (.+)$/gm)) (parityFailures[m[1]] ??= []).push(m[2]);

// token -> components that reach it (directly or through var() chains): the
// sandbox's blast radius
const tokenUsage = {};
for (const c of components) for (const t of c._closure) (tokenUsage[t] ??= []).push(c.name);

for (const c of components) {
  const covering = pairs.filter((p) => c._closure.has(p.fg) || c._closure.has(p.bg));
  const failing = covering.filter((p) => failedLabels.has(p.label));
  c.health = {
    contrast: {
      status: covering.length ? (failing.length ? 'fail' : 'pass') : 'not-covered',
      pairs: covering.length,
      failing: failing.map((p) => p.label),
    },
    contract: {
      status: !c.hasContract ? 'no-contract' : parityFailures[c.id] ? 'fail' : checked.has(c.id) ? 'pass' : 'unchecked',
      issues: parityFailures[c.id] ?? [],
    },
    visual: { status: 'skipped', note: 'TODO: audit:visual not run by sync (slow)' },
  };
  delete c._closure;
}

// ---- 10 AI-readiness stations -------------------------------------------
const total = components.length;
const pct = (n) => Math.round((n / total) * 100);
const count = (fn) => components.filter(fn).length;

const scored = (score, n, basis) => ({ score, assessment: 'measured', basis: `${n}/${total} components: ${basis}` });
const selfAssessed = { score: null, assessment: 'self-assessed', basis: 'No automated source yet' };

const nA11y = count((c) => c.hasA11yNotes && c.health.contrast.status !== 'fail');
const nDocs = count((c) => c.hasStory && c.hasDocs);
const nMachine = count((c) => c.inDsds && c.props.length > 0);
const nGov = count((c) => c.health.contract.status === 'pass');

const stations = [
  { id: 'coverage', name: 'Coverage', ...selfAssessed },
  { id: 'best-practices', name: 'Best practices', ...selfAssessed },
  { id: 'a11y', name: 'A11y', ...scored(pct(nA11y), nA11y,
      `contract a11y notes present and no failing contrast pair on their tokens (contrast-pairs: ${contrastRun.ok ? 'OK' : 'FAILED'})`) },
  { id: 'shared-language', name: 'Shared language', ...selfAssessed },
  { id: 'testing', name: 'Testing', ...selfAssessed, basis: 'audit:visual not yet wired (TODO)' },
  { id: 'orchestration', name: 'Orchestration', ...selfAssessed },
  { id: 'governance', name: 'Governance', ...scored(pct(nGov), nGov,
      'Tier 3 contract checked by contract-parity and passing') },
  { id: 'docs', name: 'Docs', ...scored(pct(nDocs), nDocs, 'Storybook story and a docs description in the manifest') },
  { id: 'machine-readable', name: 'Machine-readable', ...scored(pct(nMachine), nMachine,
      'DSDS component entry and react-docgen props in the manifest') },
  { id: 'agent-access', name: 'Agent access', ...selfAssessed },
];

// ---- history: one point per BELLA commit that touched components or contracts
// Real commits only (first-parent, newest 30). Each point counts what that
// commit actually held, and runs that commit's own contrast-pairs and
// contract-parity in a scratch copy; gate is null where a script did not
// exist yet. Points already in data/bella.json are reused by commit.
const HISTORY_MAX = 30;
const previous = (() => {
  try {
    return Object.fromEntries((JSON.parse(readFileSync(join(OUT_DIR, 'bella.json'), 'utf8')).history ?? []).map((h) => [h.commit, h]));
  } catch {
    return {};
  }
})();

function gateAt(sha, files) {
  const has = (f) => files.includes(f);
  if (!has('scripts/contrast-pairs.mjs') && !has('scripts/contract-parity.mjs')) return null;
  const dir = mkdtempSync(join(tmpdir(), 'chip-history-'));
  try {
    const paths = ['tokens', 'scripts', 'src/components'].filter((d) => files.some((f) => f.startsWith(d + '/')));
    const tar = spawnSync('git', ['-C', BELLA, 'archive', sha, ...paths], { maxBuffer: 1 << 28 });
    spawnSync('tar', ['-x', '-C', dir], { input: tar.stdout });
    const run = (script) =>
      has(`scripts/${script}`) ? spawnSync(process.execPath, [`scripts/${script}`], { cwd: dir, encoding: 'utf8' }).status === 0 : null;
    const contrast = run('contrast-pairs.mjs');
    const parity = run('contract-parity.mjs');
    const known = [contrast, parity].filter((x) => x !== null);
    return { contrastPairs: contrast, contractParity: parity, ok: known.every(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const shas = git('log', '--first-parent', `-${HISTORY_MAX}`, '--format=%h %cI', '--', 'src/components', 'tokens/component.json')
  .split('\n').filter(Boolean).map((l) => l.split(' '));
const history = shas.reverse().map(([sha, at]) => {
  if (previous[sha]) return previous[sha];
  const files = git('ls-tree', '-r', '--name-only', sha).split('\n');
  const comps = [...new Set(files.map((f) => f.match(/^src\/components\/([^/]+)\/\1\.tsx$/)?.[1]).filter(Boolean))];
  const stories = comps.filter((c) => files.includes(`src/components/${c}/${c}.stories.tsx`)).length;
  let contracts = 0;
  try {
    const cj = JSON.parse(git('show', `${sha}:tokens/component.json`)).component ?? {};
    contracts = comps.filter((c) => cj[kebab(c)]?.$extensions?.bella).length;
  } catch {}
  const n = comps.length;
  return {
    commit: sha,
    committedAt: at,
    components: n,
    storyCoverage: n ? Math.round((stories / n) * 100) : null,
    contractCoverage: n ? Math.round((contracts / n) * 100) : null,
    gate: gateAt(sha, files),
  };
}).filter((h) => h.components > 0); // before BELLA had a component there is nothing to measure

// ---- write ---------------------------------------------------------------
const out = {
  source,
  counts: {
    components: total,
    withStory: count((c) => c.hasStory),
    withDocs: count((c) => c.hasDocs),
    withContract: count((c) => c.hasContract),
    semanticTokenGroups: { light: Object.keys(semLight).sort(), dark: Object.keys(semDark).sort() },
    cssVars: { light: Object.keys(lightVars).length, darkOverrides: Object.keys(darkVars).length - Object.keys(lightVars).length },
  },
  gates: {
    contrastPairs: { ok: contrastRun.ok, summary: contrastRun.ok ? contrastRun.stdout : contrastRun.stderr.split('\n')[0] },
    contractParity: { ok: parityRun.ok, checked: [...checked], exemptContracts: exempt },
    visual: { ok: null, note: 'TODO: audit:visual skipped (slow)' },
  },
  stations,
  history,
  // semantic colours, resolved per theme, for the sandbox's token pickers and
  // its live contrast maths; ground is what the focus ring sits on
  palette: Object.fromEntries(
    Object.keys(lightVars).filter((t) => t.startsWith('--color-semantic-'))
      .map((t) => [t, { light: resolve(lightVars, t), dark: resolve(darkVars, t) }])
  ),
  ring: {
    color: { token: '--ring-focus-color', light: resolve(lightVars, '--ring-focus-color'), dark: resolve(darkVars, '--ring-focus-color') },
    ground: { token: '--color-semantic-background', light: resolve(lightVars, '--color-semantic-background'), dark: resolve(darkVars, '--color-semantic-background') },
  },
  tokenUsage,
  components,
};

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(out, null, 2) + '\n';
writeFileSync(join(OUT_DIR, 'bella.json'), json);
writeFileSync(join(OUT_DIR, 'bella.js'),
  '// Generated by scripts/sync-bella.mjs from data/bella.json. Do not edit.\nwindow.BELLA = ' + json.trimEnd() + ';\n');

console.log(`sync-bella: ${total} components from bella@${source.commit} · contrast ${contrastRun.ok ? 'OK' : 'FAIL'} · contract parity ${parityRun.ok ? 'OK' : 'FAIL'} · history ${history.length} commits`);
for (const s of stations) console.log(`  ${s.name.padEnd(17)} ${s.score === null ? 'self-assessed' : s.score + '%'}`);
