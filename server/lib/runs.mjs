// Runs (4 Nov): "Fix in a session" without a conversation. CHIP starts Claude
// Code headless (claude -p) with the brief already in it, in a temporary
// worktree of BELLA on a local chip/fix-run-* branch from the base, follows
// what it does, then commits the change through BELLA's own hook (NDA scan +
// the full gate). She reads an outcome: what Claude did, the diff, the gate's
// verdict, then Accept (keep the branch to merge) or Undo (delete it). Claude
// may edit and run the build in that worktree only; it never commits, pushes
// or merges, and her BELLA checkout is never touched.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { CHIP_CLAUDE_BIN, CHIP_CLAUDE_MODEL, DATA_DIR } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE, prepare } from './checks.mjs';
import { logAction, portBusy, sh, strip, visualBlockers } from './review.mjs';

const RUNS_DIR = join(DATA_DIR, 'runs');
const RUN_MS = 20 * 60 * 1000;
const git = (args, cwd = BELLA) => execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hasBranch = (b) => !!git(['branch', '--list', b]).trim();
const runs = new Map(); // id -> run

// kept in data/runs/<id>.json, so Accept and Undo outlive a restart
const save = (run) => {
  try {
    mkdirSync(RUNS_DIR, { recursive: true });
    writeFileSync(join(RUNS_DIR, `${run.id}.json`), JSON.stringify(public_(run), null, 2));
  } catch {}
};
if (existsSync(RUNS_DIR)) {
  for (const f of readdirSync(RUNS_DIR).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const r = JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8'));
      if (['starting', 'running', 'gate'].includes(r.status)) Object.assign(r, { status: 'failed', step: null, error: 'CHIP restarted while this run was going' });
      runs.set(r.id, r);
    } catch {}
  }
}

// the tools Claude may use in the worktree: read, edit, build, BELLA's scripts
const ALLOW = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(npm run build)', 'Bash(npm run build:*)', 'Bash(node scripts/*)', 'Bash(npx tsc:*)', 'Bash(npm run typecheck:*)', 'Bash(npm run lint:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(ls:*)'];
const DENY = ['Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git merge:*)', 'Bash(git checkout:*)', 'Bash(git reset:*)', 'Bash(rm:*)', 'WebFetch', 'WebSearch'];

/** Is Claude Code installed and signed in? { ok, why?, fix? } */
export function claudeReady() {
  try {
    const s = JSON.parse(execFileSync(CHIP_CLAUDE_BIN, ['auth', 'status'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }));
    return s.loggedIn ? { ok: true, how: s.authMethod } : { ok: false, why: 'Claude Code is not signed in.', fix: 'claude /login' };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, why: `The ${CHIP_CLAUDE_BIN} command is not installed.`, fix: 'npm install -g @anthropic-ai/claude-code' };
    return { ok: false, why: 'Claude Code did not answer when CHIP asked if it is signed in.', fix: 'claude /login' };
  }
}

/* A run works on the one BELLA (coordinator, 22 Nov: a run on the old bella-chip-theme checkout failed at its
   gate): bella-parts on chip/parts-dev, never bella-chip-theme or ~/DEV/bella. Returns why not, or null. */
