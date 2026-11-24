// Needs you and Activity show only what is really open (Elleta, 23 Nov 2026: a closed fix still "waiting for your
// Accept", a push ask after the push, pull requests listed by number). One rule per kind of stale item, each held here:
// answered or replaced means gone, a failed run offers no Accept, the GitHub ask counts what GitHub holds now, and a
// pull request is named by its title with the number behind the link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { closedWhy, settle, bellaProbe, answeredOn } = await import('../lib/runs.mjs');
const { isAnswered } = await import('../lib/lanes.mjs');
const { gitItems } = await import('../lib/needs.mjs');
const { activityRow } = await import('../../app/src/runClock.js');

const T = Date.parse('2026-11-22T12:00:00Z'); // the day the sample runs were made
const run = (id, status, title, at, extra = {}) => ({ id, status, title, branch: `b-${id}`, startedAt: `2026-11-22T${at}:00.000Z`, ...extra });
const open = { branch: true, ahead: 1, same: false, moved: null };

test('a passed run stays open while its branch can still be kept', () => {
  const r = run('a', 'passed', 'Fix X', '09:00');
  assert.equal(closedWhy(r, [r], () => open), null);
});

test('a passed run closes when its branch is gone, already in BELLA, identical there, or BELLA changed the same file', () => {
  const r = run('a', 'passed', 'Fix X', '09:00');
  assert.equal(closedWhy(r, [r], () => ({ ...open, branch: false })), 'its branch is gone');
  assert.equal(closedWhy(r, [r], () => ({ ...open, ahead: 0 })), 'BELLA already has its change');
  assert.equal(closedWhy(r, [r], () => ({ ...open, same: true })), 'BELLA already has its change');
  assert.equal(closedWhy(r, [r], () => ({ ...open, moved: 'CheckRow.spec.yaml' })), 'BELLA changed CheckRow.spec.yaml after this run began');
});

test('git not answering closes nothing: a fact that was not measured is not a reason', () => {
  const r = run('a', 'passed', 'Fix X', '09:00');
  assert.equal(closedWhy(r, [r], () => ({ branch: null, ahead: null, same: null, moved: null })), null);
  assert.equal(closedWhy(r, [r], () => null), null);
});

test('a failed run is closed once a newer run of the same job exists, and only the newest failure asks', () => {
  const old = run('a', 'failed', 'Fix X', '09:00');
  const mid = run('b', 'failed', 'Fix X', '10:00');
  const last = run('c', 'failed', 'Fix X', '11:00');
  const other = run('d', 'failed', 'Fix Y', '08:00');
  settle([old, mid, last, other], () => open, null, T);
  assert.deepEqual([old, mid, last, other].map((r) => r.status), ['closed', 'closed', 'failed', 'failed']);
  assert.match(old.closedWhy, /newer run/);
});

test('a failed run replaced by a passed one is closed, and a passed run is not replaced by a newer failure', () => {
  const failed = run('a', 'failed', 'Fix X', '09:00');
  const passed = run('b', 'passed', 'Fix X', '10:00');
  settle([failed, passed], () => open, null, T);
  assert.deepEqual([failed.status, passed.status], ['closed', 'passed']);
  const p2 = run('c', 'passed', 'Fix Z', '09:00');
  const f2 = run('d', 'failed', 'Fix Z', '10:00');
  settle([p2, f2], () => open, null, T);
  assert.deepEqual([p2.status, f2.status], ['passed', 'failed'], 'the passed one can still be accepted');
});

test('a stop nobody ran again within two days is closed with its date; a recent one still asks', () => {
  const stopped = run('a', 'failed', 'Fill a11y', '15:11', { startedAt: '2026-11-21T15:11:00.000Z', error: 'BELLA gate refused the commit' });
  assert.equal(closedWhy(stopped, [stopped], () => open, null, Date.parse('2026-11-24T08:00:00Z')), 'it stopped on 21 Nov and was not run again');
  assert.equal(closedWhy(stopped, [stopped], () => open, null, Date.parse('2026-11-22T12:00:00Z')), null);
});

