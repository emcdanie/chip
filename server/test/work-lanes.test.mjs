// Work's lanes beyond CHIP's runs, and her saved moves (click test 22 Nov: "all I ever see is the
// Needs you", "it doesn't let me move any").
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { ciOf, prCards, saveBoard, readBoard, replayPlan, sessionTasks, progressItems } = await import('../lib/lanes.mjs');

test('a PR’s CI in a word', () => {
  assert.equal(ciOf([]), 'none');
  assert.equal(ciOf([{ conclusion: 'SUCCESS' }, { conclusion: 'SKIPPED' }]), 'passed');
  assert.equal(ciOf([{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }]), 'checking');
  assert.equal(ciOf([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }]), 'failed');
});

test('running CI goes to the gate, passed to Ready; failed, none and old are counted, not shown', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  const day = (d) => new Date(now - d * 864e5).toISOString();
  const project = { id: 'chip', short: 'CHIP' };
  const prs = [
    { number: 1, title: 'a', headRefName: 'x', updatedAt: day(1), statusCheckRollup: [{ status: 'QUEUED' }] },
    { number: 2, title: 'b', headRefName: 'y', updatedAt: day(2), statusCheckRollup: [{ conclusion: 'SUCCESS' }] },
    { number: 3, title: 'c', headRefName: 'z', updatedAt: day(3), statusCheckRollup: [{ conclusion: 'FAILURE' }] },
    { number: 4, title: 'd', headRefName: 'w', updatedAt: day(4), statusCheckRollup: [] },
    { number: 5, title: 'e', headRefName: 'v', updatedAt: day(40), statusCheckRollup: [{ conclusion: 'SUCCESS' }] },
  ];
  const { cards, left } = prCards([{ project, prs }], now);
  assert.deepEqual(cards.map((c) => [c.number, c.lane]), [[1, 'gate'], [2, 'ready']]);
  assert.deepEqual(left, { failed: 1, none: 1, old: 1 });
});

const dir = mkdtempSync(join(tmpdir(), 'chip-board-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, 'board.json');

test('a move is saved in order, and putting it back clears it', () => {
  saveBoard({ id: 'a', lane: 'next' }, file);
  saveBoard({ id: 'b', lane: 'next' }, file);
  saveBoard({ id: 'c', lane: 'next', before: 'a' }, file);
  assert.deepEqual(readBoard(file).order.next, ['c', 'a', 'b']);
  saveBoard({ id: 'b', lane: 'next', paused: true }, file);
  assert.equal(readBoard(file).place.b.paused, true);
  saveBoard({ id: 'c', lane: null }, file);
  assert.deepEqual(readBoard(file).order.next, ['a', 'b']);
  assert.equal(readBoard(file).place.c, undefined);
});

test('a move to a lane that does not exist is refused', () => {
  assert.throws(() => saveBoard({ id: 'x', lane: 'merged' }, file), /No lane/);
  assert.throws(() => saveBoard({ id: '<script>', lane: 'next' }, file), /No card/);
});

test('the board only changes from CHIP itself (origin guard on POST /work/board)', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const route = src.slice(src.indexOf("app.post('/work/board'"));
  assert.match(route.slice(0, 200), /if \(!sameApp\(req, res\)\) return;/);
});

const use = (name, input) => JSON.stringify({ message: { content: [{ type: 'tool_use', name, input }] } });
test('a plan is replayed from update_plan and wrap_up only', () => {
  const text = [
    use('mcp__ccd_turn__update_plan', { items: [{ content: 'Read', status: 'in_progress' }, { content: 'Build', status: 'pending' }, { content: 'Check', status: 'pending' }] }),
    JSON.stringify({ message: { content: [{ type: 'text', text: 'update_plan advance' }] } }),
    use('mcp__ccd_turn__update_plan', { advance: true }),
    JSON.stringify({ isSidechain: true, message: { content: [{ type: 'tool_use', name: 'mcp__ccd_turn__update_plan', input: { advance: true } }] } }),
  ].join('\n');
  assert.deepEqual(replayPlan(text).map((x) => x.status), ['completed', 'in_progress', 'pending']);
  assert.deepEqual(replayPlan(`${text}\n${use('mcp__ccd_turn__update_plan', { done: [3], start: 1 })}`).map((x) => x.status), ['in_progress', 'pending', 'completed']);
  assert.deepEqual(replayPlan(`${text}\n${use('mcp__ccd_turn__wrap_up', { recap: 'x' })}`).map((x) => x.status), ['completed', 'completed', 'pending']);
});

test('only recent, unarchived sessions in a CHIP project reach the board', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  const sess = join(dir, 'sessions', 'a', 'b');
  const tr = join(dir, 'projects', 'p');
  mkdirSync(sess, { recursive: true });
  mkdirSync(tr, { recursive: true });
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const rec = (id, o) => writeFileSync(join(sess, `local_${id}.json`), JSON.stringify({ sessionId: `local_${id}`, cliSessionId: id, cwd: repo, title: `Task ${id}`, lastActivityAt: now - 36e5, createdAt: now - 72e5, isArchived: false, ...o }));
  for (const id of ['one', 'old', 'gone', 'elsewhere']) writeFileSync(join(tr, `${id}.jsonl`), use('mcp__ccd_turn__update_plan', { items: [{ content: 'Step', status: 'in_progress' }] }));
  rec('one', {});
  rec('old', { lastActivityAt: now - 40 * 36e5 });
  rec('gone', { isArchived: true });
  rec('elsewhere', { cwd: '/somewhere/else' });
  const got = sessionTasks([{ repo, short: 'CHIP' }], now, { dir: join(dir, 'sessions'), transcripts: join(dir, 'projects') });
  assert.deepEqual(got.map((s) => [s.title, s.project, s.steps.length]), [['Task one', 'CHIP', 1]]);
});

test('progress links are made whole', () => {
  const p = join(dir, 'progress');
  mkdirSync(p);
  writeFileSync(join(p, 'progress.json'), JSON.stringify({ items: [{ id: 'x', title: 'Pick', stage: 'Waiting on you', link: '../2026-11-22-x/' }, { id: 'x', title: 'Again', stage: 'To do' }] }));
  const { items } = progressItems(p, 'http://localhost:3123/screens/progress/');
  assert.equal(items[0].link, 'http://localhost:3123/screens/2026-11-22-x/');
  assert.deepEqual(items.map((i) => i.id), ['p-x', 'p-x-2']);
});
