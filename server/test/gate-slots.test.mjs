// Gate runs as bars: every recorded run lands in exactly one slot, failures keep their cause (23 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRun, failedIn, gateAnswer, gateRuns, gateSlots } from '../../app/src/pages/gateSlots.js';

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
  assert.equal(half.cause, 'contracts', 'a name with no plain words is shown as it is');
  assert.equal(s.find((x) => x.axisLabel === '07:00').label, '07:00');
});

test('no runs at all gives empty slots, never invented ones', () => {
  assert.equal(total(gateSlots([], 'week', now)), 0);
});

test('the card answers from the recorded CI runs: how many passed, the last failure, the trend and what fails most', () => {
  const ci = [
    { status: 'completed', conclusion: 'success', createdAt: at(1, 9, 0), workflowName: 'Gate', title: 'a' },
    { status: 'completed', conclusion: 'failure', createdAt: at(2, 9, 0), workflowName: 'Contracts', title: 'b' },
    { status: 'completed', conclusion: 'failure', createdAt: at(20, 9, 0), workflowName: 'Contracts', title: 'Fix contracts' },
    { status: 'completed', conclusion: 'cancelled', createdAt: at(21, 9, 0), workflowName: 'Gate' },
    { status: 'completed', conclusion: 'success', createdAt: at(22, 9, 0), workflowName: 'Gate', title: 'c' },
  ];
  const r = gateRuns({ ci });
  assert.equal(r.length, 4, 'a cancelled run is not a pass or a failure');
  const a = gateAnswer(r, now);
  assert.deepEqual([a.total, a.passed], [4, 2]);
  assert.equal(a.last.title, 'Fix contracts');
  assert.deepEqual(a.most, { name: 'Contracts', n: 2 });
  assert.equal(failedIn(r, 'week', now).length, 1, 'the failure of the 20th is inside the week');
  assert.equal(failedIn(r, 'year', now).length, 2);
});

test('a failed run is explained in plain words, with the cause only when it was recorded and the fix from the next pass', () => {
  const r = gateRuns({
    log: [
      { ranAt: at(22, 9, 0), ok: false, name: 'Contracts match the code' },
      { ranAt: at(22, 9, 40), ok: true, name: 'Contracts match the code' },
    ],
    ci: [{ status: 'completed', conclusion: 'failure', createdAt: at(22, 10, 0), workflowName: 'CI', title: 'Add a Tag option. More text.' }, { status: 'completed', conclusion: 'success', createdAt: at(22, 10, 30), workflowName: 'CI', title: 'Fix the contract' }],
  });
  const chip = explainRun(r.find((x) => !x.ok && x.source === 'chip'), r);
  assert.match(chip.what, /written contract/);
  assert.match(chip.why, /options that do not exist/);
  assert.equal(chip.cause, null, 'not recorded: nothing is guessed');
  assert.equal(chip.fixed, '09:40');
  const ci = explainRun(r.find((x) => !x.ok && x.source === 'ci'), r);
  assert.equal(ci.cause, 'Add a Tag option.');
  assert.equal(ci.fixed, '10:30 by Fix the contract');
  assert.equal(ci.why, null, 'a name with no entry gets no invented reason');
});
