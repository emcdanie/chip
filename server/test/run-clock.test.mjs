// Feedback and sense of time (23 Nov): a run records its end, its length and its step count once,
// and "usually 4 to 7 min" appears only from three finished runs (a countdown from five).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { stamp, usualRange } = await import('../lib/runs.mjs');

test('a finished run gets its end, length and step count once', () => {
  const run = { status: 'passed', startedAt: '2026-11-22T09:00:00.000Z', steps: [{}, {}, {}] };
  stamp(run, new Date('2026-11-22T09:04:00.000Z'));
  assert.equal(run.endedAt, '2026-11-22T09:04:00.000Z');
  assert.equal(run.durationMs, 240000);
  assert.equal(run.stepCount, 3);
  stamp(run, new Date('2026-11-22T10:00:00.000Z'));
  assert.equal(run.durationMs, 240000, 'never changed after');
});

test('a running run is not stamped', () => {
  for (const status of ['starting', 'running', 'gate']) assert.equal(stamp({ status, startedAt: 'x', steps: [] }).endedAt, undefined);
});

test('usual range: nothing under three passed runs, a countdown from five', () => {
  const r = (ms, status = 'passed') => ({ status, durationMs: ms });
  assert.equal(usualRange([r(240000), r(300000)]).minMs, null);
  const three = usualRange([r(240000), r(342000), r(396000), r(1, 'failed')]);
  assert.deepEqual([three.n, three.minMs, three.maxMs, three.countdown], [3, 240000, 396000, false]);
  assert.equal(usualRange([1, 2, 3, 4, 5].map((n) => r(n * 60000))).countdown, true);
});