export const RUN_BELLA = { dir: 'bella-parts', branch: 'chip/parts-dev' };
export function runBellaProblem({ dir, base }) {
  const name = basename(String(dir ?? ''));
  if (name !== RUN_BELLA.dir) return `Runs work on ${RUN_BELLA.dir}, not ${name || 'no checkout'} (${dir})`;
  if (base !== RUN_BELLA.branch) return `Runs branch from ${RUN_BELLA.branch}, not ${base}`;
  return null;
}
const realBella = () => {
  try {
    return realpathSync(BELLA);
  } catch {
    return BELLA;
  }
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brief';
const public_ = ({ child, ...r }) => r;
export const getRun = (id) => (runs.has(id) ? public_(runs.get(id)) : null);
export const listRuns = () => [...runs.values()].map(public_).reverse();

// one line per thing Claude does, in words
function stepOf(tool) {
  const i = tool.input ?? {};
  const f = (p) => String(p ?? '').replace(/^.*?chip-runs\/[^/]+\//, '');
  if (tool.name === 'Edit' || tool.name === 'MultiEdit') return `Edited ${f(i.file_path)}`;
  if (tool.name === 'Write') return `Wrote ${f(i.file_path)}`;
  if (tool.name === 'Read') return `Read ${f(i.file_path)}`;
  if (tool.name === 'Bash') return `Ran ${String(i.command ?? '').slice(0, 80)}`;
  if (tool.name === 'Grep' || tool.name === 'Glob') return `Searched for ${String(i.pattern ?? '').slice(0, 60)}`;
  return `Used ${tool.name}`;
}

/** POST /runs { brief, title?, approved } -> the run. One at a time: the gate needs port 6006.
 *  A run costs plan usage, so it starts only from its approved plan (click test 22 Nov: one
 *  click on Health started a paid run). The page's plan drawer (templates/RunPlan.jsx) is the
 *  one place that sends approved: true; anything else is refused before Claude is touched. */
export async function startRun({ brief, title, from, approved, dryRun = false }) {
  if (approved !== true) throw new Error('A run starts only from its approved plan. Open the plan, then Approve plan');
  if (typeof brief !== 'string' || brief.trim().length < 10) throw new Error('No brief to run');
  const wrong = runBellaProblem({ dir: realBella(), base: BASE });
  if (wrong) throw new Error(wrong);
  const busy = [...runs.values()].find((r) => ['starting', 'running', 'gate'].includes(r.status));
  if (busy) throw new Error(`Another run is still going: “${busy.title}”. It has to finish first (the gate needs port 6006).`);
  const at = new Date();
  const id = `${at.toISOString().slice(0, 10).replace(/-/g, '')}-${at.getTime().toString(36).slice(-5)}`;
  const name = title || brief.split('\n')[0].slice(0, 90);
  const branch = `chip/fix-run-${slug(name)}-${id.slice(-5)}`;
  const run = { id, title: name, from: from || 'a page', brief, branch, base: BASE, status: 'starting', step: 'Checking Claude Code is signed in', steps: [], startedAt: at.toISOString(), summary: null, diff: null, files: [], gate: null, error: null, cost: null, dryRun: !!dryRun };
  runs.set(id, run);
  mkdirSync(RUNS_DIR, { recursive: true });
  run.briefFile = join(RUNS_DIR, `${id}.md`);
  writeFileSync(run.briefFile, brief);
  // the interactive fallback: the same brief, typed into claude in BELLA
  run.terminal = `claude "$(cat '${run.briefFile}')"`;
  const ready = claudeReady();
  if (!ready.ok) {
    Object.assign(run, { status: 'login', step: null, error: ready.why, fix: ready.fix });
    save(run);
    return public_(run);
  }
  if (await portBusy(6006)) {
    Object.assign(run, { status: 'failed', step: null, error: 'Port 6006 is in use (a Storybook is running). The gate needs it; stop that Storybook, then run again.' });
    return public_(run);
  }
  go(run).catch((e) => Object.assign(run, { status: 'failed', step: null, error: e.message }));
  return public_(run);
}

const step = (run, s) => {
  if (run.step) run.steps.push({ step: run.step, endedAt: new Date().toISOString() });
  run.step = s;
  save(run);
};

async function go(run) {
  const dir = join(tmpdir(), 'chip-runs', run.branch.replace(/\//g, '__'));
  mkdirSync(join(tmpdir(), 'chip-runs'), { recursive: true });
  let ok = false;
  try {
    step(run, `Making ${run.branch} from ${BASE}`);
    prepare(dir, { branch: run.branch, withStaged: false });
    // a dry run (tests, the demo check) goes this far and stops before the paid model call
    if (run.dryRun) {
      step(run, null);
      run.status = 'dry';
      run.summary = `Dry run: the worktree ${run.branch} was made from ${BASE} in ${realBella()}; stopped before the model call.`;
      return;
    }
    step(run, 'The agent is working on the brief');
    run.status = 'running';
    const prompt = `${run.brief}\n\n---\nYou are running headless for CHIP. Nobody will answer questions: decide, using AGENTS.md. You are in a fresh worktree of BELLA on the local branch ${run.branch}, made from ${BASE}. Make the change here. Run npm run build if you change tokens, contracts or anything generated. Do not commit, push, merge or switch branches: CHIP commits your change through BELLA's gate afterwards. End with a short summary for Elleta: one line per file changed and why, then anything you could not do.`;
    const r = await claude(run, prompt, dir);
    run.summary = r.summary;
    run.cost = r.cost;
    if (r.error) throw new Error(r.error);
    const changed = git(['status', '--porcelain'], dir).split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => f !== 'node_modules' && !f.startsWith('storybook-static'));
    if (!changed.length) {
      step(run, null);
      run.status = 'nochange';
      return;
    }
    git(['add', '--', ...changed], dir);
    run.files = changed;
    run.diff = git(['diff', '--cached'], dir).slice(0, 40000);
    step(run, 'Committing: BELLA’s hook runs the NDA scan and the full gate');
    run.status = 'gate';
    const cm = await sh('git', ['-C', dir, 'commit', '-q', '-m', `fix: ${run.title}\n\nMade by Claude Code from a CHIP brief (headless), committed through BELLA's gate.`], dir);
    if (cm.code !== 0) {
      // the hook writes its log in the worktree's own git dir (BELLA pre-commit, 19 Nov), not /tmp
      let log = cm.out;
      try {
        log = readFileSync(join(git(['rev-parse', '--absolute-git-dir'], dir).trim(), 'pre-commit-gate.log'), 'utf8');
      } catch {}
      const blockers = visualBlockers(dir, log, run.branch);
      run.gate = { passed: false, log: strip(cm.out).slice(-3000), blockers };
      throw new Error(blockers ? `The gate refused the commit: ${blockers.suites.join(', ')} no longer match their baselines` : 'BELLA’s gate refused the commit');
    }
    run.sha = git(['rev-parse', '--short', 'HEAD'], dir).trim();
    run.gate = { passed: true };
    step(run, null);
    run.status = 'passed';
    ok = true;
    logAction({ kind: 'run', title: run.title, branch: run.branch, sha: run.sha, base: BASE, files: changed, sentence: run.summary?.split('\n')[0] ?? '' });
  } catch (e) {
    step(run, null);
    run.status = 'failed';
    run.error = run.stopped ? 'Stopped by a maintainer' : e.message;
    logAction({ kind: 'run-failed', title: run.title, branch: run.branch, error: e.message });
  } finally {
    // the end state goes to disk too, or a restart reads a finished run as cut off
    // ("CHIP restarted while this run was going") and a passed one can't be accepted
    save(run);
    try {
      if (lstatSync(join(dir, 'node_modules')).isSymbolicLink()) unlinkSync(join(dir, 'node_modules'));
    } catch {}
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {}
    if (!ok) {
      try {
        if (hasBranch(run.branch) && git(['rev-parse', run.branch]).trim() === git(['rev-parse', BASE]).trim()) git(['branch', '-D', run.branch]);
      } catch {}
    }
  }
}

// claude -p, streaming JSON: each tool use becomes a step she can read
function claude(run, prompt, cwd) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--model', CHIP_CLAUDE_MODEL, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', ...ALLOW, '--disallowedTools', ...DENY];
    const child = spawn(CHIP_CLAUDE_BIN, args, { cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    run.child = child;
    let buf = '';
    let err = '';
    let result = null;
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_MS);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.type === 'assistant') for (const c of m.message?.content ?? []) if (c.type === 'tool_use') run.steps.push({ step: stepOf(c), endedAt: new Date().toISOString(), claude: true });
        if (m.type === 'result') result = m;
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => (clearTimeout(timer), resolve({ error: `Claude Code could not start: ${e.message}` })));
    child.on('close', (code) => {
      clearTimeout(timer);
      run.child = null;
      const login = /log ?in|auth|credential/i.test(err) && !result;
      if (login) {
        run.fix = 'claude /login';
        return resolve({ error: 'Claude Code is not signed in.' });
      }
      if (!result) return resolve({ error: code === null ? 'Claude took longer than 20 minutes and was stopped.' : `Claude Code exited ${code}: ${strip(err).trim().slice(-300)}` });
      resolve({ summary: result.result ?? null, cost: result.total_cost_usd ?? null, error: result.is_error ? `Claude stopped: ${String(result.result ?? result.subtype).slice(0, 300)}` : null });
    });
  });
}

