// Gate runs as bars: every recorded run lands in exactly one slot, failures keep their cause (23 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateRuns, gateSlots } from '../../app/src/pages/gateSlots.js';

const now = new Date(2026, 10, 23, 8, 40);
const at = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
const checks = {
  ci: [
    { status: 'completed', conclusion: 'success', createdAt: at(23, 7, 10) },
    { status: 'completed', conclusion: 'failure', createdAt: at(23, 7, 20) },
    { status: 'in_progress', conclusion: null, createdAt: at(23, 8, 0) },
    { status: 'completed', conclusion: 'success', createdAt: at(21, 15, 0) },
  ],
  log: [{ ranAt: at(23, 7, 45), ok: false, name: 'contracts' }, { ranAt: at(23, 8, 31), ok: true, name: 'tokens' }],
};
const runs = gateRuns(checks);
const total = (s) => s.reduce((t, x) => t + x.passed + x.failed, 0);

test('only finished runs count, and each lands in one slot', () => {
  assert.equal(runs.length, 5);
  assert.equal(total(gateSlots(runs, 'day', now)), 4, 'day: the four runs of today');
  assert.equal(total(gateSlots(runs, 'week', now)), 5);
  assert.equal(total(gateSlots(runs, 'year', now)), 5);
});

test('a half hour holds its passes, its failures and what failed', () => {
  const s = gateSlots(runs, 'day', now);
  const seven = s.find((x) => x.range === '07:00-07:30');
  assert.deepEqual([seven.passed, seven.failed], [1, 1]);
  const half = s.find((x) => x.range === '07:30-08:00');
  assert.equal(half.cause, 'contracts');
  assert.equal(s.find((x) => x.axisLabel === '07:00').label, '07:00');
});

test('no runs at all gives empty slots, never invented ones', () => {
  assert.equal(total(gateSlots([], 'week', now)), 0);
});
