// Work's Agent, Gate and Ready lanes beyond CHIP's own runs (click test 22 Nov: "all I ever see is
// the Needs you"). Read only, all measured:
// - open pull requests in the projects CHIP works on (gh), by their CI: checks still running are At
//   the gate, every check passed is Ready. Only PRs that moved in the last WINDOW_DAYS, so the board
//   is today's work, not a year of bot bumps; the empty lane says so.
// - Claude Code sessions writing in a project's folders right now (only the file times under
//   ~/.claude/projects are read, never a transcript) are in Agent.
// A PR whose CI failed, or that has no CI, is left out here; it is named in the lane's empty line.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectList } from './projects.mjs';
import { DATA_DIR } from './config.mjs';

export const WINDOW_DAYS = 14;
export const ACTIVE_MIN = 10;
const CACHE_MS = 60e3;

const gh = (cwd) =>
  new Promise((done) =>
    execFile('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,url,isDraft,updatedAt,statusCheckRollup'], { cwd, timeout: 8000, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return done(null);
      try {
        done(JSON.parse(out));
      } catch {
        done(null);
      }
    }),
  );

/** One PR's CI in a word: checking, passed, failed or none. */
export function ciOf(rollup = []) {
  if (!rollup.length) return 'none';
  const word = (c) => String(c.conclusion || c.state || '').toUpperCase();
  if (rollup.some((c) => (c.status && c.status !== 'COMPLETED') || ['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS'].includes(word(c)))) return 'checking';
  if (rollup.some((c) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(word(c)))) return 'failed';
  return 'passed';
}

/** The PRs as lane cards, plus what was left out and why (the empty lines). */
export function prCards(byProject, now = Date.now()) {
  const since = now - WINDOW_DAYS * 864e5;
  const cards = [];
  const left = { failed: 0, none: 0, old: 0 };
  for (const { project, prs } of byProject) {
    for (const p of prs ?? []) {
      if (Date.parse(p.updatedAt) < since) {
        left.old++;
        continue;
      }
      const ci = ciOf(p.statusCheckRollup);
      if (ci === 'failed' || ci === 'none') {
        left[ci]++;
        continue;
      }
      cards.push({ id: `pr-${project.id}-${p.number}`, lane: ci === 'checking' ? 'gate' : 'ready', project: project.short ?? project.name, number: p.number, title: p.title, branch: p.headRefName, url: p.url, draft: !!p.isDraft, updatedAt: p.updatedAt, ci });
    }
  }
  return { cards, left };
}

const checkouts = (repo) => {
  try {
    const out = execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
    const paths = [...out.matchAll(/^worktree (.+)$/gm)].map((m) => m[1]);
    return paths.length ? paths : [repo];
  } catch {
    return [repo];
  }
};

/** Claude Code sessions that wrote in a project's folders in the last ACTIVE_MIN minutes. */
export function activeSessions(projects, now = Date.now(), dir = join(homedir(), '.claude', 'projects')) {
  if (!existsSync(dir)) return [];
  const folders = readdirSync(dir);
  const out = [];
  for (const p of projects) {
    // every checkout of the project's repo counts (sessions often run in the main checkout, CHIP in a worktree)
    const slugs = checkouts(p.repo).map((x) => x.replace(/[^\w]/g, '-'));
    let n = 0;
    let last = 0;
    for (const d of folders) {
      if (!slugs.some((slug) => d === slug || d.startsWith(`${slug}--claude-worktrees-`))) continue;
      try {
        for (const f of readdirSync(join(dir, d))) {
          if (!f.endsWith('.jsonl')) continue;
          const t = statSync(join(dir, d, f)).mtimeMs;
          if (now - t < ACTIVE_MIN * 60e3) {
            n++;
            last = Math.max(last, t);
          }
        }
      } catch {}
    }
    if (n) out.push({ id: `sessions-${p.id}`, project: p.short ?? p.name, count: n, last: new Date(last).toISOString() });
  }
  return out;
}

let cache = null;
let fresh = null;
async function readLanes() {
  const projects = projectList().filter((p) => existsSync(p.repo));
  const byProject = await Promise.all(projects.map(async (project) => ({ project, prs: await gh(project.repo) })));
  const reached = byProject.some((x) => x.prs);
  const { cards, left } = prCards(byProject);
  const data = { prs: cards, left, reached, sessions: activeSessions(projects), windowDays: WINDOW_DAYS, activeMin: ACTIVE_MIN, at: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}
/** GET /work/lanes: answers at once from the last read and reads GitHub again behind it when that is
 *  over a minute old, so a move on the board shows straight away. */
export async function workLanes() {
  if (!cache) return (fresh ??= readLanes().finally(() => (fresh = null)));
  if (Date.now() - cache.at > CACHE_MS && !fresh) fresh = readLanes().finally(() => (fresh = null));
  return cache.data;
}

/* Her moves on the board (click test 22 Nov: "it doesn't let me move any"). A move that means
   work (Needs you to Agent) opens a plan and becomes a run; any other move is her placement,
   kept here so it survives a reload and a restart: { cardId: { lane, at } }. The card keeps its
   own measured status; only where it sits is hers. Moving it back to where it came from clears it. */
const MOVES = join(DATA_DIR, 'work-moves.json');
const LANES = ['needs', 'agent', 'gate', 'ready'];
export function readMoves() {
  try {
    return JSON.parse(readFileSync(MOVES, 'utf8'));
  } catch {
    return {};
  }
}
/** POST /work/moves { id, lane | null } */
export function saveMove({ id, lane }, file = MOVES) {
  if (typeof id !== 'string' || !/^[\w.:/-]{1,160}$/.test(id)) throw new Error('No card to move');
  if (lane != null && !LANES.includes(lane)) throw new Error(`No lane called ${lane}`);
  let moves = {};
  try {
    moves = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  if (lane == null) delete moves[id];
  else moves[id] = { lane, at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(moves, null, 2));
  return moves;
}