/** POST /runs/:id/stop */
export function stopRun(id) {
  const run = runs.get(id);
  if (!run?.child) throw new Error('Nothing is running');
  run.stopped = true; // so the end reads as a maintainer's stop, not the process's exit code
  run.child.kill('SIGTERM');
  return public_(run);
}

/** POST /runs/:id/keep: Accept. The branch waits for her to merge. */
export function keepRun(id) {
  const run = runs.get(id);
  if (run?.status !== 'passed') throw new Error('Only a run whose gate passed can be accepted');
  run.status = 'kept';
  save(run);
  logAction({ kind: 'keep', title: run.title, branch: run.branch, sha: run.sha, base: BASE, files: run.files ?? [], sentence: run.summary?.split('\n')[0] ?? '' });
  afterKeep(run).catch((e) => Object.assign(run, { step: null, afterError: e.message }));
  return public_(run);
}

/** GET /runs/plan: what a run does, in order, as startRun, go and afterKeep do it, so every plan a page shows
 *  (Talk, the plan sheet) lists the run's own actions, not the answer it came from. Keep it in step with them. */
export function runPlan() {
  return {
    steps: [
      { id: 'signin', title: 'Check Claude Code', detail: 'Claude Code must be signed in on this Mac' },
      { id: 'branch', title: 'Make a branch', detail: `A new branch from ${RUN_BELLA.branch} in ${RUN_BELLA.dir}; main is untouched` },
      { id: 'change', title: 'Make the change', detail: 'The agent works on the brief in that branch' },
      { id: 'gate', title: 'Commit through the gate', detail: 'BELLA’s hook runs the NDA scan and the full gate; if it fails, nothing is kept' },
      { id: 'accept', title: 'Your Accept', detail: 'You see before and after, then Accept or Undo' },
      { id: 'after', title: 'Specs, docs, Storybook', detail: 'After your Accept: the touched parts’ specs rebuilt, docs regenerated and committed, Storybook built, Figma listed for the parts session' },
    ],
  };
}

