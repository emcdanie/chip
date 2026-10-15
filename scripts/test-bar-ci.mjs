#!/usr/bin/env node
// Unit tests for bar.mjs CI helpers (node:test, no external deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPrNums, parseClaim, isMismatch } from '../server/lib/bar.mjs';

// extractPrNums
test('extractPrNums: #nnn', () => assert.deepEqual(extractPrNums('fixed in #170'), [170]));
test('extractPrNums: PR #nnn', () => assert.deepEqual(extractPrNums('PR #171 running'), [171]));
test('extractPrNums: OK #nnn', () => assert.deepEqual(extractPrNums('OK #166 merged'), [166]));
test('extractPrNums: dedupes', () => assert.deepEqual(extractPrNums('#170 and #170 again'), [170]));
test('extractPrNums: multiple', () => { const r = extractPrNums('#170 and #171'); assert.ok(r.includes(170) && r.includes(171)); });
test('extractPrNums: empty', () => assert.deepEqual(extractPrNums('no PRs here'), []));

// parseClaim
test('parseClaim: "CI green" → green', () => assert.equal(parseClaim('PR #170 CI green done'), 'green'));
test('parseClaim: "passed" → green', () => assert.equal(parseClaim('gate passed'), 'green'));
test('parseClaim: "failed" → red', () => assert.equal(parseClaim('CI failed'), 'red'));
test('parseClaim: "running" → running', () => assert.equal(parseClaim('CI running'), 'running'));
test('parseClaim: no claim → none', () => assert.equal(parseClaim('submitted PR #170'), 'none'));
test('parseClaim: null → none', () => assert.equal(parseClaim(null), 'none'));
// last-wins: status word that appears latest in text wins
test('parseClaim: succeeded then in progress → running (Bernie 05:45)', () => {
  const report = `Workflow run 38688180341 succeeded.\nCI run 38688489847 started 05:45 UTC — in progress.`;
  assert.equal(parseClaim(report), 'running');
});
test('parseClaim: failed then all green → green (last wins)', () => assert.equal(parseClaim('gate failed, then all green'), 'green'));
test('parseClaim: running then passed → green (last wins)', () => assert.equal(parseClaim('CI running ... later gate passed'), 'green'));

// isMismatch — the three real cases from 14 Oct
test('Dara #170: claims green, CI red → mismatch', () => assert.ok(isMismatch('green', 'red')));
test('Bernie #171: claim running, CI running → no mismatch', () => assert.ok(!isMismatch('running', 'running')));
test('merged #166: claim none, CI merged → no mismatch (ci=merged short-circuits)', () => assert.ok(!isMismatch('none', 'merged')));
// edge cases
test('isMismatch: claim none → never mismatch', () => assert.ok(!isMismatch('none', 'red')));
test('isMismatch: ci unknown → never mismatch', () => assert.ok(!isMismatch('green', 'unknown')));
test('isMismatch: both green → no mismatch', () => assert.ok(!isMismatch('green', 'green')));
