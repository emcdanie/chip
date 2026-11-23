// The permanent-fix log: a fix is planned, then lands only with a commit git can find; never invented; and every write
// route refuses other websites (and a tool with no Origin).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixesRoutes, landFix, planFix, readFixes } from '../lib/fixes.mjs';
import { appOrigins } from '../lib/origin.mjs';

const dir = mkdtempSync(join(tmpdir(), 'chip-fixes-'));
const file = join(dir, 'fixes.json');
const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
app.use(fixesRoutes({ origins: appOrigins(port), file }));
after(() => (server.close(), rmSync(dir, { recursive: true, force: true })));
const call = (method, body, origin) =>
  fetch(`http://127.0.0.1:${port}/not-again/fixes`, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
const ok = (n) => (c) => (c === 'abc1234' ? 'abc1234' : null);

test('an empty log reads as no fixes, never made-up ones', () => {
  assert.deepEqual(readFixes(file), []);
});

test('a plan is logged as planned, with no commit and no date landed', () => {
  const e = planFix({ kind: 'Fix contracts', closes: 'Contracts failing', check: 'contract', runTitle: 'Fix contracts: A' }, { file });
  assert.equal(e.status, 'planned');
  assert.equal(e.commit, undefined);
  assert.equal(e.landed, undefined);
  assert.throws(() => planFix({ kind: 'x' }, { file }), /closes/);
});

test('a fix lands only with a commit git can find, and lands the plan for its run', () => {
  assert.throws(() => landFix({ runTitle: 'Fix contracts: A', commit: 'ffff999' }, { file, verify: ok() }), /not in this repository/);
  assert.equal(readFixes(file)[0].status, 'planned');
  const e = landFix({ runTitle: 'Fix contracts: A', commit: 'abc1234', changed: 'Rebuilt the spec.' }, { file, verify: ok() });
  assert.deepEqual([e.status, e.commit, e.check, e.kind], ['landed', 'abc1234', 'contract', 'Fix contracts']);
  assert.equal(readFixes(file).length, 1, 'the plan became the landed entry, not a second one');
});

test('a landed fix with no plan needs its name and what it closes', () => {
  assert.throws(() => landFix({ commit: 'abc1234' }, { file, verify: ok() }), /needs its name/);
});

test("CHIP's own page can plan a fix", async () => {
  const r = await call('POST', { kind: 'Fix drift', closes: 'Parts that differ' }, `http://localhost:${port}`);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).status, 'planned');
});

test('a foreign site, or a tool with no Origin, cannot write the log', async () => {
  const before = readFixes(file).length;
  assert.equal((await call('POST', { kind: 'x', closes: 'y' }, 'https://evil.example')).status, 403);
  assert.equal((await call('POST', { kind: 'x', closes: 'y' })).status, 403);
  assert.equal(readFixes(file).length, before);
});

test('a foreign site cannot read it either, and a plain read works', async () => {
  assert.equal((await call('GET', null, 'https://evil.example')).status, 403);
  assert.equal((await call('GET')).status, 200);
});
