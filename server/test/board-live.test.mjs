// The Work board is live (Elleta, 23 Nov 2026: shipped cards still in Ideas, "it should be real-time data"): each progress
// item's stage is computed from its source on load, never typed. One test per kind of source and per board rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { check, liveItem, landedCommits } = await import('../lib/progress-live.mjs');
const { boardModel } = await import('../../app/src/pages/workModel.js');

const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function repo(name) {
  const dir = mkdtempSync(join(tmpdir(), `board-live-${name}-`));
  sh(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), '1');
  sh(dir, 'add', '.');
  sh(dir, 'commit', '-qm', 'first change');
  return dir;
}
const dir = repo('chip');
writeFileSync(join(dir, 'b.txt'), '2');
sh(dir, 'add', '.');
sh(dir, 'commit', '-qm', 'The Work board has one project filter: All, CHIP and BELLA');
const sha = sh(dir, 'rev-parse', '--short', 'HEAD');
const repos = { chip: { dir, ref: 'main', name: 'CHIP' }, bella: { dir: '/nonexistent/bella', ref: 'main', name: 'BELLA' } };
const ctx = { repos, runs: [], answers: [], sessionsDir: '/nonexistent', bellaDir: dir };

test('a commit whose subject matches puts the item in Done with its date and short commit', async () => {
  const r = (await check({ commit: { repo: 'chip', subject: 'one project filter' } }, ctx));
  assert.equal(r.state, 'done');
  assert.equal(r.sha, sha);
  assert.match(r.date, /^\d{1,2} \w{3}$/);
});

test('a commit that is not there leaves the item open, and an unreadable repository is not measured, never guessed', async () => {
  assert.equal((await check({ commit: { repo: 'chip', subject: 'no such change' } }, ctx)).state, 'open');
  const r = (await check({ commit: { repo: 'bella', subject: 'anything' } }, ctx));
  assert.equal(r.state, 'unmeasured');
  assert.match(r.why, /BELLA's history could not be read/);
});

test('commits: all must be on the branch; one that is not leaves it open', async () => {
  assert.equal((await check({ commits: { repo: 'chip', shas: [sha] } }, ctx)).state, 'done');
  sh(dir, 'checkout', '-qb', 'side');
  writeFileSync(join(dir, 'c.txt'), '3');
  sh(dir, 'add', '.');
  sh(dir, 'commit', '-qm', 'only on side');
  const side = sh(dir, 'rev-parse', '--short', 'HEAD');
  sh(dir, 'checkout', '-q', 'main');
  assert.equal((await check({ commits: { repo: 'chip', shas: [sha, side] } }, ctx)).state, 'open');
});

test('path: a file on the branch is done, a missing one is open; all needs every part', async () => {
  assert.equal((await check({ path: { repo: 'chip', file: 'b.txt' } }, ctx)).state, 'done');
  assert.equal((await check({ path: { repo: 'chip', file: 'nope.txt' } }, ctx)).state, 'open');
  assert.equal((await check({ all: [{ path: { repo: 'chip', file: 'b.txt' } }, { path: { repo: 'chip', file: 'nope.txt' } }] }, ctx)).state, 'open');
  assert.equal((await check({ all: [{ path: { repo: 'chip', file: 'a.txt' } }, { path: { repo: 'chip', file: 'b.txt' } }] }, ctx)).state, 'done');
});

test('a run in a finished state closes its item; a run still passed does not', async () => {
  const src = { run: { title: 'Fix CheckRow', status: ['closed', 'kept', 'undone'] } };
  assert.equal((await check(src, { ...ctx, runs: [{ title: "Fix CheckRow's drift", status: 'passed', startedAt: '2026-11-22T09:00:00Z' }] })).state, 'open');
  assert.equal((await check(src, { ...ctx, runs: [{ title: "Fix CheckRow's drift", status: 'closed', startedAt: '2026-11-22T09:00:00Z', endedAt: '2026-11-22T10:00:00Z' }] })).state, 'done');
});

test('sessions archived: all archived is done, one still open leaves it open, none found is not measured', async () => {
  const sess = mkdtempSync(join(tmpdir(), 'board-live-sessions-'));
  mkdirSync(join(sess, 'a', 'b'), { recursive: true });
  const put = (id, isArchived) => writeFileSync(join(sess, 'a', 'b', `${id}.json`), JSON.stringify({ isArchived, archiveSetAtMs: 1763900000000 }));
  put('local_1', true);
  put('local_2', false);
  const c = { ...ctx, sessionsDir: sess };
  assert.equal((await check({ sessionsArchived: ['local_1'] }, c)).state, 'done');
  assert.equal((await check({ sessionsArchived: ['local_1', 'local_2'] }, c)).state, 'open');
  assert.equal((await check({ sessionsArchived: ['local_9'] }, c)).state, 'unmeasured');
});

test('an item with no source, or only a reason, is Not measured with that reason', async () => {
  assert.equal((await check(undefined, ctx)).why, 'no source says where to check it');
  assert.equal((await check({ unmeasured: 'nothing to check yet' }, ctx)).why, 'nothing to check yet');
});

const item = (over = {}) => ({ id: 'p-y3', title: 'Tertiary buttons: A to E', stage: 'To do', detail: 'Answered 22 Nov: E. The work that follows is not done yet.', link: null, n: 0, ...over });

test('an answered question whose work landed is Shipped, never "Your call"; its date and commit travel with it', async () => {
  const live = (await liveItem(item(), ctx, { id: 'x', doneWhen: { commit: { repo: 'chip', subject: 'one project filter' } } }));
  assert.equal(live.stage, 'Done');
  assert.equal(live.shipped.commit, sha);
  const card = boardModel({ board: { progress: { reached: true, items: [live], tasks: [] }, board: { place: {}, order: {} } }, now: Date.now() }).lanes.flatMap((l) => l.cards.map((c) => [l.id, c])).find(([, c]) => c.id === 'p-y3');
  assert.equal(card[0], 'shipped');
  assert.match(card[1].line, /^Shipped · \d{1,2} \w{3}/);
  assert.equal(card[1].commit, sha);
});

test('answered with the work not landed is Next; unanswered and open keeps its typed stage', async () => {
  const src = { doneWhen: { commit: { repo: 'chip', subject: 'no such change' } } };
  assert.equal((await liveItem(item(), ctx, src)).stage, 'Next');
  assert.equal((await liveItem(item({ detail: null }), ctx, src)).stage, 'To do');
});

test('an item typed Done whose source says it did not land is not shown as shipped', async () => {
  const live = (await liveItem(item({ stage: 'Done', detail: null }), ctx, { doneWhen: { commit: { repo: 'chip', subject: 'no such change' } } }));
  assert.equal(live.stage, 'To do');
});

test('Not measured items sit in Ideas and say why', async () => {
  const live = (await liveItem(item({ detail: null }), ctx, { doneWhen: { unmeasured: 'nothing to check yet' } }));
  const lanes = boardModel({ board: { progress: { reached: true, items: [live], tasks: [] }, board: { place: {}, order: {} } }, now: Date.now() }).lanes;
  const card = lanes.find((l) => l.id === 'ideas').cards.find((c) => c.id === 'p-y3');
  assert.equal(card.status, 'Not measured');
  assert.match(card.line, /nothing to check yet/);
});

test('a shipped card leaves Ideas, Next and Now even when she once placed it there; her other placements stand', async () => {
  const live = (await liveItem(item(), ctx, { doneWhen: { commit: { repo: 'chip', subject: 'one project filter' } } }));
  const other = { id: 'p-z', kind: 'item', title: 'Other', stage: 'To do', n: 1 };
  for (const lane of ['ideas', 'next', 'now']) {
    const m = boardModel({ board: { progress: { reached: true, items: [live, other], tasks: [] }, board: { place: { 'p-y3': { lane }, 'p-z': { lane: 'next' } }, order: {} } }, now: Date.now() });
    assert.equal(m.lanes.find((l) => l.id === lane).cards.some((c) => c.id === 'p-y3'), false, `gone from ${lane}`);
    assert.equal(m.lanes.find((l) => l.id === 'shipped').cards.some((c) => c.id === 'p-y3'), true);
    assert.equal(m.lanes.find((l) => l.id === 'next').cards.some((c) => c.id === 'p-z'), true, 'hers stays');
  }
});

test('a part whose pieces now exist drops out of Ideas the moment the gaps no longer name it', async () => {
  const ideas = (gaps) => boardModel({ gaps, board: { progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } }, now: Date.now() }).lanes.find((l) => l.id === 'ideas').cards.map((c) => c.title);
  assert.deepEqual(ideas({ story: { Kbd: 1 }, a11y: { Kbd: 1 } }), ['Kbd']);
  assert.deepEqual(ideas({ story: {}, a11y: {} }), []);
});