test('a closed run offers no Accept and says why in its Activity row', () => {
  const r = run('a', 'passed', 'Fix X', '09:00');
  settle([r], () => ({ ...open, ahead: 0 }));
  const row = activityRow(r);
  assert.equal(r.status, 'closed');
  assert.doesNotMatch(row.line, /waiting for your Accept/);
  assert.match(row.line, /Closed: BELLA already has its change/);
  assert.equal(row.state, 'done');
});

test('failed and stopped runs never read as waiting for Accept', () => {
  for (const status of ['failed', 'login']) assert.doesNotMatch(activityRow(run('a', status, 'X', '09:00', { error: 'Stopped by a maintainer' })).line, /Accept/);
});

test('a run she already answered Accept on is closed, matched by what its card names, not by an id', () => {
  const r = run('a', 'passed', "Fix CheckRow's drift", '09:00', { endedAt: '2026-11-22T09:50:00.000Z' });
  const ans = (sent, q, a, title = 'Accept or undo the CheckRow fix') => [{ sent, answers: { [title]: { title, answers: [{ q, a }] } } }];
  assert.equal(answeredOn(r, ans('2026-11-22T22:18:02', 'Keep the CheckRow fix?', 'Accept')), '22 Nov');
  assert.equal(closedWhy(r, [r], () => open, ans('2026-11-22T22:18:02', 'Keep the CheckRow fix?', 'Accept')), 'you answered it on 22 Nov');
  assert.equal(answeredOn(r, ans('2026-11-22T08:00:00', 'Keep the CheckRow fix?', 'Accept')), null, 'an answer from before the run ended is about an earlier run');
  assert.equal(answeredOn(r, ans('2026-11-22T22:18:02', 'Start them?', 'Yes')), null, 'starting something is not accepting this');
  assert.equal(answeredOn(r, ans('2026-11-22T22:18:02', 'Keep the Button fix?', 'Accept', 'Accept the Button fix')), null, 'another part');
  assert.equal(answeredOn(r, ans('2026-11-22T22:18:02', 'Keep the CheckRow fix?', '')), null, 'asked, not answered');
});

// ---- bellaProbe against a real repository -------------------------------------------------------
const sh = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'stale-asks-'));
  sh(dir, 'init', '-q', '-b', 'base');
  writeFileSync(join(dir, 'spec.yaml'), 'one\n');
  writeFileSync(join(dir, 'other.txt'), 'x\n');
  sh(dir, 'add', '.');
  sh(dir, 'commit', '-qm', 'first');
  return dir;
}
const branchWith = (dir, name, file, text) => {
  sh(dir, 'checkout', '-qb', name);
  writeFileSync(join(dir, file), text);
  sh(dir, 'commit', '-qam', name);
  sh(dir, 'checkout', '-q', 'base');
};

test('probe: a branch that exists, is ahead and untouched by BELLA is open', () => {
  const dir = repo();
  branchWith(dir, 'run-1', 'spec.yaml', 'two\n');
  const f = bellaProbe({ branch: 'run-1' }, { base: 'base', dir });
  assert.deepEqual(f, { branch: true, ahead: 1, same: false, moved: null });
});

test('probe: a missing branch, a merged branch and the same content landed another way', () => {
  const dir = repo();
  assert.equal(bellaProbe({ branch: 'nope' }, { base: 'base', dir }).branch, false);
  branchWith(dir, 'run-2', 'spec.yaml', 'two\n');
  sh(dir, 'merge', '-q', '--ff-only', 'run-2');
  assert.equal(bellaProbe({ branch: 'run-2' }, { base: 'base', dir }).ahead, 0);
  branchWith(dir, 'run-3', 'other.txt', 'y\n');
  writeFileSync(join(dir, 'other.txt'), 'y\n');
  sh(dir, 'commit', '-qam', 'same change by hand');
  const f = bellaProbe({ branch: 'run-3' }, { base: 'base', dir });
  assert.equal(f.same, true);
});

