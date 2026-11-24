// Needs you is a page of decisions (Elleta, 24 Nov 2026 morning review: picture large, why in one line, the action already
// written, Yes / No; nothing sends her to GitHub). What each card asks and does, closing a stopped run, and a pull request
// read in her words.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { decisionOf, noQuotes, boardModel } = await import('../../app/src/pages/workModel.js');
const { closeRun, _putRun, getRun } = await import('../lib/runs.mjs');
const { plainFiles, firstPicture, replacedBy } = await import('../lib/lanes.mjs');
const { appOrigins, onlyChip } = await import('../lib/origin.mjs');

test('a passed run asks to keep it: Yes keeps, No undoes, each says what it does', async () => {
  const d = decisionOf({ id: 'r1', kind: 'run', title: 'Fix CheckRow', status: 'Your Accept' });
  assert.equal(d.ask, 'Keep Fix CheckRow?');
  assert.deepEqual([d.yes.call.post, d.no.call.post], ['/runs/r1/keep', '/runs/r1/undo']);
  assert.ok(d.yes.does && d.no.does);
});

test('a stopped run asks to run again (its plan first) or close it; never Accept', async () => {
  const d = decisionOf({ id: 'r2', kind: 'run', title: 'Fill a11y', status: 'Failed', runBrief: 'b', progress: { now: 'BELLA’s gate refused the commit' } });
  assert.equal(d.yes.call.again, true);
  assert.equal(d.no.call.post, '/runs/r2/close');
  assert.doesNotMatch(JSON.stringify(d), /keep|Accept/);
  assert.match(d.why, /gate refused/);
});

test('a pull request is decided inside CHIP: its changes are read here and the merge is typed, never a link out', async () => {
  const d = decisionOf({ id: 'pr-chip-3', kind: 'pr', title: 'Playground', project: 'CHIP', status: 'Yours to merge', pr: { project: 'CHIP', number: 3 }, open: { kind: 'link', href: 'https://github.com/x/y/pull/3' } });
  assert.deepEqual(d.picture, { kind: 'pr', project: 'CHIP', number: 3 });
  assert.deepEqual(d.yes.call.merge, { project: 'CHIP', number: 3 });
  assert.doesNotMatch(JSON.stringify(d), /github\.com/);
});

test('the push ask opens what would be saved; the push itself stays hers', async () => {
  const d = decisionOf({ id: 'ahead-bella', kind: 'need', title: 'Save BELLA to GitHub? 4 changes not there yet', open: { kind: 'push', repo: 'bella' } });
  assert.equal(d.yes.call.open.kind, 'push');
  assert.equal(d.no.call.move, 'next', 'No says what it does: Not now puts it in Next');
});

test('a review page opens its pictures; a session opens its steps', async () => {
  assert.equal(decisionOf({ id: 'p-y1', kind: 'review', title: 'Pick a logo' }).yes.call.review, 'p-y1');
  assert.equal(decisionOf({ id: 's', kind: 'session', title: 'A session' }).yes.call.session, true);
});

test('every board card has a detail: an idea starts through its plan or goes to Not doing, cut to one line', async () => {
  const d = decisionOf({ id: 'i1', kind: 'idea', title: 'Close the drift of 76 parts', status: 'Idea', brief: `Close the drift of 76 parts in BELLA, one commit: ${'tokens.Card 1.paddingLeft; '.repeat(80)}` });
  assert.equal(d.yes.call.start, true);
  assert.equal(d.no.call.move, 'not-doing');
  assert.ok(d.why.length <= 181, 'one line, not the whole brief');
  assert.match(d.why, /…$/);
});

test('a shipped card shows what landed and has nothing to answer; a not-measured one can be lined up or set aside', async () => {
  const s = decisionOf({ id: 'landed-chip-abc', kind: 'item', title: 'Needs you shows only what is open.', status: 'Shipped', line: 'Landed · 23 Nov · CHIP', commit: 'abc1234' });
  assert.equal(s.yes, null);
  assert.deepEqual(s.facts, ['Commit abc1234']);
  const n = decisionOf({ id: 'p-y7', kind: 'item', title: 'Workbench layout', status: 'Not measured', line: 'Not measured · no commit names it' });
  assert.equal(n.yes.call.move, 'next');
  assert.equal(n.no.call.move, 'not-doing');
});

test("a pull request's root files and packages are named, not 'other files'", async () => {
  assert.deepEqual(plainFiles(['package.json', 'README.md', '.github/workflows/ci.yml']).map((a) => a.what).sort(), ['GitHub checks', 'packages', 'project files']);
});

