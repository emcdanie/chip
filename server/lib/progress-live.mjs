// The Work board's progress items, computed on load (Elleta, 23 Nov 2026: "the board is not updating; it should be
// real-time data"; CLAUDE.md "Work board: The board is live, never a hand-kept list"). progress.json is typed text whose
// `stage` nothing updated, so a finished item kept showing as an idea. Each item now has a checkable source
// (progress-sources.json, or a `doneWhen` on the item itself): a commit, a file, a run, a push, archived sessions, drift 0,
// her answer. A landed item is Done with its date and commit; an answered one whose work has not landed is Next; an item
// with no checkable source is Not measured and listed, never guessed. A source that cannot be read says which.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE } from './checks.mjs';
import { SESSIONS_DIR, areaOfFiles, isAnswered, warmCheckouts, warmSessions, workBoard } from './lanes.mjs';
import { projectList } from './projects.mjs';
import { listRuns } from './runs.mjs';
import { readDrift } from './drift.mjs';
import { reviewsWaiting } from './review-fixes.mjs';

const SOURCES = JSON.parse(readFileSync(new URL('./progress-sources.json', import.meta.url), 'utf8'));
// git never holds the server (24 Nov: execFileSync here held every other request about 3 s on a cold board load, History's
// record took 3.25 s instead of 0.1 s): each read runs as its own process, and the reads of one board run side by side
const git = (dir, args, timeout = 8000) =>
  new Promise((resolve) => {
    execFile('git', ['-C', dir, '--no-optional-locks', ...args], { encoding: 'utf8', timeout, maxBuffer: 32 << 20 }, (err, out) => resolve(err ? null : out.trim()));
  });
const ok = (git_ = null) => git_ !== null;

/* What GitHub holds for a branch, asked at most once a minute (a network call: 0.5 s or more each board read otherwise). */
const heads = new Map(); // dir|remote|branch -> { at, out }
async function remoteHeads(dir, remote, branch, now = Date.now()) {
  const k = `${dir}|${remote}|${branch}`;
  const hit = heads.get(k);
  if (hit && now - hit.at < 60e3) return hit.out;
  const out = await git(dir, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], 4000);
  if (out !== null) heads.set(k, { at: now, out });
  return out;
}

/** The repos a source can name: CHIP's own (chip/whole when this checkout has it) and BELLA's chip/parts-dev. */
export async function reposFor({ chipDir = ROOT, bellaDir = BELLA, base = BASE } = {}) {
  const has = async (dir, ref) => ok(await git(dir, ['rev-parse', '--verify', '-q', ref]));
  const [whole, parts] = await Promise.all([has(chipDir, 'chip/whole'), has(bellaDir, base)]);
  return {
    chip: { dir: chipDir, ref: whole ? 'chip/whole' : 'HEAD', name: 'CHIP' },
    bella: { dir: bellaDir, ref: parts ? base : 'HEAD', name: 'BELLA' },
  };
}
export { areaOfFiles } from './lanes.mjs';
const filesOf = async (dir, sha) => (sha ? ((await git(dir, ['show', '--name-only', '--format=', sha])) ?? '').split('\n').filter(Boolean) : []);
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const done = (repo, sha, iso) => ({ state: 'done', repo, sha, at: iso ?? null, date: iso ? day(iso) : null });

