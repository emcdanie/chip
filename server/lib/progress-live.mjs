// The Work board's progress items, computed on load (Elleta, 23 Nov 2026: "the board is not updating; it should be
// real-time data"; CLAUDE.md "Work board: The board is live, never a hand-kept list"). progress.json is typed text whose
// `stage` nothing updated, so a finished item kept showing as an idea. Each item now has a checkable source
// (progress-sources.json, or a `doneWhen` on the item itself): a commit, a file, a run, a push, archived sessions, drift 0,
// her answer. A landed item is Done with its date and commit; an answered one whose work has not landed is Next; an item
// with no checkable source is Not measured and listed, never guessed. A source that cannot be read says which.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import { BASE } from './checks.mjs';
import { SESSIONS_DIR, isAnswered, workBoard } from './lanes.mjs';
import { listRuns } from './runs.mjs';
import { readDrift } from './drift.mjs';

const SOURCES = JSON.parse(readFileSync(new URL('./progress-sources.json', import.meta.url), 'utf8'));
const git = (dir, args, timeout = 8000) => {
  try {
    return execFileSync('git', ['-C', dir, '--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim();
  } catch {
    return null;
  }
};
const ok = (git_ = null) => git_ !== null;

/** The repos a source can name: CHIP's own (chip/whole when this checkout has it) and BELLA's chip/parts-dev. */
export function reposFor({ chipDir = ROOT, bellaDir = BELLA, base = BASE } = {}) {
  const has = (dir, ref) => ok(git(dir, ['rev-parse', '--verify', '-q', ref]));
  return {
    chip: { dir: chipDir, ref: has(chipDir, 'chip/whole') ? 'chip/whole' : 'HEAD', name: 'CHIP' },
    bella: { dir: bellaDir, ref: has(bellaDir, base) ? base : 'HEAD', name: 'BELLA' },
  };
}
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const done = (repo, sha, iso) => ({ state: 'done', repo, sha, at: iso ?? null, date: iso ? day(iso) : null });

/** Checks one source: { state: 'done' | 'open' | 'unmeasured', sha?, at?, why? }. `ctx` carries repos, runs, answers, item. */
export function check(src, ctx) {
  if (src?.unmeasured) return { state: 'unmeasured', why: src.unmeasured };
  if (!src) return { state: 'unmeasured', why: 'no source says where to check it' };
  if (src.all) {
    const rs = src.all.map((s) => check(s, ctx));
    if (rs.some((r) => r.state === 'open')) return { state: 'open' };
    if (rs.some((r) => r.state === 'unmeasured')) return rs.find((r) => r.state === 'unmeasured');
    const last = [...rs].sort((a, b) => Date.parse(b.at ?? 0) - Date.parse(a.at ?? 0))[0];
    return { ...last, state: 'done' };
  }
  const repoOf = (name) => ctx.repos[name];
  if (src.commit) {
    const r = repoOf(src.commit.repo);
    const out = r && git(r.dir, ['log', r.ref, '-1', '-i', '-E', `--grep=${src.commit.subject}`, '--format=%h%x09%cI']);
    if (out === null || !r) return { state: 'unmeasured', why: `${r?.name ?? src.commit.repo}'s history could not be read` };
    if (!out) return { state: 'open' };
    const [sha, at] = out.split('\t');
    return done(r.name, sha, at);
  }
  if (src.commits) {
    const r = repoOf(src.commits.repo);
    if (!r) return { state: 'unmeasured', why: `${src.commits.repo}'s history could not be read` };
    let last = null;
    for (const sha of src.commits.shas) {
      const known = git(r.dir, ['cat-file', '-t', sha]);
      if (known === null) return { state: 'unmeasured', why: `${r.name}'s history could not be read` };
      if (git(r.dir, ['merge-base', '--is-ancestor', sha, r.ref]) === null) return { state: 'open' };
      const at = git(r.dir, ['log', '-1', '--format=%cI', sha]);
      if (!last || Date.parse(at) > Date.parse(last.at)) last = { sha, at };
    }
    return done(r.name, last.sha, last.at);
  }
  if (src.path) {
    const r = repoOf(src.path.repo);
    if (!r) return { state: 'unmeasured', why: `${src.path.repo}'s history could not be read` };
    if (git(r.dir, ['cat-file', '-e', `${r.ref}:${src.path.file}`]) === null) return { state: 'open' };
    const out = git(r.dir, ['log', r.ref, '-1', '--format=%h%x09%cI', '--', src.path.file]) ?? '';
    const [sha, at] = out.split('\t');
    return done(r.name, sha || null, at || null);
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
    const up = r && git(r.dir, ['rev-parse', '--abbrev-ref', `${src.pushed.branch}@{upstream}`]);
    if (!up) return { state: 'unmeasured', why: `${src.pushed.branch} has no upstream to compare with` };
    const [remote, ...rest] = up.split('/');
    const out = git(r.dir, ['ls-remote', '--heads', remote, `refs/heads/${rest.join('/')}`], 4000);
    if (out === null) return { state: 'unmeasured', why: 'GitHub did not answer' };
    const tip = out.split(/\s/)[0];
    if (!tip) return { state: 'open' };
    if (git(r.dir, ['cat-file', '-e', `${tip}^{commit}`]) === null) return { state: 'open' }; // GitHub holds commits this machine lacks
    const same = git(r.dir, ['merge-base', '--is-ancestor', src.pushed.branch, tip]);
    return same === null ? { state: 'open' } : { ...done(r.name, tip.slice(0, 7), git(r.dir, ['log', '-1', '--format=%cI', tip])) };
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
export function liveItem(item, ctx, typed) {
  const src = typed?.doneWhen ?? SOURCES[typed?.id];
  const r = check(src, { ...ctx, item });
  const answered = item.stage === 'Answered' || /^Answered\b/i.test(item.detail ?? '') || isAnswered(item, ctx.answers);
  if (r.state === 'done') return { ...item, stage: 'Done', shipped: { date: r.date, at: r.at, commit: r.sha, where: r.repo }, source: 'checked' };
  if (r.state === 'unmeasured') return { ...item, stage: 'Not measured', source: r.why };
  if (item.stage === 'Done') return { ...item, stage: answered ? 'Next' : 'To do', source: 'checked, not landed yet' };
  return { ...item, stage: answered && !['Building', 'Checking'].includes(item.stage) ? 'Next' : item.stage, source: 'checked, not landed yet' };
}

/** GET /work/board with the progress items computed now. `at` is when this computation ran. */
export function workBoardLive(now = Date.now(), over = {}) {
  const board = workBoard(now);
  let raw = null;
  let answers = null;
  try {
    const dir = over.progressDir ?? join(homedir(), 'DEV/chip/docs/reference/screens/progress');
    raw = JSON.parse(readFileSync(join(dir, 'progress.json'), 'utf8')).items ?? [];
    answers = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8'));
  } catch {}
  const unread = [];
  const repos = over.repos ?? reposFor();
  for (const r of Object.values(repos)) if (!existsSync(r.dir)) unread.push({ name: `${r.name}'s checkout`, why: `${r.dir} is not there` });
  if (!board.progress.reached) unread.push({ name: 'The progress board', why: 'progress.json could not be read' });
  const ctx = { repos, runs: over.runs ?? listRuns(), answers, sessionsDir: over.sessionsDir ?? SESSIONS_DIR, bellaDir: over.bellaDir ?? BELLA };
  const byIndex = raw ?? [];
  const items = board.progress.items.map((it) => liveItem(it, ctx, { ...byIndex[it.n], id: byIndex[it.n]?.id }));
  for (const i of items) if (i.stage === 'Not measured' && /could not be read|did not answer|not there|no upstream/.test(i.source ?? '')) unread.push({ name: i.title, why: i.source });
  const notMeasured = items.filter((i) => i.stage === 'Not measured').map((i) => ({ id: i.id, title: i.title, why: i.source }));
  return { ...board, progress: { ...board.progress, items, notMeasured }, unread, at: new Date(now).toISOString() };
}
