// Not again: what keeps coming back and the permanent fixes (22 Nov). Only what the logs hold; nothing is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedLoops, recurring } from '../lib/not-again.mjs';

const now = Date.parse('2026-11-23T12:00:00Z');
const at = (d) => new Date(now - d * 86400000).toISOString();
const log = [
  { id: 'contract', ok: false, ranAt: at(1), commit: 'aaa1111' },
  { id: 'contract', ok: false, ranAt: at(2) },
  { id: 'contract', ok: false, ranAt: at(10) },
  { id: 'contract', ok: true, ranAt: at(0.5) },
  { id: 'tokens-built', ok: false, ranAt: at(12) },
  { id: 'visual', ok: false, ranAt: at(30) }, // older than 14 days: not counted
];

test('the failures of the last 14 days are ranked with count, last time and trend', () => {
  const r = recurring(log, { names: { contract: 'Contracts match the code' }, now });
  assert.deepEqual(r.map((x) => [x.id, x.count]), [['contract', 3], ['tokens-built', 1]]);
  assert.equal(r[0].name, 'Contracts match the code');
  assert.equal(r[0].last, at(1));
  assert.equal(r[0].commit, 'aaa1111');
  assert.equal(r[0].trend, 'up', '2 in the last week against 1 before');
  assert.equal(r[1].trend, 'down');
});

test('nothing failing is an empty list, never made-up rows', () => {
  assert.deepEqual(recurring([{ id: 'a', ok: true, ranAt: at(1) }], { now }), []);
});

test('a kept run is a closed loop; before and after are counted only when the check it answers to is known', () => {
  const actions = [
    { kind: 'keep', title: "Fix CheckRow's drift", at: at(5), files: ['specs/a.yaml'], sentence: 'Rebuilt the spec.', check: 'contract' },
    { kind: 'keep', title: 'Another fix', at: at(1), files: [] },
    { kind: 'undo', title: 'Not this', at: at(2) },
  ];
  const c = closedLoops(log, actions, { now });
  assert.equal(c.length, 2, 'an undone run is not a permanent fix');
  const fix = c.find((x) => x.kind === "Fix CheckRow's drift");
  assert.deepEqual([fix.before, fix.after, fix.measured], [1, 2, true]);
  assert.equal(fix.changed, 'Rebuilt the spec.');
  const other = c.find((x) => x.kind === 'Another fix');
  assert.deepEqual([other.before, other.after, other.measured, other.changed], [null, null, false, null]);
});