test('closing a stopped run keeps it, says she closed it and when, and refuses a passed one', async () => {
  _putRun({ id: 'test-close-1', title: 'Fill a11y', status: 'failed', startedAt: '2026-11-21T15:11:00.000Z', steps: [] });
  const r = closeRun('test-close-1', new Date('2026-11-24T09:00:00Z'), { keep: false });
  assert.equal(r.status, 'closed');
  assert.equal(r.closedWhy, 'you closed it on 24 Nov');
  assert.equal(getRun('test-close-1').closedFrom, 'failed');
  _putRun({ id: 'test-close-2', title: 'Keep me', status: 'passed', startedAt: '2026-11-24T08:00:00.000Z', steps: [] });
  assert.throws(() => closeRun('test-close-2', new Date(), { keep: false }), /kept or undone/);
});

test("a pull request's files in her words, most changed first, and its first picture", async () => {
  const areas = plainFiles([
    { path: 'src/components/Button/Button.tsx', additions: 40, deletions: 2 },
    { path: 'src/components/Button/Button.stories.tsx', additions: 5, deletions: 0 },
    { path: 'app/src/pages/NeedsYouList.jsx', additions: 100, deletions: 0 },
    { path: 'server/test/x.test.mjs', additions: 9, deletions: 0 },
  ]);
  assert.deepEqual(areas.map((a) => a.what), ["CHIP's Needs You List page", 'Button: the part', 'tests', 'Button: its story']);
  assert.equal(firstPicture('Intro\n\n![before](https://example.com/a.png)\n'), 'https://example.com/a.png');
  assert.equal(firstPicture('no picture'), null);
});

