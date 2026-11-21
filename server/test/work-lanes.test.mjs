// Work's lanes beyond CHIP's runs, and her saved moves (click test 22 Nov: "all I ever see is the
// Needs you", "it doesn't let me move any").
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { ciOf, prCards, saveMove } = await import('../lib/lanes.mjs');

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

const dir = mkdtempSync(join(tmpdir(), 'chip-moves-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, 'moves.json');

test('a move is saved, and putting it back clears it', () => {
  saveMove({ id: 'ahead-bella', lane: 'ready' }, file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))['ahead-bella'].lane, 'ready');
  saveMove({ id: 'ahead-bella', lane: null }, file);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {});
});

test('a move to a lane that does not exist is refused', () => {
  assert.throws(() => saveMove({ id: 'x', lane: 'merged' }, file), /No lane/);
});
