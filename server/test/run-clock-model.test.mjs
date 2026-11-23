// The header indicator, the Activity rows and the Friedman thresholds read the run records one way (app/src/runClock.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { indicator, activityRow, usually, waitStage, found, isGoing } = await import('../../app/src/runClock.js');

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
