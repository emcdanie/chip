// New › Project: what CHIP reads from a dropped file, that private text is refused without naming the term,
// that folders are read only under home and by file name, that the project record is made and removed, and that
// every route refuses other websites.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'chip-new-')));
const home = join(tmp, 'home');
mkdirSync(join(home, 'Harbour'), { recursive: true });
mkdirSync(join(home, '.secret'), { recursive: true });
writeFileSync(join(tmp, 'nda.txt'), '# one term per line\nAcmeSecret\n');
writeFileSync(join(home, 'Harbour', 'CLAUDE.md'), '# Harbour\n\n## What it is\nA ferry timetable for commuters.\n\nWho it is for: the Harbour team.\nFigma: https://www.figma.com/design/AbC123/Harbour\nBranch chip/ferries.\nSee AGENTS.md.\n');
writeFileSync(join(tmp, 'outside.md'), '# Outside\nsecret\n');
symlinkSync(tmp, join(home, 'link'));
process.env.CHIP_HOME = home;
process.env.CHIP_NDA_TERMS = join(tmp, 'nda.txt');
process.env.CHIP_PROJECTS_DIR = join(tmp, 'data');
const { newRoutes } = await import('../lib/new-routes.mjs');
const { readDropped, readStore } = await import('../lib/project-read.mjs');
const { appOrigins } = await import('../lib/origin.mjs');

const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const origins = appOrigins(port);
app.use(newRoutes({ origins, ids: () => ['chip', 'site', 'bella'] }));
after(() => (server.close(), rmSync(tmp, { recursive: true, force: true })));
const go = (method, path, body, origin = `http://localhost:${port}`) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });

const MD = '# Harbour\n\n## What it is\nA ferry timetable for commuters.\n\nWho it is for: the Harbour team.\nFigma: https://www.figma.com/design/AbC123/Harbour\nBranch chip/ferries.\nSee CLAUDE.md and AGENTS.md.\n';

test('dropped text becomes name, purpose, figma, branch, rules and who, each with where it came from', () => {
  const r = readDropped(MD, 'harbour.md');
  assert.equal(r.ok, true);
  assert.equal(r.fields.name.value, 'Harbour');
  assert.match(r.fields.purpose.value, /ferry timetable/);
  assert.match(r.fields.figma.value, /figma\.com\/design\/AbC123/);
  assert.equal(r.fields.branches.value, 'chip/ferries');
  assert.match(r.fields.rules.value, /CLAUDE\.md/);
  assert.match(r.fields.forWhom.value, /Harbour team/);
  assert.equal(r.fields.name.sure, true);
  assert.equal(r.fields.repo, null, 'nothing said about a folder is not guessed');
});

test('text with a forbidden term or a private heading is refused, and the reply never names the term', () => {
  for (const t of ['# X\nWorks for acmesecret.', '# Client work (NDA)\nbody']) {
    const r = readDropped(t);
    assert.equal(r.ok, false);
    assert.equal(r.refused, 'private');
    assert.doesNotMatch(JSON.stringify(r), /acmesecret/i);
  }
  assert.equal(readDropped('').refused, 'empty');
  assert.equal(readDropped('x'.repeat(200_001)).refused, 'size');
});

test('every route refuses another website and a call with no Origin', async () => {
  for (const [m, p, b] of [['POST', '/projects/read', { text: MD }], ['POST', '/projects/plan', { fields: { name: 'X' } }], ['POST', '/projects', { fields: { name: 'X' } }], ['DELETE', '/projects/x', null]]) {
    assert.equal((await go(m, p, b, 'http://evil.example')).status, 403, `${m} ${p} from another site`);
    assert.equal((await go(m, p, b, null)).status, 403, `${m} ${p} with no Origin`);
  }
  assert.equal((await go('GET', '/projects/folders', null, 'http://evil.example')).status, 403);
  assert.equal(readStore().length, 0, 'nothing was written');
});

test('folders are listed and read only under home, by file name', async () => {
  const list = await (await go('GET', '/projects/folders')).json();
  assert.deepEqual(list.folders.filter((f) => f === 'Harbour' || f === '.secret'), ['Harbour'], 'hidden folders are not listed');
  const read = await (await go('POST', '/projects/read', { folder: join(home, 'Harbour') })).json();
  assert.equal(read.ok, true);
  assert.equal(read.fields.name.value, 'Harbour');
  assert.equal(read.fields.repo.value, join(home, 'Harbour'));
  for (const bad of [tmp, '/etc', join(home, '..'), join(home, 'link'), join(home, 'Harbour', '..', '..'), '/etc\0/x']) {
    const r = await go('POST', '/projects/read', { folder: bad });
    assert.equal(r.status, 400, `${bad} is refused`);
  }
  assert.equal((await go('GET', `/projects/folders?dir=${encodeURIComponent('/etc')}`)).status, 400);
});

test('Set up lists what it will make; Approve writes it; Undo removes everything it made', async () => {
  const fields = { name: 'Harbour', purpose: 'A ferry timetable', repo: join(home, 'Harbour'), figma: 'https://www.figma.com/design/AbC123/Harbour', branches: 'chip/ferries' };
  const plan = await (await go('POST', '/projects/plan', { fields })).json();
  assert.equal(plan.id, 'harbour');
  assert.equal(plan.creates.length, 4);
  assert.equal(readStore().length, 0, 'the plan wrote nothing');
  const made = await go('POST', '/projects', { fields });
  assert.equal(made.status, 201);
  assert.equal(readStore()[0].id, 'harbour');
  assert.ok(existsSync(join(tmp, 'data', 'projects', 'harbour', 'handoff.md')));
  assert.ok(existsSync(join(tmp, 'data', 'projects', 'harbour', 'notes')));
  assert.equal((await go('POST', '/projects', { fields })).status, 400, 'no duplicate');
  assert.equal((await go('POST', '/projects', { fields: { name: 'Site' } })).status, 400, 'no clash with CHIP, Site or BELLA');
  assert.equal((await go('POST', '/projects', { fields: { name: 'Elsewhere', repo: '/etc' } })).status, 400, 'a folder outside home is not kept');
  assert.equal((await go('DELETE', '/projects/chip')).status, 400, 'Undo removes only what CHIP made');
  assert.equal((await go('DELETE', '/projects/..%2F..')).status, 400);
  assert.equal((await go('DELETE', '/projects/harbour')).status, 200);
  assert.equal(readStore().length, 0);
  assert.equal(existsSync(join(tmp, 'data', 'projects', 'harbour')), false);
});
