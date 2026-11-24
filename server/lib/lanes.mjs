// Work's Agent, Gate and Ready lanes beyond CHIP's own runs (click test 22 Nov: "all I ever see is
// the Needs you"). Read only, all measured:
// - open pull requests in the projects CHIP works on (gh), by their CI: checks still running are At
//   the gate, every check passed is Ready. Only PRs that moved in the last WINDOW_DAYS, so the board
//   is today's work, not a year of bot bumps; the empty lane says so.
// - Claude Code sessions writing in a project's folders right now (only the file times under
//   ~/.claude/projects are read, never a transcript) are in Agent.
// A PR whose CI failed, or that has no CI, is left out here; it is named in the lane's empty line.
import { execFile, execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

/* ---------- The Work board in her Notion lanes (22 Nov: Ideas, Next, Now, Shipped, Not doing) ----------
   Every card is read from where the work already is, never typed:
   - Claude Code sessions: the app's session records (title, times, archived, waiting on a person) and
     each transcript's plan, replayed from its update_plan / wrap_up tool calls only (no message text).
     Only sessions in a project CHIP works on count, so private work never reaches the board.
   - The progress board (progress.json): review pages waiting on her, ideas to do, what shipped.
   - New tasks she sent (answers.json, type task).
   Components that need work come from CHIP's gap checks on the page (/gaps), as Health counts them.
   Her placements and order are hers, kept in data/work-board.json. */
const env = process.env;
const hm = (p) => p.replace(/^~\//, `${homedir()}/`);
export const SESSIONS_DIR = hm(env.CHIP_SESSIONS_DIR || '~/Library/Application Support/Claude/claude-code-sessions');
export const PROGRESS_DIR = hm(env.CHIP_PROGRESS_DIR || '~/DEV/chip/docs/reference/screens/progress');
export const REVIEW_URL = env.CHIP_REVIEW_URL || 'http://localhost:3123/screens/progress/';
export const SESSION_HOURS = 36;
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/** Replays one transcript line onto a plan: update_plan replaces or advances the list, wrap_up ends the turn. */
function replayLine(steps, line) {
  if (!line.includes('update_plan') && !line.includes('wrap_up')) return steps;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return steps;
  }
  if (o.isSidechain || !Array.isArray(o.message?.content)) return steps;
  for (const b of o.message.content) {
    if (b?.type !== 'tool_use') continue;
    const name = String(b.name ?? '');
    const i = b.input ?? {};
    if (name.endsWith('update_plan')) {
      if (Array.isArray(i.items)) steps = i.items.map((x) => ({ text: String(x.content ?? ''), status: x.status }));
      if (i.advance) {
        const k = steps.findIndex((x) => x.status === 'in_progress');
        if (k >= 0) {
          steps[k].status = 'completed';
          const n = steps.findIndex((x, j) => j > k && x.status === 'pending');
          if (n >= 0) steps[n].status = 'in_progress';
        }
      }
      for (const d of Array.isArray(i.done) ? i.done : []) if (steps[d - 1]) steps[d - 1].status = 'completed';
      if (steps[i.start - 1]) {
        for (const x of steps) if (x.status === 'in_progress') x.status = 'pending';
        steps[i.start - 1].status = 'in_progress';
      }
    }
    if (name.endsWith('wrap_up')) for (const x of steps) if (x.status === 'in_progress') x.status = 'completed';
  }
  return steps;
}
/** A plan from a transcript's text. */
export const replayPlan = (text) => text.split('\n').reduce(replayLine, []);

const ndaTerms = () => {
  try {
    return readFileSync(join(homedir(), '.claude', 'nda-terms.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  } catch {
    return [];
  }
};
// transcripts only grow: each read replays just the lines added since the last one
const plans = new Map(); // path -> { size, steps, rest }
const planOf = (path) => {
  const st = statSync(path);
  let p = plans.get(path);
  if (!p || st.size < p.size) p = { size: 0, steps: [], rest: '' };
  if (st.size > p.size) {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(st.size - p.size);
      readSync(fd, buf, 0, buf.length, p.size);
      const lines = (p.rest + buf.toString('utf8')).split('\n');
      const rest = lines.pop();
      p = { size: st.size, steps: lines.reduce(replayLine, p.steps.map((x) => ({ ...x }))), rest };
    } finally {
      closeSync(fd);
    }
    plans.set(path, p);
  }
  // a last line still being written is read as it stands, never kept
  return { steps: p.rest ? replayLine(p.steps.map((x) => ({ ...x })), p.rest) : p.steps, mtime: st.mtimeMs };
};

// the app's session records, read again only when they change; only the fields the board uses are kept
const recs = new Map();
const recordOf = (file) => {
  try {
    const m = statSync(file).mtimeMs;
    const hit = recs.get(file);
    if (hit?.m === m) return hit.r;
    const d = JSON.parse(readFileSync(file, 'utf8'));
    const r = { sessionId: d.sessionId, cliSessionId: d.cliSessionId, lastAssistantCliSessionId: d.lastAssistantCliSessionId, cwd: d.cwd, title: d.title, isArchived: d.isArchived, lastActivityAt: d.lastActivityAt, createdAt: d.createdAt, interruptedAwaitingPerson: d.interruptedAwaitingPerson, spawnedFrom: d.spawnedFrom ? { name: d.spawnedFrom.name } : null, model: d.model ?? null, lastTurnEdgeAt: d.lastTurnEdgeAt ?? null, report: d.turnWrapUp?.description ?? null, status: d.postTurnSummary ? { category: d.postTurnSummary.status_category ?? null, detail: d.postTurnSummary.status_detail ?? null, needs: d.postTurnSummary.needs_action ?? null } : null };
    recs.set(file, { m, r });
    return r;
  } catch {
    return null;
  }
};
/** The sessions of the last SESSION_HOURS in CHIP's projects, each with its plan. */
export function sessionTasks(projects, now = Date.now(), { dir = SESSIONS_DIR, transcripts = PROJECTS_DIR, terms = null } = {}) {
  if (!existsSync(dir)) return [];
  const roots = projects.flatMap((p) => checkouts(p.repo).map((path) => ({ path, project: p.short ?? p.name })));
  const where = (cwd) => roots.find((r) => cwd === r.path || cwd?.startsWith(`${r.path}/`));
  const files = new Map();
  try {
    for (const d of readdirSync(transcripts)) {
      try {
        for (const f of readdirSync(join(transcripts, d))) if (f.endsWith('.jsonl')) files.set(f.slice(0, -6), join(transcripts, d, f));
      } catch {}
    }
  } catch {}
  const nda = terms ? terms.map((t) => new RegExp(`\\b${t}\\b`, 'i')) : ndaTerms();
  // a line that names a private term is left out, like a private title
  const said = (t) => (t && !nda.some((re) => re.test(String(t))) ? String(t).slice(0, 300) : null);
  const out = [];
  const records = [];
  for (const a of readdirSync(dir)) {
    let subs = [];
    try {
      subs = readdirSync(join(dir, a));
    } catch {
      continue;
    }
    for (const b of subs) {
      try {
        for (const f of readdirSync(join(dir, a, b))) if (/^local_[\w-]+\.json$/.test(f)) records.push(join(dir, a, b, f));
      } catch {}
    }
  }
  for (const file of records) {
    const r = recordOf(file);
    if (!r) continue;
    if (r.isArchived || now - (r.lastActivityAt ?? 0) > SESSION_HOURS * 36e5) continue;
    const home = where(r.cwd);
    if (!home) continue;
    const title = String(r.title ?? '').slice(0, 120);
    if (!title || nda.some((t) => t.test(title))) continue;
    const path = files.get(r.lastAssistantCliSessionId) ?? files.get(r.cliSessionId);
    if (!path) continue;
    let plan;
    try {
      plan = planOf(path);
    } catch {
      continue;
    }
    out.push({
      id: r.sessionId,
      title,
      project: home.project,
      steps: plan.steps,
      startedAt: r.createdAt ?? null,
      updatedAt: Math.round(plan.mtime),
      working: now - plan.mtime < ACTIVE_MIN * 60e3,
      asks: !!r.interruptedAwaitingPerson,
      parent: r.spawnedFrom?.name ?? null,
      // what the session last said, as the app's own records hold it (its wrap-up recap and one-line status); Ask reads these
      model: r.model,
      reportedAt: r.lastTurnEdgeAt,
      report: said(r.report),
      status: r.status ? { category: r.status.category, detail: said(r.status.detail), needs: said(r.status.needs) } : null,
    });
  }
  return out.sort((x, y) => (x.startedAt ?? 0) - (y.startedAt ?? 0));
}

/** Has she already answered this "Waiting on you" item? Three records say so: the item's own "Answered …" detail, her
 *  answer on a card of its review page (answers.json, cards shape), and the board's shape keyed by the item's title. */
export function isAnswered(item, answers) {
  if (/^Answered\b/i.test(String(item.detail ?? ''))) return true;
  const link = String(item.link ?? '');
  const title = String(item.title ?? '').trim().toLowerCase();
  for (const e of Array.isArray(answers) ? answers : []) {
    const a = e?.answers;
    if (!a || typeof a !== 'object') continue;
    for (const c of a.cards ?? []) if ((c.answer || c.thumb) && /\//.test(String(c.from ?? '')) && link.includes(c.from) ) return true;
    if (!a.cards && !a.type) for (const [key, v] of Object.entries(a)) if (v && typeof v === 'object' && (v.answers ?? []).some((r) => r?.a) && String(v.title ?? key).trim().toLowerCase() === title) return true;
  }
  return false;
}

/** The progress board's items and her new tasks, with links made whole (review pages on :3123). */
export function progressItems(dir = PROGRESS_DIR, base = REVIEW_URL) {
  const read = (f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      return null;
    }
  };
  const prog = read('progress.json');
  const whole = (p) => {
    if (!p) return null;
    try {
      return new URL(p, base).href;
    } catch {
      return null;
    }
  };
  // a card keeps its id when items are added, so her placement stays with it; a repeated id gets its count
  const seen = new Map();
  const idOf = (i) => {
    const k = String(i.id ?? i.title).replace(/[^\w.:-]/g, '-').slice(0, 80);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? `p-${k}` : `p-${k}-${n}`;
  };
  const answers = read('answers.json');
  // something she has answered never asks again (23 Nov 2026): the board's own "Answered …" note, or her answer on the card in answers.json
  const items = (prog?.items ?? []).map((i, n) => ({ id: idOf(i), title: String(i.title ?? ''), stage: i.stage === 'Waiting on you' && isAnswered(i, answers) ? 'Answered' : i.stage, track: i.track ?? null, detail: i.detail ?? null, link: whole(i.link), img: whole(i.img), n }));
  const tasks = (Array.isArray(answers) ? answers : []).filter((a) => a?.type === 'task' && a.text).map((a, n) => ({ id: `task-${a.at ?? n}`, title: String(a.text).slice(0, 120), stage: 'To do', track: 'you', detail: null, link: null, img: null, at: a.at ?? null, n }));
  return { reached: !!prog, items, tasks };
}

/* Her placements and order: { place: { cardId: { lane, at, paused? } }, order: { lane: [cardId] } }.
   A card she never moved sits where CHIP measured it; one she moved keeps its own status. */
export const BOARD_LANES = ['ideas', 'next', 'now', 'shipped', 'not-doing'];
const BOARD = join(DATA_DIR, 'work-board.json');
export function readBoard(file = BOARD) {
  try {
    const b = JSON.parse(readFileSync(file, 'utf8'));
    return { place: b.place ?? {}, order: b.order ?? {}, ideas: b.ideas ?? [] };
  } catch {
    return { place: {}, order: {}, ideas: [] };
  }
}
const okId = (id) => typeof id === 'string' && /^[\w.:/-]{1,160}$/.test(id);
/** POST /work/board { id, lane | null, before?, paused? }: lane null puts it back where CHIP measured it. */
export function saveBoard({ id, lane, before = null, paused = false }, file = BOARD) {
  if (!okId(id)) throw new Error('No card to move');
  if (lane != null && !BOARD_LANES.includes(lane)) throw new Error(`No lane called ${lane}`);
  if (before != null && !okId(before)) throw new Error('No card to drop it before');
  const b = readBoard(file);
  for (const l of Object.keys(b.order)) b.order[l] = b.order[l].filter((x) => x !== id);
  if (lane == null) delete b.place[id];
  else {
    b.place[id] = { lane, at: new Date().toISOString(), ...(paused ? { paused: true } : {}) };
    const list = (b.order[lane] ??= []);
    const at = before ? list.indexOf(before) : -1;
    list.splice(at < 0 ? list.length : at, 0, id);
  }
  writeFileSync(file, JSON.stringify(b, null, 2));
  return b;
}

/** POST /work/ideas { title, brief, lane? }: a plan from Talk she said Later to, kept as a card (in Next by default). */
export function saveIdea({ title, brief, lane = 'next' }, file = BOARD) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('An idea needs a title');
  if (typeof brief !== 'string' || !brief.trim()) throw new Error('An idea needs its brief');
  if (!BOARD_LANES.includes(lane)) throw new Error(`No lane called ${lane}`);
  const b = readBoard(file);
  const idea = { id: `idea-${Date.now()}`, title: title.trim().slice(0, 120), brief: brief.trim().slice(0, 4000), at: new Date().toISOString() };
  b.ideas.push(idea);
  writeFileSync(file, JSON.stringify(b, null, 2));
  return { idea, board: lane === 'ideas' ? b : saveBoard({ id: idea.id, lane }, file) };
}

/** GET /work/board: everything the lanes are made of, read now. */
export function workBoard(now = Date.now()) {
  const projects = projectList().filter((p) => existsSync(p.repo));
  return { sessions: sessionTasks(projects, now), progress: progressItems(), board: readBoard(), activeMin: ACTIVE_MIN, sessionHours: SESSION_HOURS, at: new Date(now).toISOString() };
}