/** The parts a run's files touch: src/components/<Name>/… */
export const partsTouched = (files = []) => [...new Set(files.map((f) => f.match(/^src\/components\/([A-Z]\w+)\//)?.[1]).filter(Boolean))].sort();

/* After her Accept (coordinator, 22 Nov: "making a change" end to end), on the run's own branch in a fresh
   worktree: the touched parts' specs rebuilt from their code, the docs regenerated (BELLA's build), both committed
   through BELLA's gate, Storybook built from the branch into the run's own folder to look at, then where Figma and
   CHIP's data stand. Each is a step in the run's list as it happens (run.step, run.steps), so the run drawer and
   the Work card show it live. `only` picks steps (tests); nothing here pushes or merges. */
export const AFTER_STEPS = ['spec', 'docs', 'commit', 'storybook', 'figma', 'sync'];
export async function afterKeep(run, { only = AFTER_STEPS } = {}) {
  const dir = join(tmpdir(), 'chip-runs', `${run.branch.replace(/\//g, '__')}-after`);
  const parts = partsTouched(run.files);
  // a finished step replaces the running one in the list (step() would also log the running label)
  const done = (label) => ((run.step = null), run.steps.push({ step: label, endedAt: new Date().toISOString(), after: true }), save(run));
  const on = (id) => only.includes(id);
  run.after = { startedAt: new Date().toISOString(), parts };
  try {
    if (on('spec') || on('docs') || on('commit') || on('storybook')) {
      step(run, `Opening ${run.branch} to update its specs and docs`);
      git(['worktree', 'add', '-q', dir, run.branch]);
      try {
        lstatSync(join(dir, 'node_modules'));
      } catch {
        symlinkSync(join(BELLA, 'node_modules'), join(dir, 'node_modules'));
      }
    }
    if (on('spec')) {
      if (!parts.length) done('Specs: no part was touched');
      for (const name of parts) {
        step(run, `Rebuilding ${name}'s spec from its code`);
        save(run);
        const r = await sh(process.execPath, ['scripts/spec-build.mjs', name], dir);
        if (r.code !== 0) throw new Error(`${name}'s spec did not build: ${strip(r.out).trim().split('\n').at(-1)}`);
        done(`Spec rebuilt: ${name}`);
      }
    }
    if (on('docs')) {
      step(run, 'Regenerating the docs (BELLA build: tokens, machine-readable spec, docs)');
      save(run);
      const r = await sh('npm', ['run', 'build'], dir);
      if (r.code !== 0) throw new Error(`BELLA's build failed: ${strip(r.out).trim().split('\n').at(-1)}`);
      done('Docs regenerated');
    }
    if (on('commit')) {
      const changed = git(['status', '--porcelain'], dir).split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => f !== 'node_modules' && !f.startsWith('storybook-static'));
      if (!changed.length) done('Specs and docs already matched the change');
      else {
        step(run, `Committing ${changed.length} spec and doc ${changed.length === 1 ? 'file' : 'files'} through BELLA's gate`);
        save(run);
        git(['add', '--', ...changed], dir);
        const cm = await sh('git', ['-C', dir, 'commit', '-q', '-m', `docs: specs and docs for "${run.title}"\n\nRebuilt by CHIP after the run was accepted.`], dir);
        if (cm.code !== 0) throw new Error("BELLA's gate refused the spec and doc commit");
        run.afterSha = git(['rev-parse', '--short', 'HEAD'], dir).trim();
        done(`Specs and docs committed (${run.afterSha})`);
      }
    }
    if (on('storybook')) {
      step(run, 'Building Storybook from the branch');
      save(run);
      const out = join(RUNS_DIR, run.id, 'storybook');
      const r = await sh('npx', ['storybook', 'build', '--quiet', '-o', out], dir);
      if (r.code !== 0) throw new Error('Storybook did not build from the branch');
      run.storybook = out;
      done('Storybook built from the branch');
    }
    // Figma: a headless run can't write Figma safely yet (no Figma write path without the Desktop Bridge,
    // which takes the file from the session writing in it), so its part of the change is listed for the parts session
    if (on('figma')) done(parts.length ? `Figma: listed for the parts session (${parts.join(', ')})` : 'Figma: nothing to list');
    // CHIP reads BELLA's chip/parts-dev; its data re-syncs by itself when the branch is merged there (bella-work keepBellaFresh)
    if (on('sync')) done("CHIP's BELLA data: re-syncs when the branch is merged");
    run.after.endedAt = new Date().toISOString();
  } finally {
    step(run, null);
    save(run);
    try {
      if (lstatSync(join(dir, 'node_modules')).isSymbolicLink()) unlinkSync(join(dir, 'node_modules'));
    } catch {}
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {}
  }
}

/** POST /runs/:id/undo: deletes the branch, only when it holds the run's one commit. */
export function undoRun(id) {
  const run = runs.get(id);
  if (!run || !['passed', 'kept'].includes(run.status)) throw new Error('Nothing to undo');
  if (!hasBranch(run.branch)) throw new Error(`No local branch ${run.branch}`);
  const ahead = Number(git(['rev-list', '--count', `${BASE}..${run.branch}`]).trim());
  if (ahead !== 1) throw new Error(`${run.branch} has ${ahead} commits, not the run's one; delete it yourself if you mean to`);
  git(['branch', '-D', run.branch]);
  run.status = 'undone';
  save(run);
  logAction({ kind: 'undo', title: run.title, branch: run.branch, sha: run.sha, base: BASE });
  return public_(run);
}