test('Shipped lists what landed in the last 14 days, newest first, each with its date and commit; older work is left out', async () => {
  const r = repo('landed');
  const day = (iso, msg) => {
    writeFileSync(join(r, `${msg}.txt`), msg);
    sh(r, 'add', '.');
    execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg, '--date', iso], { env: { ...process.env, GIT_COMMITTER_DATE: iso }, stdio: 'ignore' });
  };
  day('2026-11-23T21:00:00Z', 'Needs you shows only what is open. More words follow.');
  day('2026-11-10T09:00:00Z', 'Landed twelve days ago');
  day('2026-10-01T09:00:00Z', 'Landed in October');
  const now = Date.parse('2026-11-24T08:00:00Z');
  const list = (await landedCommits({ chip: { dir: r, ref: 'main', name: 'CHIP' } }, now)).filter((c) => c.title !== 'first change'); // repo() makes one commit dated today
  assert.deepEqual(list.map((c) => c.title), ['Needs you shows only what is open.', 'Landed twelve days ago']);
  assert.match(list[0].at, /^2026-11-23/);
  assert.ok(list[0].sha);
  const cards = boardModel({ board: { landed: list, progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } }, now }).lanes.find((l) => l.id === 'shipped').cards;
  assert.equal(cards.length, 2);
  assert.match(cards[0].line, /^Landed · 23 Nov · CHIP/);
  assert.equal(cards[0].title, 'Needs you shows only what is open.');
});

test('the cap keeps the Shipped lane readable', async () => {
  const r = repo('cap');
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(r, `f${i}`), `${i}`);
    sh(r, 'add', '.');
    sh(r, 'commit', '-qm', `change ${i}`);
  }
  assert.equal((await landedCommits({ chip: { dir: r, ref: 'main', name: 'CHIP' } }, Date.now(), { cap: 3 })).length, 3);
});