/** Checks one source: { state: 'done' | 'open' | 'unmeasured', sha?, at?, why? }. `ctx` carries repos, runs, answers, item. */
export async function check(src, ctx) {
  if (src?.unmeasured) return { state: 'unmeasured', why: src.unmeasured };
  if (!src) return { state: 'unmeasured', why: 'no source says where to check it' };
  if (src.all) {
    const rs = await Promise.all(src.all.map((s) => check(s, ctx)));
    if (rs.some((r) => r.state === 'open')) return { state: 'open' };
    if (rs.some((r) => r.state === 'unmeasured')) return rs.find((r) => r.state === 'unmeasured');
    const last = [...rs].sort((a, b) => Date.parse(b.at ?? 0) - Date.parse(a.at ?? 0))[0];
    return { ...last, state: 'done' };
  }
  const repoOf = (name) => ctx.repos[name];
  if (src.commit) {
    const r = repoOf(src.commit.repo);
    const out = r && (await git(r.dir, ['log', r.ref, '-1', '-i', '-E', `--grep=${src.commit.subject}`, '--format=%h%x09%cI']));
    if (out === null || !r) return { state: 'unmeasured', why: `${r?.name ?? src.commit.repo}'s history could not be read` };
    if (!out) return { state: 'open' };
    const [sha, at] = out.split('\t');
    return { ...done(r.name, sha, at), area: areaOfFiles(await filesOf(r.dir, sha)) };
  }
  if (src.commits) {
    const r = repoOf(src.commits.repo);
    if (!r) return { state: 'unmeasured', why: `${src.commits.repo}'s history could not be read` };
    const each = await Promise.all(
      src.commits.shas.map(async (sha) => {
        const [known, inside, at, files] = await Promise.all([git(r.dir, ['cat-file', '-t', sha]), git(r.dir, ['merge-base', '--is-ancestor', sha, r.ref]), git(r.dir, ['log', '-1', '--format=%cI', sha]), filesOf(r.dir, sha)]);
        return { sha, known, inside, at, files };
      }),
    );
    if (each.some((x) => x.known === null)) return { state: 'unmeasured', why: `${r.name}'s history could not be read` };
    if (each.some((x) => x.inside === null)) return { state: 'open' };
    const last = each.reduce((a, b) => (!a || Date.parse(b.at) > Date.parse(a.at) ? b : a), null);
    return { ...done(r.name, last.sha, last.at), area: areaOfFiles(each.flatMap((x) => x.files)) };
  }
  if (src.path) {
    const r = repoOf(src.path.repo);
    if (!r) return { state: 'unmeasured', why: `${src.path.repo}'s history could not be read` };
    const [there, log] = await Promise.all([git(r.dir, ['cat-file', '-e', `${r.ref}:${src.path.file}`]), git(r.dir, ['log', r.ref, '-1', '--format=%h%x09%cI', '--', src.path.file])]);
    if (there === null) return { state: 'open' };
    const out = log ?? '';
    const [sha, at] = out.split('\t');
    return { ...done(r.name, sha || null, at || null), area: areaOfFiles([src.path.file]) };
  }
  if (src.file) {
    const f = src.file.replace(/^~\//, `${homedir()}/`);
    if (!existsSync(f)) return { state: 'open' };
    const at = statSync(f).mtime.toISOString();
    return { state: 'done', repo: 'Files', sha: null, at, date: day(at) };
  }
  if (src.run) {
    const hit = (ctx.runs ?? []).filter((x) => String(x.title ?? '').startsWith(src.run.title) && src.run.status.includes(x.status)).sort((a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt))[0];
    return hit ? { state: 'done', repo: 'CHIP', sha: null, at: hit.endedAt ?? hit.startedAt, date: day(hit.endedAt ?? hit.startedAt) } : { state: 'open' };
  }
  if (src.pushed) {
    const r = repoOf(src.pushed.repo);
    const up = r && (await git(r.dir, ['rev-parse', '--abbrev-ref', `${src.pushed.branch}@{upstream}`]));
    if (!up) return { state: 'unmeasured', why: `${src.pushed.branch} has no upstream to compare with` };
    const [remote, ...rest] = up.split('/');
    const out = await remoteHeads(r.dir, remote, rest.join('/'));
    if (out === null) return { state: 'unmeasured', why: 'GitHub did not answer' };
    const tip = out.split(/\s/)[0];
    if (!tip) return { state: 'open' };
    if ((await git(r.dir, ['cat-file', '-e', `${tip}^{commit}`])) === null) return { state: 'open' }; // GitHub holds commits this machine lacks
    const same = await git(r.dir, ['merge-base', '--is-ancestor', src.pushed.branch, tip]);
    return same === null ? { state: 'open' } : { ...done(r.name, tip.slice(0, 7), await git(r.dir, ['log', '-1', '--format=%cI', tip])) };
  }
  if (src.sessionsArchived) {
    const found = new Map();
    try {
      for (const a of readdirSync(ctx.sessionsDir)) {
        let subs = [];
        try {
          subs = readdirSync(join(ctx.sessionsDir, a));
        } catch {}
        for (const b of subs) for (const f of (() => { try { return readdirSync(join(ctx.sessionsDir, a, b)); } catch { return []; } })()) {
          const id = f.replace(/\.json$/, '');
          if (src.sessionsArchived.includes(id)) {
            try {
              const j = JSON.parse(readFileSync(join(ctx.sessionsDir, a, b, f), 'utf8'));
              found.set(id, j);
            } catch {}
          }
        }
      }
    } catch {
      return { state: 'unmeasured', why: "Claude's session files could not be read" };
    }
    const mine = src.sessionsArchived.map((id) => found.get(id)).filter(Boolean);
    if (!mine.length) return { state: 'unmeasured', why: 'none of its sessions could be found' };
    if (mine.some((j) => !j.isArchived)) return { state: 'open' };
    const at = new Date(Math.max(...mine.map((j) => j.archiveSetAtMs ?? 0))).toISOString();
    return { state: 'done', repo: 'Sessions', sha: null, at, date: day(at) };
  }
  if (src.driftZero) {
    try {
      return readDrift(ctx.bellaDir).differing === 0 ? { state: 'done', repo: 'BELLA', sha: null, at: new Date().toISOString(), date: day(new Date()) } : { state: 'open' };
    } catch {
      return { state: 'unmeasured', why: "BELLA's specs could not be read" };
    }
  }
  if (src.answered) return isAnswered(ctx.item, ctx.answers) || /^Answered\b/i.test(ctx.item.detail ?? '') ? { state: 'done', repo: 'Answers', sha: null, at: null, date: ctx.item.detail?.match(/^Answered\s+(\d+ \w+)/i)?.[1] ?? null } : { state: 'open' };
  return { state: 'unmeasured', why: 'its source is not a kind CHIP can check' };
}

/** One item's stage from its source: Done, Next (answered, work not landed), its typed stage while open, or Not measured. */
export async function liveItem(item, ctx, typed) {
  const src = typed?.doneWhen ?? SOURCES[typed?.id];
  const r = await check(src, { ...ctx, item });
  const answered = item.stage === 'Answered' || /^Answered\b/i.test(item.detail ?? '') || isAnswered(item, ctx.answers);
  if (r.state === 'done') return { ...item, stage: 'Done', shipped: { date: r.date, at: r.at, commit: r.sha, where: r.repo, area: r.area ?? null }, source: 'checked' };
  if (r.state === 'unmeasured') return { ...item, stage: 'Not measured', source: r.why };
  if (item.stage === 'Done') return { ...item, stage: answered ? 'Next' : 'To do', source: 'checked, not landed yet' };
  return { ...item, stage: answered && !['Building', 'Checking'].includes(item.stage) ? 'Next' : item.stage, source: 'checked, not landed yet' };
}

/** What landed in the last `days` days, newest first: each commit on CHIP's chip/whole and BELLA's chip/parts-dev with its
 *  date, one card each (24 Nov: Shipped read 0 while dozens of pieces had landed the night before). `cap` keeps the lane readable. */
const landedLogs = new Map(); // dir|ref|days -> { tip, log }
export async function landedCommits(repos, now = Date.now(), { days = 14, cap = 60 } = {}) {
  const since = new Date(now - days * 86400000).toISOString();
  const out = [];
  // one git log per repo, read again only when its tip moves (it lists every file of the last 400 commits: about 1.3 s); not
  // --since, which stops at the first older commit and would hide newer ones after a rebase or cherry-pick
  const logs = await Promise.all(
    Object.entries(repos).map(async ([key, r]) => {
      const tip = await git(r.dir, ['rev-parse', r.ref]);
      const k = `${r.dir}|${r.ref}|${days}`;
      const hit = landedLogs.get(k);
      if (tip && hit?.tip === tip) return [key, r, hit.log];
      const log = await git(r.dir, ['log', r.ref, '--no-merges', '-n', '400', '--name-only', '--format=%x1e%h%x09%cI%x09%s']);
      if (tip && log !== null) landedLogs.set(k, { tip, log });
      return [key, r, log];
    }),
  ); // the exact cut-off is applied below, on the commit's own date
  for (const [key, r, log] of logs) {
    if (log === null) continue;
    for (const block of log.split('\x1e').filter((b) => b.trim())) {
      const [l, ...files] = block.split('\n').filter(Boolean);
      const [sha, at, ...rest] = l.split('\t');
      if (Date.parse(at) < Date.parse(since)) continue;
      const subject = rest.join('\t');
      const first = subject.split(/(?<=[.:?!])\s/)[0];
      out.push({ id: `landed-${key}-${sha}`, sha, at, repo: r.name, project: key === 'bella' ? 'BELLA' : 'CHIP', title: first.length > 96 ? `${first.slice(0, first.lastIndexOf(' ', 93))}…` : first, subject, area: areaOfFiles(files) });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, cap);
}

// the review-fix pictures and waiting A/B pages (review-fixes.mjs); a folder that can't be read leaves them out, never the board
const safeReviews = (now) => {
  try {
    return reviewsWaiting({ now });
  } catch {
    return { areas: [], pages: [], reached: false };
  }
};

let memo = null;
let pending = null; // a computation on its way: a second read waits for it instead of starting another
/** Drops the kept answer (a card was moved, so the next read shows it). */
export const dropBoardCache = () => (memo = null);
/** GET /work/board with the progress items computed now (kept 5 s: the read walks git). `at` is when this computation ran. */
export async function workBoardLive(now = Date.now(), over = {}) {
  if (over.repos) return computeBoard(now, over);
  if (memo && now - memo.now < 5000 && now >= memo.now) return memo.board;
  if (pending) return pending;
  pending = computeBoard(now, over)
    .then((board) => ((memo = { now, board }), board))
    .finally(() => (pending = null));
  return pending;
}
async function computeBoard(now, over) {
  if (!over.repos) {
    const projects = projectList().filter((p) => existsSync(p.repo));
    await warmCheckouts(projects, now);
    await warmSessions(projects, now);
  }
  const board = workBoard(now);
  let raw = null;
  let answers = null;
  try {
    const dir = over.progressDir ?? join(homedir(), 'DEV/chip/docs/reference/screens/progress');
    raw = JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8')).items ?? [];
    answers = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8'));
  } catch {}
  const unread = [];
  const repos = over.repos ?? (await reposFor());
  for (const r of Object.values(repos)) if (!existsSync(r.dir)) unread.push({ name: `${r.name}'s checkout`, why: `${r.dir} is not there` });
  if (!board.progress.reached) unread.push({ name: 'The progress board', why: 'progress.json could not be read' });
  const ctx = { repos, runs: over.runs ?? listRuns(), answers, sessionsDir: over.sessionsDir ?? SESSIONS_DIR, bellaDir: over.bellaDir ?? BELLA };
  const byIndex = raw ?? [];
  const [items, landed] = await Promise.all([Promise.all(board.progress.items.map((it) => liveItem(it, ctx, { ...byIndex[it.n], id: byIndex[it.n]?.id }))), landedCommits(repos, now)]);
  for (const i of items) if (i.stage === 'Not measured' && /could not be read|did not answer|not there|no upstream/.test(i.source ?? '')) unread.push({ name: i.title, why: i.source });
  const notMeasured = items.filter((i) => i.stage === 'Not measured').map((i) => ({ id: i.id, title: i.title, why: i.source }));
  return { ...board, progress: { ...board.progress, items, notMeasured }, landed, reviews: over.reviews ?? safeReviews(now), unread, at: new Date(now).toISOString() };
}

/** Reads the board once in the background, so the first #/work after a start answers from warm caches (24 Nov: she opens it
 *  live on stage). Session transcripts are read in full the first time (about 2.5 s); later reads only read what was added. */
export function warmBoard() {
  workBoardLive().catch(() => {});
}
