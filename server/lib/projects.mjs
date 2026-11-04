// Projects: the repos CHIP works on, CHIP itself included. The list lives in
// chip.config.local.json ("projects", gitignored: the paths are hers);
// chip.config.example.json shows the shape. Everything else is read live
// from each repo, read only: its pages and routes, how it uses BELLA, its
// branches, worktrees, commits and open PRs, and which Claude Code sessions
// worked in it today. The one thing CHIP writes is the "what we're working
// on" note, back into the local config.
// A dev server is started only from the command in the config, and stopped
// only if CHIP started it (a server already running is never touched).
import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { BELLA_DIR, PORT, ROOT } from './config.mjs';

const CONFIG = join(ROOT, 'chip.config.local.json');
const home = (p) => (typeof p === 'string' ? p.replace(/^~(?=\/|$)/, homedir()) : p);

// with no "projects" in the config: CHIP and BELLA, which config.mjs already
// knows, and the Playground's site folder
const FALLBACK = [
  { id: 'chip', name: 'CHIP', short: 'CHIP', repo: ROOT, pages: { kind: 'hash', file: 'app/src/App.jsx' } },
  { id: 'site', name: 'Site', short: 'Site', repo: process.env.CHIP_PLAY_SITE_DIR || join(homedir(), 'DEV', 'ctrl-alt-design'), pages: { kind: 'next' }, dev: { command: 'npm run dev', port: 3000 } },
  { id: 'bella', name: 'BELLA', short: 'BELLA', repo: BELLA_DIR, pages: { kind: 'storybook' }, dev: { command: 'npm run storybook', port: 6006 } },
];

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG, 'utf8'));
  } catch {
    return {};
  }
}

/** The registry as configured, paths expanded. */
export function projectList() {
  const list = Array.isArray(readConfig().projects) ? readConfig().projects : FALLBACK;
  return list
    .filter((p) => p && /^[\w-]+$/.test(p.id ?? '') && p.repo)
    .map((p) => {
      const repo = home(p.repo);
      // CHIP's pages are read from the checkout this server runs from, the one being served
      const src = p.id === 'chip' && !p.dev ? ROOT : repo;
      return { ...p, short: p.short ?? p.name ?? p.id, repo, src };
    });
}
export const projectOf = (id) => projectList().find((p) => p.id === id) ?? null;

/* ---------- shell helpers: read only, short timeouts ---------- */
const run = (cmd, args, cwd, timeout = 4000) =>
  new Promise((done) =>
    execFile(cmd, args, { cwd, timeout, maxBuffer: 4 << 20 }, (err, out) => done(err ? null : String(out).trim())),
  );
const git = (cwd, ...args) => run('git', args, cwd);

const portOpen = (port, host = '127.0.0.1') =>
  new Promise((done) => {
    const s = net.connect({ port, host });
    const end = (v) => (s.destroy(), done(v));
    s.setTimeout(600, () => end(false));
    s.on('connect', () => end(true));
    s.on('error', () => end(false));
  });

/* ---------- pages and routes, read from the repo ---------- */
// Next.js app router: every page.tsx under app/, route groups dropped; a
// dynamic segment expands from a content folder when the config names one
// ("expand": { "/case-studies/[slug]": "content/case-studies" })
function nextPages(repo, expand = {}) {
  const app = join(repo, 'app');
  if (!existsSync(app)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!/^[_@]/.test(e.name) && e.name !== 'api') walk(join(dir, e.name));
      } else if (/^page\.(tsx|jsx|ts|js)$/.test(e.name)) {
        const route = '/' + relative(app, dir).split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
        const file = relative(repo, join(dir, e.name));
        const dynamic = /\[/.test(route);
        const from = expand[route];
        if (dynamic && from && existsSync(join(repo, from))) {
          for (const f of readdirSync(join(repo, from))) {
            const m = f.match(/^([a-z0-9][\w-]*)\.(tsx?|md|mdx|json)$/);
            if (m && m[1] !== 'index') out.push({ route: route.replace(/\[[^\]]+\]/, m[1]), label: m[1], file, source: join(from, f) });
          }
        }
        out.push({ route, label: route === '/' ? 'Home' : route, file, ...(dynamic ? { dynamic: true } : {}) });
      }
    }
  };
  walk(app);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

