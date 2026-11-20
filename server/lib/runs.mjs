// Runs (4 Nov): "Fix in a session" without a conversation. CHIP starts Claude
// Code headless (claude -p) with the brief already in it, in a temporary
// worktree of BELLA on a local chip/fix-run-* branch from the base, follows
// what it does, then commits the change through BELLA's own hook (NDA scan +
// the full gate). She reads an outcome: what Claude did, the diff, the gate's
// verdict, then Accept (keep the branch to merge) or Undo (delete it). Claude
// may edit and run the build in that worktree only; it never commits, pushes
// or merges, and her BELLA checkout is never touched.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** POST /runs { brief, title? } -> the run. One at a time: the gate needs port 6006. */
export async function startRun({ brief, title, from }) {
  if (typeof brief !== 'string' || brief.trim().length < 10) throw new Error('No brief to run');
  const busy = [...runs.values()].find((r) => ['starting', 'running', 'gate'].includes(r.status));
  if (busy) throw new Error(`Another run is still going: “${busy.title}”. It has to finish first (the gate needs port 6006).`);
  const at = new Date();
  const id = `${at.toISOString().slice(0, 10).replace(/-/g, '')}-${at.getTime().toString(36).slice(-5)}`;
  const name = title || brief.split('\n')[0].slice(0, 90);
  const branch = `chip/fix-run-${slug(name)}-${id.slice(-5)}`;
  const run = { id, title: name, from: from || 'a page', brief, branch, base: BASE, status: 'starting', step: 'Checking Claude Code is signed in', steps: [], startedAt: at.toISOString(), summary: null, diff: null, files: [], gate: null, error: null, cost: null };
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
      let log = cm.out;
      try {
        log = readFileSync('/tmp/bella-pre-commit-gate.log', 'utf8');
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
  logAction({ kind: 'keep', title: run.title, branch: run.branch, sha: run.sha, base: BASE });
  return public_(run);
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