test('closing a run only answers CHIP itself (the origin guard the server mounts on every POST)', async () => {
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  after(() => server.close());
  const port = server.address().port;
  let calls = 0;
  app.use(onlyChip(appOrigins(port)));
  app.post('/runs/:id/close', (_req, res) => (calls++, res.json({ ok: true })));
  const post = (origin) => fetch(`http://127.0.0.1:${port}/runs/x/close`, { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal((await post('https://evil.example')).status, 403);
  assert.equal(calls, 0);
  assert.equal((await post(`http://localhost:${port}`)).status, 200);
});

test('every decision on Needs you has both answers, and No says what it does', async () => {
  const cards = [
    { id: 'r1', kind: 'run', title: 'A', status: 'Your Accept' },
    { id: 'r2', kind: 'run', title: 'B', status: 'Failed', runBrief: 'b' },
    { id: 'p', kind: 'pr', title: 'C', project: 'BELLA', status: 'Yours to merge', pr: { project: 'BELLA', number: 72 } },
    { id: 'n', kind: 'need', title: 'D', open: { kind: 'review', check: 'x' } },
    { id: 'v', kind: 'review', title: 'E' },
    { id: 's', kind: 'session', title: 'F' },
    { id: 'o', kind: 'pr-old', title: 'G', project: 'CHIP', by: 4, repo: 'chip', prs: [{ number: 1, title: 'one' }] },
  ];
  for (const c of cards) {
    const d = decisionOf(c);
    assert.ok(d.yes && d.no, `${c.kind} has Yes and No`);
    assert.ok(d.no.does, `${c.kind}'s No says what it does`);
  }
});

test('her words are never quoted back: a quote of her and her name with a date are taken out', async () => {
  assert.equal(noQuotes('This syncs the rules into BELLA (Elleta, 17 Nov: "yes commit them"). The same commit is blocked.'), 'This syncs the rules into BELLA. The same commit is blocked.');
  assert.equal(noQuotes('Elleta, 14 Nov: "make it blue" so the buttons are blue'), 'so the buttons are blue');
  const d = decisionOf({ id: 'i', kind: 'idea', title: 'X', brief: 'Make it blue (Elleta, 14 Nov: "i like the blue on a").' });
  assert.doesNotMatch(d.why, /Elleta|i like/);
});

test('a pull request a newer one already holds is found with git, never by title', async () => {
  const prs = [{ number: 1, headRefOid: 'a' }, { number: 4, headRefOid: 'd' }, { number: 72, headRefOid: 'x' }];
  const inside = (a, b) => (a === 'a' && b === 'd' ? true : a === 'x' ? false : false);
  assert.equal(replacedBy(prs[0], prs, inside), 4);
  assert.equal(replacedBy(prs[2], prs, inside), null);
  assert.equal(replacedBy(prs[0], prs, () => null), null, 'git could not say: not replaced');
  // the new one was merged: the old ones are already in their base on GitHub
  const alone = [{ number: 1, headRefOid: 'a', baseRefName: 'main' }];
  assert.equal(replacedBy(alone[0], alone, (a, b) => a === 'a' && b === 'tip', 'tip'), 'main');
  // opened against an old base, landed in the default branch another way
  const old = [{ number: 1, headRefOid: 'a', baseRefName: 'chip-2.0' }];
  assert.equal(replacedBy(old[0], old, (a, b) => b === 'maintip', 'basetip', [['main', 'maintip']]), 'main');
});

test('replaced pull requests are one card asking to close them; the open one keeps its own', async () => {
  const pr = (n, by) => ({ id: `pr-chip-${n}`, lane: 'ready', project: 'CHIP', projectId: 'chip', number: n, replacedBy: by, title: `PR ${n}`, url: 'u', updatedAt: '2026-11-19T10:00:00Z' });
  const m = boardModel({ lanes: { prs: [pr(1, 4), pr(2, 4), pr(3, 4), pr(5, null)], reached: true }, board: null });
  const now = m.lanes.find((l) => l.id === 'now').cards;
  const old = now.find((c) => c.kind === 'pr-old');
  assert.equal(old.prs.length, 3);
  assert.equal(now.filter((c) => c.kind === 'pr').length, 1);
  const d = decisionOf(old);
  assert.match(d.ask, /3 old CHIP pull requests are replaced by the new one: close them\?/);
  assert.equal(d.yes.call.terminal.command, 'gh pr close 1 --comment "Replaced by #4" && gh pr close 2 --comment "Replaced by #4" && gh pr close 3 --comment "Replaced by #4"');
});

test('Now is what is moving: an idle session waits in Next saying its next step, a done one is Shipped, a new one says Starting', async () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  const s = (id, over) => ({ id, title: id, project: 'CHIP', steps: [], startedAt: now - 3600e3, updatedAt: now - 1800e3, working: false, asks: false, ...over });
  const step = (status, text) => ({ status, text });
  const m = boardModel({ board: { sessions: [
    s('working', { working: true, steps: [step('completed', 'a'), step('in_progress', 'b')] }),
    s('idle', { steps: [step('completed', 'a'), step('pending', 'Write the tests')] }),
    s('done', { steps: [step('completed', 'a')] }),
    s('fresh', { working: true }),
  ], progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } }, now });
  const where = (id) => m.lanes.find((l) => l.cards.some((c) => c.id === id))?.id;
  assert.deepEqual(['working', 'idle', 'done', 'fresh'].map(where), ['now', 'next', 'shipped', 'now']);
  const idle = m.lanes.find((l) => l.id === 'next').cards.find((c) => c.id === 'idle');
  assert.match(idle.line, /Next: Write the tests/);
  assert.match(m.lanes.find((l) => l.id === 'now').cards.find((c) => c.id === 'fresh').line, /Starting/);
});

test('what she started comes first in Now, marked as hers', async () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  const m = boardModel({ runs: [{ id: 'run1', title: 'Declare contrast pairs', status: 'running', startedAt: '2026-11-24T09:59:00Z', steps: [] }], board: { sessions: [{ id: 'busy', title: 'Builder', project: 'CHIP', steps: [], startedAt: now - 7200e3, updatedAt: now, working: true, asks: false }], progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } }, now });
  const first = m.lanes.find((l) => l.id === 'now').cards[0];
  assert.equal(first.id, 'run1');
  assert.match(first.line, /^Started by you/);
});

test('old pull requests already in their base are one card saying so', async () => {
  const pr = (n) => ({ id: `pr-chip-${n}`, lane: 'ready', project: 'CHIP', projectId: 'chip', number: n, replacedBy: 'main', title: `PR ${n}`, url: 'u', updatedAt: '2026-11-19T10:00:00Z' });
  const old = boardModel({ lanes: { prs: [pr(1), pr(3)], reached: true }, board: null }).lanes.find((l) => l.id === 'now').cards.find((c) => c.kind === 'pr-old');
  const d = decisionOf(old);
  assert.match(d.ask, /2 old CHIP pull requests have already landed: close them\?/);
  assert.match(d.yes.call.terminal.command, /gh pr close 1 --comment "Already in main"/);
});