test('probe: BELLA changing the run\'s file after it began is named', () => {
  const dir = repo();
  branchWith(dir, 'run-4', 'spec.yaml', 'two\n');
  writeFileSync(join(dir, 'spec.yaml'), 'three\n');
  sh(dir, 'commit', '-qam', 'base moved');
  assert.equal(bellaProbe({ branch: 'run-4' }, { base: 'base', dir }).moved, 'spec.yaml');
});

test('probe: a base that does not exist is not measured, so nothing closes', () => {
  const dir = repo();
  assert.deepEqual(bellaProbe({ branch: 'x' }, { base: 'nobase', dir }), { branch: null, ahead: null, same: null, moved: null });
});

// ---- answered cards -----------------------------------------------------------------------------
test('answered items are gone: the board\'s own note, her answer on its card, or an answer keyed by its title', () => {
  const item = { title: 'Mind map', link: 'http://x/screens/2026-11-23-waiting/mindmap.html', detail: null };
  assert.equal(isAnswered(item, []), false);
  assert.equal(isAnswered({ ...item, detail: 'Answered 22 Nov: A, C and B.' }, []), true);
  const cards = (c) => [{ sent: 's', answers: { url: '/screens/2026-11-23-waiting/', cards: [c] } }];
  assert.equal(isAnswered(item, cards({ from: 'waiting/mindmap', answer: 'B · Change', thumb: null })), true);
  assert.equal(isAnswered({ ...item, link: 'http://x/screens/2026-11-23-waiting/theme.html' }, cards({ from: 'waiting/mindmap', answer: 'B', thumb: null })), false, 'another card');
  assert.equal(isAnswered(item, cards({ from: 'waiting/mindmap', answer: null, thumb: null })), false, 'a note alone is not an answer');
  assert.equal(isAnswered(item, [{ answers: { 'Mind map': { title: 'Mind map', answers: [{ q: 'q', a: 'A' }] } } }]), true);
});

// ---- GitHub's ask counts what GitHub holds now ---------------------------------------------------
test('after a push from another checkout the "save to GitHub" ask is gone, though this clone has not fetched', () => {
  const root = mkdtempSync(join(tmpdir(), 'stale-push-'));
  const bare = join(root, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const a = join(root, 'a');
  execFileSync('git', ['clone', '-q', bare, a], { stdio: 'ignore' });
  sh(a, 'checkout', '-qb', 'main');
  writeFileSync(join(a, 'f'), '1');
  sh(a, 'add', '.');
  sh(a, 'commit', '-qm', 'one');
  sh(a, 'push', '-q', '-u', 'origin', 'main');
  writeFileSync(join(a, 'f'), '2');
  sh(a, 'commit', '-qam', 'two');
  const repos = [{ id: 'x', name: 'X', dir: a, branch: 'main' }];
  assert.equal(gitItems(repos).filter((i) => i.id === 'ahead-x').length, 1, 'one unpushed change is asked about');
  // the push happens (from another checkout, say); this clone's remote-tracking ref still says one change is missing
  sh(a, 'push', '-q', 'origin', 'main'); // the push, from here, then forget that this clone saw it
  sh(a, 'update-ref', 'refs/remotes/origin/main', sh(a, 'rev-parse', 'HEAD~1'));
  const ids = gitItems(repos).map((i) => i.id);
  assert.ok(!ids.includes('ahead-x'), 'GitHub already holds both changes');
});

// ---- pull requests are named by their title ------------------------------------------------------
test('a pull request card carries its title and project, never its number', async () => {
  const { boardModel } = await import('../../app/src/pages/workModel.js');
  const pr = { id: 'pr-72', title: 'Rules and tokens: sync maintaining.md', project: 'BELLA', number: 72, branch: 'x', lane: 'ready', url: 'https://github.com/o/r/pull/72', updatedAt: '2026-11-23T10:00:00Z', draft: false };
  const m = boardModel({ lanes: { prs: [pr], reached: true }, board: null });
  const card = m.lanes.flatMap((l) => l.cards).find((c) => c.id === 'pr-72');
  assert.equal(card.title, 'Rules and tokens: sync maintaining.md');
  assert.doesNotMatch(card.line, /#\d/);
  assert.equal(card.open.href, 'https://github.com/o/r/pull/72', 'the number lives in the link');
});
