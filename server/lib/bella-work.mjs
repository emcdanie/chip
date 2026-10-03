// BELLA work from Atlas (Atlas v4, 2026-10-03): one component's
// Documentation (guidance md, contract, agent rules, related), its History
// from BELLA's git log, and the review flow: propose a change on a local
// branch (the pre-commit gate runs on it), then, on an explicit confirm,
// push ONLY that docs/<component>-<slug> branch and open a DRAFT pull
// request. CHIP never merges and never pushes anything else.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

export const BELLA = process.env.BELLA_DIR || join(homedir(), 'DEV', 'bella');
const BRANCH = /^docs\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const git = (args, opts = {}) => execFileSync('git', ['-C', opts.cwd ?? BELLA, '--no-optional-locks', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'], ...opts.exec });
const gitBuf = (args) => execFileSync('git', ['-C', BELLA, '--no-optional-locks', ...args], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });

function component(id) {
  const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
  const c = bella.components.find((x) => x.id === id);
  if (!c) throw new Error(`No BELLA component "${id}"`);
  return { c, all: bella.components };
}

const guidancePath = (id) => `docs/components/${id}.md`;
const contractBlock = (id) => JSON.parse(readFileSync(join(BELLA, 'tokens/component.json'), 'utf8')).component?.[id] ?? null;

/** Lines of BELLA's AGENTS.md that name the component, with their line numbers. */
function agentRules(name) {
  const lines = readFileSync(join(BELLA, 'AGENTS.md'), 'utf8').split('\n');
  const re = new RegExp(`\\b${name}\\b`);
  return lines.map((text, i) => ({ line: i + 1, text })).filter((l) => re.test(l.text)).slice(0, 8);
}

/** GET /bella-doc/:id */
export function readDoc(id) {
  const { c, all } = component(id);
  const gp = guidancePath(id);
  const md = existsSync(join(BELLA, gp)) ? readFileSync(join(BELLA, gp), 'utf8') : null;
  const block = contractBlock(id);
  const text = [...(c.usage ?? []), ...(c.dont ?? [])].join(' ');
  const related = all
    .filter((o) => o.id !== id && new RegExp(`\\b${o.name}\\b`).test(text))
    .map((o) => ({ id: o.id, name: o.name, why: (c.dont ?? []).find((d) => new RegExp(`\\b${o.name}\\b`).test(d)) ?? (c.usage ?? []).find((u) => new RegExp(`\\b${o.name}\\b`).test(u)) }));
  return {
    id,
    name: c.name,
    guidance: { path: gp, md },
    contract: { path: 'tokens/component.json', block: block ? JSON.stringify(block, null, 2) : null, usage: c.usage ?? [], dont: c.dont ?? [], props: c.props ?? [], states: c.states ?? [] },
    agents: { path: 'AGENTS.md', rules: agentRules(c.name) },
    related,
    proposals: proposals(id),
  };
}

/* ---------- propose: a local branch, the gate runs in the commit hook ---------- */
const jobs = new Map(); // id -> { status: 'running' | 'done' | 'failed', ... }
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'change';
const worktreeOf = (branch) => join(tmpdir(), 'chip-proposals', branch.replace(/\//g, '__'));

// the worktree borrows BELLA's node_modules through a symlink: unlink it
// first, so removing the worktree can never reach the shared folder
function removeWorktree(dir) {
  try {
    if (lstatSync(join(dir, 'node_modules')).isSymbolicLink()) unlinkSync(join(dir, 'node_modules'));
  } catch {}
  git(['worktree', 'remove', '--force', dir]);
}

function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

/** Lists this component's local proposal branches. */
export function proposals(id) {
  const out = git(['branch', '--list', `docs/${id}-*`, '--format=%(refname:short)%09%(subject)%09%(committerdate:short)']).trim();
  return out ? out.split('\n').map((l) => {
    const [branch, subject, date] = l.split('\t');
    const ahead = Number(git(['rev-list', '--count', `${currentBranch()}..${branch}`]).trim());
    return { branch, subject, date, ahead, job: [...jobs.values()].find((j) => j.branch === branch)?.status ?? null };
  }).filter((p) => p.ahead > 0) : [];
}

function applyEdit(dir, id, kind, content) {
  if (kind === 'guidance') {
    mkdirSync(join(dir, 'docs/components'), { recursive: true });
    writeFileSync(join(dir, guidancePath(id)), content.endsWith('\n') ? content : `${content}\n`);
    return [guidancePath(id)];
  }
  if (kind === 'contract') {
    const block = JSON.parse(content); // throws on invalid JSON
    for (const k of ['name', 'variants', 'states', 'props']) if (!(k in (block.$extensions?.bella ?? {}))) throw new Error(`The contract needs $extensions.bella.${k}`);
    // replace only this component's block, so the rest of the hand-formatted file is untouched
    const file = join(dir, 'tokens/component.json');
    const text = readFileSync(file, 'utf8');
    const start = text.indexOf(`\n    "${id}": {`);
    if (start < 0) throw new Error(`No "${id}" block in tokens/component.json`);
    const open = text.indexOf('{', start);
    let depth = 0;
    let end = -1;
    let inStr = false;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (ch === '\\') i++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) throw new Error('Could not find the end of the block');
    const body = JSON.stringify(block, null, 2).split('\n').map((l, i) => (i ? `    ${l}` : l)).join('\n');
    writeFileSync(file, text.slice(0, open) + body + text.slice(end));
    JSON.parse(readFileSync(file, 'utf8'));
    return ['tokens/component.json'];
  }
  if (kind === 'agents') {
    // content: [{ line, text }], each replacing that line of AGENTS.md
    const edits = JSON.parse(content);
    const file = join(dir, 'AGENTS.md');
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const e of edits) {
      if (!Number.isInteger(e.line) || e.line < 1 || e.line > lines.length) throw new Error(`No line ${e.line} in AGENTS.md`);
      lines[e.line - 1] = String(e.text).replace(/\n/g, ' ');
    }
    writeFileSync(file, lines.join('\n'));
    return ['AGENTS.md'];
  }
  throw new Error('kind must be guidance, contract or agents');
}

const run = (cmd, args, cwd) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

/** POST /bella-doc/:id/propose -> { job } */
export function propose(id, { kind, content, summary }) {
  const { c } = component(id);
  if (typeof content !== 'string' || !content.trim()) throw new Error('Nothing to propose');
  const base = currentBranch();
  const branch = `docs/${id}-${slug(summary || `${kind} edit`)}`;
  if (!BRANCH.test(branch)) throw new Error(`Not a docs branch name: ${branch}`);
  if (git(['branch', '--list', branch]).trim()) throw new Error(`${branch} already exists: open it or discard it first`);
  const job = `${Date.now().toString(36)}`;
  jobs.set(job, { status: 'running', branch, base, step: 'Making the branch' });
  (async () => {
    const dir = worktreeOf(branch);
    const set = (o) => jobs.set(job, { ...jobs.get(job), ...o });
    try {
      git(['worktree', 'add', '-b', branch, dir, base]);
      symlinkSync(join(BELLA, 'node_modules'), join(dir, 'node_modules'));
      const files = applyEdit(dir, id, kind, content);
      if (kind === 'contract') {
        set({ step: 'Rebuilding the generated token files' });
        const b = await run('npm', ['run', 'build'], dir);
        if (b.code !== 0) throw new Error(`npm run build failed:\n${b.out.slice(-1500)}`);
        files.push('tokens/bella.css', 'tokens/bella.json', 'tokens/preview.html', 'bella.dsds.yaml', 'docs/bella.css', 'docs/tokens.md');
      }
      git(['add', ...files], { cwd: dir });
      set({ step: 'Committing: the pre-commit hook runs the NDA scan and the gate' });
      const msg = `docs(${id}): ${summary || `${kind} edit`}\n\nProposed from CHIP Atlas · ${c.name}.`;
      const cm = await run('git', ['-C', dir, 'commit', '-q', '-m', msg], dir);
      const diff = git(['diff', `${base}...${branch}`, '--', ...files]);
      if (cm.code !== 0) {
        set({ status: 'failed', gate: 'red', log: cm.out.slice(-2500), diff });
        removeWorktree(dir);
        git(['branch', '-D', branch]);
        return;
      }
      set({ status: 'done', gate: 'green', log: cm.out.slice(-1500), diff, files, step: null });
      removeWorktree(dir); // the branch stays; the checkout goes
    } catch (e) {
      set({ status: 'failed', error: e.message });
      try {
        removeWorktree(dir);
      } catch {}
      try {
        if (git(['branch', '--list', branch]).trim()) git(['branch', '-D', branch]);
      } catch {}
    }
  })();
  return { job, branch };
}

export const jobOf = (job) => jobs.get(job) ?? null;

function checkBranch(branch) {
  if (!BRANCH.test(String(branch))) throw new Error('Only docs/<component>-<slug> branches');
  if (!git(['branch', '--list', branch]).trim()) throw new Error(`No local branch ${branch}`);
}

/** POST /bella-doc/discard: deletes a local proposal branch (never a remote). */
export function discard(branch) {
  checkBranch(branch);
  git(['branch', '-D', branch]);
  return { discarded: branch };
}

/**
 * POST /bella-doc/pr. Without confirm (or with dryRun) it only returns the
 * preview: the exact files, title, body and the two commands it would run.
 * With confirm and no dryRun it pushes ONLY that branch and opens a DRAFT PR.
 */
export async function pullRequest({ branch, confirm, dryRun }) {
  checkBranch(branch);
  const base = [...jobs.values()].find((j) => j.branch === branch)?.base ?? currentBranch();
  const remoteBase = git(['ls-remote', '--heads', 'origin', base]).trim() ? base : 'main';
  const files = git(['diff', '--name-only', `${base}...${branch}`]).trim().split('\n').filter(Boolean);
  const title = git(['log', '-1', '--format=%s', branch]).trim();
  const body = `${git(['log', '-1', '--format=%b', branch]).trim()}\n\nFiles: ${files.join(', ')}.\nThe BELLA gate ran green in the pre-commit hook on this branch. Draft: review before merging; CHIP does not merge.`;
  const commands = [
    ['git', '-C', BELLA, 'push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`],
    ['gh', 'pr', 'create', '--draft', '--base', remoteBase, '--head', branch, '--title', title, '--body', body],
  ];
  // the PR must carry this one commit only: count what the branch has that the remote base lacks
  const baseSha = git(['ls-remote', '--heads', 'origin', remoteBase]).trim().split(/\s/)[0];
  let carries = null;
  try {
    carries = baseSha ? Number(git(['rev-list', '--count', `${baseSha}..${branch}`]).trim()) : null;
  } catch {
    carries = null; // the remote base is not in this clone yet
  }
  const blocked =
    carries === 1
      ? null
      : carries == null
        ? `Can't tell what the pull request would carry: ${remoteBase} on the remote is not in this clone. Fetch BELLA first.`
        : `A pull request against ${remoteBase} would carry ${carries} commits, not just this one: ${base} is not on the remote yet. Pushing ${base} is your call, outside CHIP.`;
  const preview = { branch, base: remoteBase, files, title, body, carries, blocked, commands: commands.map((c) => c.join(' ')) };
  if (!confirm || dryRun || blocked) return { dryRun: true, ...preview };
  const push = await run(commands[0][0], commands[0].slice(1), BELLA);
  if (push.code !== 0) return { ...preview, error: `git push failed: ${push.out.slice(-800)}` };
  const pr = await run(commands[1][0], commands[1].slice(1), BELLA);
  if (pr.code !== 0) return { ...preview, error: `gh pr create failed: ${pr.out.slice(-800)}` };
  return { ...preview, url: pr.out.trim().split('\n').pop() };
}

/* ---------- history ---------- */
const TYPES = [
  ['a11y', /a11y|contrast|focus|ring|aria|target|reduced motion/i],
  ['tokens', /token/i],
  ['docs', /^docs/i],
];
const historyCache = new Map();

function contractAt(sha, id) {
  try {
    return JSON.parse(git(['show', `${sha}:tokens/component.json`])).component?.[id]?.$extensions?.bella ?? null;
  } catch {
    return null;
  }
}

/** GET /bella-history/:id: one entry per commit that touched the component, newest first. */
export function history(id) {
  const { c } = component(id);
  const head = git(['rev-parse', 'HEAD']).trim();
  const key = `${id}@${head}`;
  if (historyCache.has(key)) return historyCache.get(key);
  const snap = `components-${c.name.toLowerCase()}--`;
  const paths = [`src/components/${c.name}`, guidancePath(id), `:(glob)src/__image_snapshots__/${snap}*`];
  const raw = git(['log', '--no-merges', '--date=short', '--format=%H%x1f%ad%x1f%s%x1f%b%x1e', '--', ...paths]);
  const entries = raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, date, subject, body] = r.split('\x1f');
    const files = git(['show', '--name-only', '--format=', sha]).trim().split('\n').filter(Boolean);
    const shots = files.filter((f) => f.includes(snap) && f.endsWith('-light.png'));
    const types = new Set();
    if (shots.length) types.add('visual');
    for (const [t, re] of TYPES) if (re.test(subject)) types.add(t);
    if (files.some((f) => f.startsWith('tokens/'))) types.add('tokens');
    // API: the contract's props or states changed for this component
    let api = null;
    if (files.includes('tokens/component.json')) {
      const now = contractAt(sha, id);
      const before = contractAt(`${sha}^`, id);
      if (now && before) {
        const d = (k) => ({ added: (now[k] ?? []).filter((x) => !(before[k] ?? []).includes(x)), removed: (before[k] ?? []).filter((x) => !(now[k] ?? []).includes(x)) });
        const props = d('props');
        const states = d('states');
        if (props.added.length || props.removed.length || states.added.length || states.removed.length) {
          api = { props, states, breaking: props.removed.length > 0 || states.removed.length > 0 };
          types.add('API');
        }
      }
    }
    if (!types.size) types.add(/^feat/.test(subject) ? 'visual' : 'docs');
    const pick = shots.find((f) => f.includes('--default-')) ?? shots[0];
    let images = null;
    if (pick) {
      const parentHas = (() => {
        try {
          git(['cat-file', '-e', `${sha}^:${pick}`]);
          return true;
        } catch {
          return false;
        }
      })();
      images = { path: pick, after: sha, before: parentHas ? `${sha}^` : null };
    }
    return {
      sha: sha.slice(0, 7),
      date,
      subject,
      explanation: subject.replace(/^\w+(\([^)]*\))?!?:\s*/, ''),
      detail: body.split('\n\n')[0].trim() || null, // line breaks kept: a list stays a list
      types: [...types],
      api,
      images,
    };
  });
  const out = { id, name: c.name, entries };
  historyCache.set(key, out);
  return out;
}

/** GET /bella-history/img?rev=&path=: a baseline image as it was at that commit. */
export function baseline(rev, path) {
  if (!/^[0-9a-f]{7,40}\^?$/.test(String(rev))) throw new Error('bad revision');
  if (!/^src\/__image_snapshots__\/components-[a-z0-9-]+--[a-z0-9-]+-(light|dark|warm)\.png$/.test(String(path))) throw new Error('bad path');
  return gitBuf(['show', `${rev}:${path}`]);
}
