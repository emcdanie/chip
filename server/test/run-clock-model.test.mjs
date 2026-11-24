// The header indicator, the Activity rows and the Friedman thresholds read the run records one way (app/src/runClock.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { indicator, activityRow, usually, waitStage, found, isGoing, changeNote } = await import('../../app/src/runClock.js');

const running = { id: 'a', title: 'Fix CheckRow', status: 'running', step: 'Edited X', startedAt: '2026-11-23T09:41:00.000Z', steps: [{ endedAt: '2026-11-23T09:43:00.000Z' }] };

test('idle says nothing is running; running says which, its step and since when', () => {
  assert.equal(indicator([]).state, 'idle');
  const i = indicator([running]);
  assert.deepEqual([i.state, i.count, i.title, i.done, i.total, i.since], ['running', 1, 'Fix CheckRow', 1, 4, running.startedAt]);
  assert.equal(i.lastStepAt, '2026-11-23T09:43:00.000Z');
  assert.equal(indicator([running, { ...running, id: 'b' }]).count, 2);
});

test('a run that just ended shows once, for 10 s, then the page is idle again', () => {
  const ended = { id: 'c', title: 'Fix Badge', status: 'passed', endedAt: '2026-11-23T09:50:00.000Z' };
  const t = Date.parse(ended.endedAt);
  assert.equal(indicator([ended], { now: t + 3000 }).state, 'done');
  assert.equal(indicator([ended], { now: t + 11000 }).state, 'idle');
  assert.equal(indicator([ended], { now: t + 3000, seen: 'c' }).state, 'idle');
  assert.equal(indicator([{ ...ended, status: 'failed' }], { now: t + 1000 }).state, 'failed');
});

test('a Done run whose after-Accept steps are working still counts as running', () => {
  assert.equal(isGoing({ status: 'kept', after: { startedAt: 'x' } }), true);
  assert.equal(isGoing({ status: 'kept', after: { startedAt: 'x', endedAt: 'y' } }), false);
});

test('"usually 4 to 7 min" only from a range', () => {
  assert.equal(usually({ n: 2, minMs: null }), null);
  assert.equal(usually({ n: 3, minMs: 240000, maxMs: 396000 }), 'usually 4 to 7 min');
});

test('activity rows say why a run did not land, never silence', () => {
  assert.match(activityRow({ id: 'x', title: 'T', status: 'failed', startedAt: '2026-11-23T09:00:00.000Z', error: 'the gate refused the commit' }).line, /Did not land: the gate refused the commit/);
  const nc = activityRow({ id: 'x', title: 'T', status: 'nochange', startedAt: '2026-11-23T09:00:00.000Z', durationMs: 90000 });
  assert.equal(nc.state, 'failed');
  assert.match(nc.line, /Did not land: it changed nothing/);
  assert.equal(activityRow(running, { n: 3, minMs: 240000, maxMs: 420000 }).state, 'running');
});

test('Friedman: none under 1 s, skeleton 1 to 3, bar 3 to 10, steps after', () => {
  assert.deepEqual([500, 1000, 2999, 3000, 9999, 10000].map(waitStage), ['none', 'skeleton', 'skeleton', 'bar', 'bar', 'steps']);
});

test('a read says what it found', () => {
  assert.equal(found({ a: 1 }, { a: 1 }), 'nothing changed');
  assert.equal(found({ a: 1 }, { a: 2 }), 'something changed');
});

test('a live change says which figure moved, with its sign', () => {
  assert.equal(changeNote([['needing work', 5, 6], ['healthy %', 90, 90]]), 'needing work +1');
  assert.equal(changeNote([['needing work', 5, 4]]), 'needing work −1');
  assert.equal(changeNote([['x', 1, 1]]), null);
});

test('two runs with one title get distinct card titles; a stopped card keeps one count', async () => {
  const { boardModel } = await import('../../app/src/pages/workModel.js');
  const run = (id, at) => ({ id, title: "Fix CheckRow's drift", status: 'failed', error: 'the gate refused the commit', startedAt: at, steps: [{ step: 'a', endedAt: at }] });
  const m = boardModel({ runs: [run('a', '2026-11-22T22:26:00.000Z'), run('b', '2026-11-21T22:26:00.000Z')] });
  const titles = m.lanes.flatMap((l) => l.cards).filter((c) => c.kind === 'run').map((c) => c.title);
  assert.equal(new Set(titles).size, titles.length);
  const card = m.lanes.flatMap((l) => l.cards).find((c) => c.kind === 'run');
  assert.ok(!/Stopped at/.test(card.line));
});

test('the header light counts her Claude sessions whose turn is open, not only CHIP runs (24 Nov)', async () => {
  const { lightOf } = await import('../../app/src/runClock.js');
  assert.equal(lightOf([], []).state, 'idle');
  assert.equal(lightOf([], [{ id: 'a', title: 'Idle', working: false }]).state, 'idle');
  const one = lightOf([], [{ id: 'a', title: 'Drawers', working: true, steps: [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }] }]);
  assert.deepEqual([one.state, one.count, one.title, one.done, one.total], ['running', 1, 'Drawers', 1, 3]);
  const many = lightOf([{ id: 'r', title: 'Fix', status: 'running', startedAt: new Date().toISOString() }], [{ id: 'a', title: 'A', working: true }, { id: 'b', title: 'B', working: true }]);
  assert.deepEqual([many.state, many.count, many.title], ['running', 3, '3 running']);
});

test('runs: open first, closed or replaced under Earlier; a held port said plainly (24 Nov)', async () => {
  const { splitRuns, plainStop } = await import('../../app/src/runClock.js');
  const runs = [
    { id: 'a', title: 'Contrast', status: 'failed', startedAt: '2026-11-24T09:40:00Z', error: 'Port 6006 is in use (a Storybook is running).' },
    { id: 'b', title: 'Contrast', status: 'failed', startedAt: '2026-11-24T08:00:00Z' },
    { id: 'c', title: 'Kbd', status: 'passed', startedAt: '2026-11-24T07:00:00Z' },
    { id: 'd', title: 'Pin', status: 'closed', startedAt: '2026-11-23T07:00:00Z' },
    { id: 'e', title: 'Old', status: 'kept', startedAt: '2026-11-23T06:00:00Z' },
  ];
  const { open, earlier } = splitRuns(runs);
  assert.deepEqual(open.map((r) => r.id), ['a', 'c']);
  assert.deepEqual(earlier.map((r) => r.id), ['b', 'd', 'e']);
  assert.equal(plainStop(runs[0].error), 'Did not run: another program held the port it needs');
  assert.equal(plainStop('The gate failed.'), 'Did not land: The gate failed');
});