// CHIP: the hash routes in its own nav list ({ id: 'health', label: 'Overview', … }),
// PAGES today, WORKSPACES on older branches
function hashPages(repo, file = 'app/src/App.jsx') {
  const f = join(repo, file);
  if (!existsSync(f)) return [];
  const src = readFileSync(f, 'utf8');
  const at = src.search(/const (PAGES|WORKSPACES) = \[/);
  if (at < 0) return [];
  const list = src.slice(at, src.indexOf('];', at));
  return [...list.matchAll(/\{\s*id:\s*'([\w-]+)',\s*label:\s*'([^']+)'/g)].map(([, id, label]) => ({ route: `#/${id}`, label, file }));
}

// BELLA: one entry per stories file, at its docs page in Storybook (the
// preview iframe, so the page measured is the docs, not Storybook's chrome)
function storyPages(repo) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'node_modules') walk(join(dir, e.name));
      else if (/\.stories\.(tsx|jsx|ts|js|mdx)$/.test(e.name)) {
        const file = join(dir, e.name);
        const title = readFileSync(file, 'utf8').match(/\btitle:\s*['"]([^'"]+)['"]/)?.[1];
        if (!title) continue;
        const id = title.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/\//g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        out.push({ route: `/iframe.html?viewMode=docs&id=${id}--docs`, label: title, file: relative(repo, file), component: title.split('/').pop().replace(/\W/g, '') });
      }
    }
  };
  if (existsSync(join(repo, 'src'))) walk(join(repo, 'src'));
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function pagesOf(p) {
  const kind = p.pages?.kind;
  try {
    if (kind === 'next') return nextPages(p.src, p.pages.expand);
    if (kind === 'hash') return hashPages(p.src, p.pages.file);
    if (kind === 'storybook') return storyPages(p.src);
  } catch {}
  return [];
}

/* ---------- which BELLA it uses ---------- */
export function bellaOf(p) {
  if (p.repo === BELLA_DIR || p.bella === 'self')
    return { kind: 'self', label: 'BELLA itself', detail: 'The design system’s own repo.' };
  const manifest = join(p.repo, 'lib', 'bella', 'sync-manifest.json');
  if (existsSync(manifest)) {
    try {
      const m = JSON.parse(readFileSync(manifest, 'utf8'));
      const files = Object.keys(m.files ?? {}).length;
      return { kind: 'synced', label: 'A synced copy', detail: `${files} files vendored from BELLA ${m.bella?.describe ?? m.bella?.version ?? ''}`.trim(), commit: m.bella?.commit?.slice(0, 7), source: 'lib/bella/sync-manifest.json' };
    } catch {}
  }
  for (const v of ['app/vite.config.js', 'vite.config.js', 'vite.config.ts']) {
    const f = join(p.repo, v);
    if (existsSync(f) && readFileSync(f, 'utf8').includes('@bella/components'))
      return { kind: 'in-place', label: 'BELLA in place', detail: 'Reads BELLA’s source from its checkout through aliases, no copy.', source: v };
  }
  try {
    const pkg = JSON.parse(readFileSync(join(p.repo, 'package.json'), 'utf8'));
    const dep = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).find((d) => /bella/i.test(d));
    if (dep) return { kind: 'package', label: 'The package', detail: `${dep}@${pkg.dependencies?.[dep] ?? pkg.devDependencies?.[dep]}`, source: 'package.json' };
  } catch {}
  return { kind: 'none', label: 'Not found', detail: 'No sync manifest, alias or package names BELLA.' };
}

