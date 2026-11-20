// Checks on Overview (phase 6 H, 3 Nov late): BELLA's own gate scripts and
// the Open Design System Bench, run against BELLA as committed (a detached
// temporary worktree at the proposal base, never the shared checkout, which
// other sessions are editing). Each result lands in data/checks/<id>.json;
// sessions read the same folder, so nobody re-runs a check to answer
// "where are we". Every status is one of three words the page shows:
// Passed, Failed, Waiting on you (plus Running and Not run yet).
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { DATA_DIR } from './config.mjs';
import { BELLA } from './bella-work.mjs';

export const BASE = process.env.BELLA_PROPOSAL_BASE || 'feat/chip-components';
export const CHECKS_DIR = join(DATA_DIR, 'checks');
const ODSB = process.env.ODSB_DIR || join(homedir(), 'DEV', 'tools', 'odsb');
const CHECKOUT = join(tmpdir(), 'chip-checks', 'bella');

const git = (args, cwd = BELLA) => execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const run = (cmd, args, cwd, env = {}) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    // eslint-disable-next-line no-control-regex
    p.on('close', (code) => resolve({ code, out: out.replace(/\x1b\[[0-9;]*m/g, ''), ms: Date.now() - t0 }));
    p.on('error', (e) => resolve({ code: 1, out: e.message, ms: Date.now() - t0 }));
  });

export const portBusy = (port) =>
  new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

/** What is staged in the shared checkout, when it sits on the base branch:
 * the work its next commit would carry, and so what the gate will judge. */
