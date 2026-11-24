// Not again: what keeps coming back and the permanent fixes (22 Nov). Only what the logs hold; nothing is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedLoops, plannedFixes, recurring } from '../lib/not-again.mjs';

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

test('a landed fix is a closed loop; before and after are counted only when a check is tied to it', () => {
  const fixes = [
    { id: 'a', status: 'landed', kind: 'Fix contracts', closes: 'Contracts failing', check: 'contract', landed: at(5), commit: 'abc1234', changed: 'Rebuilt the spec.' },
    { id: 'b', status: 'landed', kind: 'Another fix', closes: 'A layout slip', landed: at(1), commit: 'def5678' },
    { id: 'c', status: 'planned', kind: 'Not yet', closes: 'Something', planned: at(1) },
  ];
  const c = closedLoops(log, fixes, { now });
  assert.equal(c.length, 2, 'a planned fix has not landed, so it is not a closed loop');
  const fix = c.find((x) => x.kind === 'Fix contracts');
  assert.deepEqual([fix.before, fix.after, fix.measured, fix.tooEarly, fix.commit], [1, 2, true, false, 'abc1234']);
  assert.equal(fix.changed, 'Rebuilt the spec.');
  const other = c.find((x) => x.kind === 'Another fix');
  assert.deepEqual([other.before, other.after, other.measured, other.changed, other.tooEarly], [null, null, false, null, true]);
  assert.deepEqual(plannedFixes(fixes).map((p) => p.kind), ['Not yet']);
});

test('a check tied to a fix that landed under 3 days ago has no after yet', () => {
  const c = closedLoops(log, [{ status: 'landed', kind: 'Fresh', closes: 'x', check: 'contract', landed: at(1), commit: 'aaa1111' }], { now });
  assert.deepEqual([c[0].before, c[0].after, c[0].tooEarly], [2, null, true]);
});