/* ---------- live state: git, gh, Claude sessions ---------- */
async function gitState(p) {
  const r = p.repo;
  const [branch, head, defaultRef, status, logs, refs, wt] = await Promise.all([
    git(r, 'rev-parse', '--abbrev-ref', 'HEAD'),
    git(r, 'rev-parse', '--short', 'HEAD'),
    git(r, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'),
    git(r, 'status', '--porcelain'),
    git(r, 'log', '-n', '6', '--format=%h%x09%aI%x09%s'),
    git(r, 'for-each-ref', '--sort=-committerdate', '--count=8', '--format=%(refname:short)%09%(committerdate:iso-strict)%09%(subject)', 'refs/heads'),
    git(r, 'worktree', 'list', '--porcelain'),
  ]);
  const base = p.defaultBranch ?? defaultRef?.replace(/^origin\//, '') ?? 'main';
  const branches = await Promise.all(
    (refs ?? '').split('\n').filter(Boolean).map(async (l) => {
      const [name, date, subject] = l.split('\t');
      const ahead = name === base ? null : Number(await git(r, 'rev-list', '--count', `${base}..${name}`)) || 0;
      return { name, date, subject, ahead };
    }),
  );
  const worktrees = [];
  for (const block of (wt ?? '').split('\n\n')) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (!path || path === r) continue;
    worktrees.push({ path, name: path.split('/').pop(), branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null });
  }
  return {
    defaultBranch: base,
    branch,
    head,
    dirty: status ? status.split('\n').length : 0,
    commits: (logs ?? '').split('\n').filter(Boolean).map((l) => {
      const [sha, date, subject] = l.split('\t');
      return { sha, date, subject };
    }),
    branches,
    worktrees,
    worktreeCount: worktrees.length,
  };
}

async function prsOf(p) {
  const out = await run('gh', ['pr', 'list', '--state', 'open', '--limit', '10', '--json', 'number,title,headRefName,url,isDraft,updatedAt'], p.repo, 8000);
  if (out == null) return null; // gh missing, signed out or offline: left out
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// Claude Code keeps one folder per working directory under ~/.claude/projects,
// named after the path; a session is one .jsonl in it. Only the file times
// are read, never the transcripts.
function claudeSessions(p) {
  const dir = join(homedir(), '.claude', 'projects');
  if (!existsSync(dir)) return null;
  const slug = p.repo.replace(/[^\w]/g, '-');
  const day = Date.now() - 24 * 3600e3;
  const out = [];
  for (const d of readdirSync(dir)) {
    if (d !== slug && !d.startsWith(`${slug}--claude-worktrees-`)) continue;
    const where = d === slug ? '(main checkout)' : d.slice(`${slug}--claude-worktrees-`.length);
    let n = 0;
    let last = 0;
    try {
      for (const f of readdirSync(join(dir, d))) {
        if (!f.endsWith('.jsonl')) continue;
        const t = statSync(join(dir, d, f)).mtimeMs;
        if (t > day) n++;
        last = Math.max(last, t);
      }
    } catch {}
    if (n) out.push({ where, sessions: n, last: new Date(last).toISOString() });
  }
  return out.sort((a, b) => b.last.localeCompare(a.last));
}

/* ---------- dev servers CHIP started ---------- */
const started = new Map(); // id → { child, log: [], at }

function devOf(p) {
  if (p.id === 'chip' && !p.dev) return { self: true, port: PORT, url: `http://127.0.0.1:${PORT}` };
  if (!p.dev) return null;
  // CHIP_PLAY_SITE_URL points the site at another dev server (a worktree's)
  const url = (p.dev.url || (p.id === 'site' && process.env.CHIP_PLAY_SITE_URL) || '').replace(/\/$/, '') || null;
  const port = url ? Number(new URL(url).port) || 80 : Number(p.dev.port) || null;
  return { command: p.dev.command ?? null, port, url: url ?? (port ? `http://127.0.0.1:${port}` : null) };
}

export async function runState(p) {
  const dev = devOf(p);
  if (!dev) return { state: 'none' };
  if (dev.self) return { ...dev, state: 'running', by: 'self' };
  const mine = started.get(p.id);
  const up = dev.url ? await portOpen(Number(new URL(dev.url).port) || 80, new URL(dev.url).hostname) : false;
  return {
    ...dev,
    state: up ? 'running' : mine && mine.child.exitCode == null ? 'starting' : 'stopped',
    by: mine && mine.child.exitCode == null ? 'chip' : up ? 'outside' : null,
    log: mine ? mine.log.slice(-12) : undefined,
  };
}

export async function startDev(id) {
  const p = projectOf(id);
  const dev = p && devOf(p);
  if (!dev?.command) throw new Error('This project has no dev command in the config.');
  if (dev.port && (await portOpen(dev.port))) return { already: true, url: dev.url };
  const mine = started.get(id);
  if (mine && mine.child.exitCode == null) return { starting: true, url: dev.url };
  // the configured command only, in her login shell so npm and node are hers
  const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', dev.command], { cwd: p.repo, env: { ...process.env, PORT: String(dev.port ?? '') }, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { child, log: [], at: new Date().toISOString() };
  const keep = (b) => entry.log.push(...String(b).split('\n').filter(Boolean).map((l) => l.slice(0, 300))) && entry.log.splice(0, Math.max(0, entry.log.length - 200));
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  started.set(id, entry);
  return { started: true, url: dev.url };
}

export function stopDev(id) {
  const mine = started.get(id);
  if (!mine || mine.child.exitCode != null) throw new Error('CHIP did not start this server, so it leaves it alone.');
  mine.child.kill('SIGTERM');
  started.delete(id);
  return { stopped: true };
}
// CHIP's own children go with it
process.on('exit', () => {
  for (const { child } of started.values()) if (child.exitCode == null) child.kill('SIGTERM');
});

/* ---------- the note ---------- */
export function saveNote(id, text) {
  const cfg = readConfig();
  if (!Array.isArray(cfg.projects)) throw new Error('Add a "projects" list to chip.config.local.json first.');
  const p = cfg.projects.find((x) => x.id === id);
  if (!p) throw new Error(`No project ${id}`);
  p.note = String(text ?? '').slice(0, 2000);
  p.noteAt = new Date().toISOString();
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  return { note: p.note, noteAt: p.noteAt };
}

/* ---------- the API's shapes ---------- */
// live state costs a few git calls and one gh call a project: cached 30s
const cache = new Map();
async function live(p, fresh) {
  const hit = cache.get(p.id);
  if (!fresh && hit && Date.now() - hit.at < 30e3) return hit.v;
  const [g, prs] = await Promise.all([gitState(p), prsOf(p)]);
  const v = { ...g, prs, claude: claudeSessions(p) };
  cache.set(p.id, { at: Date.now(), v });
  return v;
}

function base(p) {
  const exists = existsSync(p.repo);
  return {
    id: p.id,
    name: p.name ?? p.id,
    short: p.short,
    description: p.description ?? '',
    repo: p.repo,
    src: p.src,
    exists,
    note: p.note ?? '',
    noteAt: p.noteAt ?? null,
    terminal: p.id, // the /term?repo= key
  };
}

/** One project, everything: setup, pages, BELLA, live state. */
export async function projectDetail(id, { fresh } = {}) {
  const p = projectOf(id);
  if (!p) return null;
  const b = base(p);
  if (!b.exists) return { ...b, pages: [], bella: null, run: { state: 'none' }, live: null };
  const [lv, rs] = await Promise.all([live(p, fresh), runState(p)]);
  const pages = pagesOf(p);
  return {
    ...b,
    run: rs,
    pages: pages.map((x) => ({ ...x, url: rs.url && !x.dynamic ? rs.url.replace(/\/$/, '') + (x.route.startsWith('#') ? `/${x.route}` : x.route) : null })),
    pageKind: p.pages?.kind ?? null,
    bella: bellaOf(p),
    live: lv,
  };
}

/** Every project, summed up for a list or a switcher. */
export async function projectsSummary() {
  return Promise.all(
    projectList().map(async (p) => {
      const d = await projectDetail(p.id);
      return {
        ...base(p),
        branch: d.live?.branch ?? null,
        defaultBranch: d.live?.defaultBranch ?? null,
        run: { state: d.run.state, url: d.run.url ?? null, by: d.run.by ?? null },
        pageCount: d.pages.length,
        bella: d.bella ? { kind: d.bella.kind, label: d.bella.label } : null,
        worktrees: d.live?.worktreeCount ?? 0,
        prs: d.live?.prs ? d.live.prs.length : null,
        lastCommit: d.live?.commits?.[0] ?? null,
      };
    }),
  );
}

/** The terminal's folders, from the same list. */
export const terminalRepos = () => Object.fromEntries(projectList().map((p) => [p.id, { label: p.short, dir: p.repo }]));