let stagedCache = { key: null, value: null };
export function staged() {
  // the staged patch is only re-read when BELLA's index or HEAD changes
  let key;
  try {
    const gitDir = git(['rev-parse', '--absolute-git-dir']).trim();
    key = `${statSync(join(gitDir, 'index')).mtimeMs}:${readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()}:${git(['rev-parse', BASE]).trim()}`;
  } catch {
    key = null;
  }
  if (key && stagedCache.key === key) return stagedCache.value;
  const value = readStaged();
  if (key) stagedCache = { key, value };
  return value;
}
function readStaged() {
  try {
    if (git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== BASE) return null;
    const patch = execFileSync('git', ['-C', BELLA, '--no-optional-locks', 'diff', '--cached', '--binary'], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!patch.length) return null;
    const files = git(['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean);
    return { patch, files, hash: createHash('sha1').update(patch).digest('hex').slice(0, 8) };
  } catch {
    return null;
  }
}

/** Puts BELLA as its next commit would be (the base's tip plus anything
 * staged in the shared checkout) into a temporary worktree at dir. */
export function prepare(dir, { branch, withStaged = true } = {}) {
  const sha = git(['rev-parse', BASE]).trim();
  if (branch) git(['worktree', 'add', '-q', '-b', branch, dir, sha]);
  else if (!existsSync(join(dir, '.git'))) {
    mkdirSync(join(dir, '..'), { recursive: true });
    // the system clears the temp folder but git still lists the old worktree,
    // and every check then "couldn't run" (19 Nov): forget worktrees whose
    // folder is gone (prune touches nothing else) before adding it again
    git(['worktree', 'prune']);
    git(['worktree', 'add', '-q', '--detach', dir, sha]);
  } else {
    git(['checkout', '-q', '--detach', '--force', sha], dir);
    git(['clean', '-fdq', '-e', 'node_modules', '-e', 'storybook-static'], dir);
  }
  try {
    lstatSync(join(dir, 'node_modules'));
  } catch {
    symlinkSync(join(BELLA, 'node_modules'), join(dir, 'node_modules'));
  }
  const st = withStaged ? staged() : null;
  if (st) {
    const file = join(tmpdir(), `chip-staged-${st.hash}.patch`);
    writeFileSync(file, st.patch);
    execFileSync('git', ['-C', dir, 'apply', '--index', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return {
    dir,
    sha: sha.slice(0, 7),
    target: st ? { kind: 'staged', files: st.files.length, hash: st.hash, list: st.files } : { kind: 'committed' },
  };
}
const checkout = () => prepare(CHECKOUT);

// what a failing script line says, minus the script's own name
const failLines = (out) => out.split('\n').map((l) => l.trim()).filter((l) => /^- /.test(l)).map((l) => l.slice(2));
const lastLine = (out) => out.trim().split('\n').filter(Boolean).at(-1) ?? '';

/* ---------- the checks ---------- */
// plain: what passing means, said once. schedule: when it runs without her.
export const CHECKS = [
  {
    id: 'contrast',
    name: 'Colour contrast',
    plain: 'Every text and surface pair meets its bar in all four themes.',
    schedule: 'Every commit, in the gate',
    gate: true,
    async run(dir) {
      const r = await run('node', ['scripts/contrast-pairs.mjs'], dir);
      return { ok: r.code === 0, summary: r.code === 0 ? lastLine(r.out) : r.out.split('\n')[0], failures: failLines(r.out), log: r.out, ms: r.ms };
    },
  },
  {
    id: 'contract',
    name: 'Contracts match the code',
    plain: 'Each component’s contract lists the props, variants and states the code has.',
    schedule: 'Every commit, in the gate',
    gate: true,
    async run(dir) {
      const r = await run('node', ['scripts/contract-parity.mjs'], dir);
      return { ok: r.code === 0, summary: lastLine(r.out), failures: failLines(r.out), log: r.out, ms: r.ms };
    },
  },
  {
    id: 'agents-md',
    name: 'AGENTS.md covers every component',
    plain: 'The file agents read first names every component and points at its contract.',
    schedule: 'Every commit, in the gate',
    gate: true,
    async run(dir) {
      const r = await run('node', ['scripts/agents-md-check.mjs'], dir);
      return { ok: r.code === 0, summary: lastLine(r.out), failures: failLines(r.out), log: r.out, ms: r.ms };
    },
  },
  {
    id: 'tokens-built',
    name: 'Generated files are up to date',
    plain: 'Rebuilding the tokens changes nothing: CSS, JSON and the DSDS spec match their sources.',
    schedule: 'Every commit, in the gate',
    gate: true,
    async run(dir) {
      const b = await run('npm', ['run', 'build'], dir);
      if (b.code !== 0) return { ok: false, summary: 'The token build failed', failures: [lastLine(b.out)], log: b.out, ms: b.ms };
      const files = ['tokens/bella.css', 'tokens/bella.json', 'bella.dsds.yaml', 'docs/bella.css', 'docs/tokens.md', '.storybook/theme-values.json'];
      const d = await run('git', ['diff', '--stat', '--', ...files], dir);
      const changed = d.out.trim().split('\n').filter((l) => l.includes('|')).map((l) => l.split('|')[0].trim());
      return { ok: changed.length === 0, summary: changed.length ? `${changed.length} generated file${changed.length === 1 ? '' : 's'} out of date` : 'Rebuilt: no generated file changed', failures: changed.map((f) => `${f} differs from its source`), log: b.out.slice(-1500) + d.out, ms: b.ms + d.ms };
    },
  },
  {
    id: 'visual',
    name: 'Stories: accessibility and interactions',
    plain: 'Every story renders, passes axe and its interaction test, in light and dark.',
    schedule: 'Every commit, in the gate (about 3 minutes)',
    gate: true,
    slow: true,
    async run(dir) {
      if (await portBusy(6006)) return { ok: false, summary: 'Not run: port 6006 is in use', failures: ['A Storybook is already running on 6006 (another session?). The audit serves its own build there; stop that one and run again.'], ms: 0 };
      const r = await run('npm', ['run', 'audit:visual'], dir);
      const m = r.out.match(/Tests:\s+(.*)/);
      // the failing stories files, each with what the runner said first
      const fails = [...new Set([...r.out.matchAll(/FAIL\s+(?:browser: \w+\s+)?(src\/\S+\.stories\.tsx)/g)].map((x) => x[1]))].map((f) => {
        const at = r.out.indexOf(f);
        const why = r.out.slice(at).match(/was ([\d.]+)% different from snapshot|\[audit:visual\] [\w-]+: ([^(\n]+)/);
        return `${f.split('/').at(-1).replace('.stories.tsx', '')}: ${why ? (why[1] ? `a picture is ${Number(why[1]).toFixed(1)}% different from its baseline` : why[2].trim()) : 'a test failed'}`;
      });
      // one verdict per stories file, so each component page can show its own
      const suites = Object.fromEntries([...r.out.matchAll(/\b(PASS|FAIL)\b.*?(src\/\S+\.stories\.tsx)/g)].map((x) => [x[2], x[1] === 'PASS' ? 'pass' : 'fail']));
      const snaps = r.out.match(/Snapshots:\s+(.*)/)?.[1]?.trim() ?? null;
      return { ok: r.code === 0, summary: m ? `Tests: ${m[1].trim()}${snaps ? ` · snapshots: ${snaps}` : ''}` : lastLine(r.out), failures: fails, suites, log: r.out.slice(-3000), ms: r.ms };
    },
  },
  {
    id: 'bench-static',
    name: 'Design System Bench, static',
    plain: 'How readable BELLA is to an agent: catalog, tokens, docs, enablement files. No model, no cost.',
    schedule: 'Weekly',
    async run(dir) {
      const runs = existsSync(join(ODSB, 'runs')) ? readdirSync(join(ODSB, 'runs')).sort() : [];
      const args = ['tsx', 'src/cli.ts', 'audit', '--system', 'bella', '--json', '--offline', ...(runs.length ? ['--run', join(ODSB, 'runs', runs.at(-1))] : [])];
      const r = await run('npx', args, ODSB, { ODSB_BELLA_DIR: dir });
      let s;
      try {
        s = JSON.parse(r.out.slice(r.out.indexOf('{'))).systems.bella.score;
      } catch {
        return { ok: false, summary: 'The bench could not run', failures: [lastLine(r.out)], log: r.out.slice(-1500), ms: r.ms };
      }
      const warns = s.surface.checks.flatMap((c) => c.findings.filter((f) => f.severity === 'warn').map((f) => `${c.title}: ${f.message}`));
      return {
        // the bench grades, it doesn't gate: below AI-native (70) is a finding, not a failure
        ok: s.composite >= 70,
        summary: `Composite ${s.composite} (${s.tier}), ${s.basis === 'surface-only' ? 'static only' : `with the ${runs.at(-1)} agent run`}`,
        score: s.composite,
        tier: s.tier,
        parts: Object.fromEntries(s.surface.checks.map((c) => [c.title, c.score])),
        failures: warns.slice(0, 10),
        log: '',
        ms: r.ms,
        cost: 0,
      };
    },
  },
  {
    id: 'bench-agents',
    name: 'Design System Bench, agents',
    plain: 'Ten real tasks built by Claude with and without AGENTS.md, graded. Uses the plan.',
    schedule: 'Monthly, only after you say yes',
    manual: true, // spends plan usage: CHIP never starts it on its own
  },
];
const byId = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
export const measureBench = (dir) => byId['bench-static'].run(dir);

/* ---------- results ---------- */
const resultFile = (id) => join(CHECKS_DIR, `${id}.json`);
export function readResult(id) {
  try {
    return JSON.parse(readFileSync(resultFile(id), 'utf8'));
  } catch {
    return null;
  }
}
function save(id, r) {
  mkdirSync(CHECKS_DIR, { recursive: true });
  writeFileSync(resultFile(id), `${JSON.stringify(r, null, 2)}\n`);
}

// the last agent bench run, from its results file (read, never re-run)
function benchAgents() {
  const runs = existsSync(join(ODSB, 'runs')) ? readdirSync(join(ODSB, 'runs')).filter((d) => existsSync(join(ODSB, 'runs', d, 'results.json'))).sort() : [];
  if (!runs.length) return null;
  const id = runs.at(-1);
  const r = JSON.parse(readFileSync(join(ODSB, 'runs', id, 'results.json'), 'utf8'));
  const cells = r.aggregates ?? [];
  const mean = cells.length ? Math.round((cells.reduce((s, c) => s + c.meanOverall, 0) / cells.length) * 10) / 10 : null;
  const gates = cells.reduce((m, c) => ((m[c.worstGate] = (m[c.worstGate] ?? 0) + 1), m), {});
  const ranAt = r.manifest?.startedAt ?? new Date(statSync(join(ODSB, 'runs', id, 'results.json')).mtimeMs).toISOString();
  const ageDays = Math.floor((Date.now() - Date.parse(ranAt)) / 86400000);
  return {
    ranAt,
    run: id,
    commit: r.manifest?.systems?.bella?.commit?.slice(0, 7) ?? null,
    score: mean,
    summary: `Overall ${mean} over ${cells.length} tasks: ${gates.pass ?? 0} pass, ${gates.review ?? 0} review, ${gates.fail ?? 0} fail`,
    due: ageDays >= 30,
    ageDays,
  };
}

const jobs = new Map(); // check id -> { startedAt }
let queue = Promise.resolve();

// a script's own last line ("contract parity: OK") in words; "(…)" keeps what it measured
const plainSummary = (s) => (s ? s.replace(/^[\w -]+: OK(?: \((.+)\))?$/, (_, what) => what ?? 'No differences') : null);

/** Runs one check (or 'gate': every gate check in order) in the clean checkout. */
export function runCheck(id) {
  const ids = id === 'gate' ? CHECKS.filter((c) => c.gate).map((c) => c.id) : [id];
  for (const i of ids) {
    const c = byId[i];
    if (!c) throw new Error(`No check "${i}"`);
    if (c.manual) throw new Error(`${c.name} spends plan usage; run it from the bench yourself (npm run run in ~/DEV/tools/odsb)`);
  }
  if (ids.some((i) => jobs.has(i))) return { running: ids.filter((i) => jobs.has(i)) };
  for (const i of ids) jobs.set(i, { startedAt: new Date().toISOString() });
  // one at a time: the checks share one checkout and the build writes into it
  queue = queue.then(async () => {
    let co;
    try {
      co = checkout();
    } catch (e) {
      for (const i of ids) {
        save(i, { id: i, ok: false, ranAt: new Date().toISOString(), summary: 'Could not check out BELLA', failures: [e.message] });
        jobs.delete(i);
      }
      return;
    }
    for (const i of ids) {
      const c = byId[i];
      let r;
      try {
        r = await c.run(co.dir);
      } catch (e) {
        r = { ok: false, summary: 'The check crashed', failures: [e.message], ms: 0 };
      }
      const prev = readResult(i);
      save(i, { id: i, ...r, ranAt: new Date().toISOString(), commit: co.sha, base: BASE, target: co.target, previous: prev ? { ok: prev.ok, ranAt: prev.ranAt, commit: prev.commit, score: prev.score ?? null } : null });
      jobs.delete(i);
    }
  });
  return { started: ids };
}

/** GET /checks: every check with its last result and one status word. */
export function listChecks({ waiting = [], fixable = [] } = {}) {
  const out = CHECKS.map((c) => {
    if (c.manual) {
      const b = benchAgents();
      return {
        id: c.id, name: c.name, plain: c.plain, schedule: c.schedule, manual: true,
        status: !b ? 'not-run' : b.due ? 'waiting' : 'passed',
        word: !b ? 'Not run yet' : b.due ? 'Waiting on you' : 'Passed',
        summary: b ? `${b.summary}. ${b.due ? `Last run ${b.ageDays} days ago: due again, and it spends plan usage, so it waits for your yes.` : ''}`.trim() : 'No agent run on this machine yet.',
        ranAt: b?.ranAt ?? null, commit: b?.commit ?? null, score: b?.score ?? null, cost: 'About $4 of plan usage, 15 minutes (8 Oct baseline)',
      };
    }
    const r = readResult(c.id);
    const running = jobs.has(c.id);
    const fixReady = waiting.includes(c.id);
    const status = running ? 'running' : !r ? 'not-run' : fixReady ? 'waiting' : r.ok ? 'passed' : 'failed';
    const word = { running: 'Running', 'not-run': 'Not run yet', waiting: 'Waiting on you', passed: 'Passed', failed: 'Failed' }[status];
    return {
      id: c.id, name: c.name, plain: c.plain, schedule: c.schedule, gate: !!c.gate, slow: !!c.slow,
      status, word,
      summary: plainSummary(r?.summary), failures: r?.failures ?? [], ranAt: r?.ranAt ?? null, commit: r?.commit ?? null,
      ms: r?.ms ?? null, target: r?.target ?? null, improve: fixable.find((f) => f.id === c.id)?.title ?? null, score: r?.score ?? null, parts: r?.parts ?? null, previous: r?.previous ?? null, cost: c.id === 'bench-static' ? 'No model, no cost' : 'Local, no cost',
    };
  });
  const gateChecks = out.filter((c) => c.gate);
  const gate = {
    id: 'gate',
    name: 'The gate',
    plain: `All ${gateChecks.length} gate checks green: BELLA accepts a commit only then.`,
    schedule: 'Every commit (pre-commit hook)',
    status: gateChecks.some((c) => c.status === 'running') ? 'running' : gateChecks.some((c) => c.status === 'failed') ? 'failed' : gateChecks.some((c) => c.status === 'waiting') ? 'waiting' : gateChecks.some((c) => c.status === 'not-run') ? 'not-run' : 'passed',
  };
  // the one count of the gate, for the nav, the banner and the Checks card
  const tally = (s) => gateChecks.filter((c) => c.status === s).length;
  gate.counts = { total: gateChecks.length, passed: tally('passed'), failed: tally('failed'), notRun: tally('not-run') };
  // the gate's own checks by name, and when they last ran: one source for Health, System map and Connectors
  gate.members = gateChecks.map((c) => ({ id: c.id, name: c.name, status: c.status }));
  gate.ranAt = gateChecks.map((c) => c.ranAt).filter(Boolean).sort().pop() ?? null;
  gate.word = { running: 'Running', 'not-run': 'Not run yet', waiting: 'Waiting on you', passed: 'Passed', failed: 'Failed' }[gate.status];
  const failing = gateChecks.filter((c) => c.status === 'failed' || c.status === 'waiting');
  gate.summary = failing.length ? `Blocked by ${failing.map((c) => c.name.toLowerCase()).join(', ')}: no commit lands in BELLA until ${failing.length === 1 ? 'it passes' : 'they pass'}.` : gate.status === 'passed' ? 'Every gate check passed on the last run.' : 'Some gate checks have not run yet.';
  const st = staged();
  return { base: BASE, staged: st ? { files: st.files.length, hash: st.hash, list: st.files } : null, head: (() => { try { return git(['rev-parse', '--short', BASE]).trim(); } catch { return null; } })(), gate, checks: out };
}

export const checkRunning = (id) => jobs.has(id);
export const checkById = (id) => byId[id];

/** Re-runs the fast checks whose last result was for another BELLA (the base
 * moved, or the staged work changed). The stories audit waits for Run now. */
export function refreshIfStale() {
  let sha;
  try {
    sha = git(['rev-parse', '--short', BASE]).trim();
  } catch {
    return [];
  }
  const hash = staged()?.hash ?? null;
  const stale = CHECKS.filter((c) => !c.manual && !c.slow && !jobs.has(c.id)).filter((c) => {
    const r = readResult(c.id);
    return !r || r.commit !== sha || (r.target?.hash ?? null) !== hash;
  });
  for (const c of stale) runCheck(c.id);
  return stale.map((c) => c.id);
}
