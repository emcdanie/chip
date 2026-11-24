// Not again's steps: a gate that ran and refused the commit shows as failed, never as still working
// (Step state failed, 22 Nov). A stopped run is not a failure, so its gate step stays waiting.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { stepsOf } = await import('../../app/src/pages/notAgainModel.js');

test('the gate that refused the commit is the failed step', () => {
  const steps = stepsOf('gate-fails', 3, { diff: '…', error: 'Contract check failed on Badge.' });
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'failed', 'pending']);
  assert.equal(steps[2].detail, 'Contract check failed on Badge.');
});

test('a run a maintainer stopped is not a failure', () => {
  const steps = stepsOf('gate-fails', 3, { error: 'Stopped by a maintainer' });
  assert.ok(!steps.some((s) => s.state === 'failed'));
});
