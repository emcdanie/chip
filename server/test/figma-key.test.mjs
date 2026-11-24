// "Add file key" asks for the Figma link and reads the ID itself (23 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyFromLink, saveFigmaKey } from '../lib/figma-key.mjs';

test('the file ID comes out of a Figma link, with or without extras', () => {
  assert.equal(keyFromLink('https://www.figma.com/design/AbC123xyz9QwErTy/BELLA-library?node-id=1-2&t=x'), 'AbC123xyz9QwErTy');
  assert.equal(keyFromLink('figma.com/file/AbC123xyz9QwErTy/x'), 'AbC123xyz9QwErTy');
  assert.equal(keyFromLink('AbC123xyz9QwErTy'), 'AbC123xyz9QwErTy');
  assert.equal(keyFromLink('https://example.com/design/AbC123xyz9QwErTy'), null);
  assert.equal(keyFromLink('hello'), null);
});

test('saving writes one FIGMA_FILE_KEY line, keeps the rest, and refuses a non-link', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'chip-env-')), '.env');
  writeFileSync(file, 'PORT=3100\nFIGMA_FILE_KEY=old\n');
  const was = process.env.FIGMA_FILE_KEY;
  try {
    saveFigmaKey('https://www.figma.com/design/AbC123xyz9QwErTy/x', file);
    assert.equal(readFileSync(file, 'utf8'), 'PORT=3100\nFIGMA_FILE_KEY=AbC123xyz9QwErTy\n');
    assert.throws(() => saveFigmaKey('nope', file), /not a Figma link/);
  } finally {
    if (was === undefined) delete process.env.FIGMA_FILE_KEY;
    else process.env.FIGMA_FILE_KEY = was;
  }
});

test('the route that writes the key refuses other websites', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("app.post('/figma-key'"), src.indexOf("app.get('/host'"));
  assert.match(block, /sameApp\(req, res\)/);
});

// ---- the token (23 Nov): only ever in server/.env, never echoed, logged or sent anywhere but Figma ----
import { saveFigmaToken, testFigma } from '../lib/figma-key.mjs';
const FAKE = 'figd_fake_token_for_tests_only_0123456789';

test('the token is written to the env file, kept in the process, and never returned', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'chip-env-')), '.env');
  writeFileSync(file, 'PORT=3100\nFIGMA_FILE_KEY=AbC123xyz9QwErTy\n');
  const was = process.env.FIGMA_ACCESS_TOKEN;
  const logged = [];
  const log = console.log;
  console.log = (...a) => logged.push(a.join(' '));
  try {
    const out = saveFigmaToken(FAKE, file, join(file, '..', 'dates.json'));
    assert.equal(readFileSync(file, 'utf8'), `PORT=3100\nFIGMA_FILE_KEY=AbC123xyz9QwErTy\nFIGMA_ACCESS_TOKEN=${FAKE}\n`);
    assert.equal(process.env.FIGMA_ACCESS_TOKEN, FAKE);
    assert.equal(out.token, true);
    assert.ok(!JSON.stringify(out).includes(FAKE), 'the answer never holds the token');
    assert.ok(!logged.join('\n').includes(FAKE), 'nothing is logged');
    assert.throws(() => saveFigmaToken('has a space', file), (e) => !e.message.includes('has a space'));
    assert.throws(() => saveFigmaToken(`${FAKE}\nEVIL=1`, file), /does not look like a Figma token/);
  } finally {
    console.log = log;
    if (was === undefined) delete process.env.FIGMA_ACCESS_TOKEN;
    else process.env.FIGMA_ACCESS_TOKEN = was;
  }
});

test('Test it says "Connected to <file>", or in words why not, and the words never hold the token', async () => {
  const keep = { k: process.env.FIGMA_FILE_KEY, t: process.env.FIGMA_ACCESS_TOKEN };
  const file = join(mkdtempSync(join(tmpdir(), 'chip-read-')), 'read.json');
  process.env.FIGMA_FILE_KEY = 'AbC123xyz9QwErTy';
  process.env.FIGMA_ACCESS_TOKEN = FAKE;
  try {
    const seen = [];
    const ok = await testFigma({ file, get: async (url, token) => (seen.push([url, token]), { ok: true, status: 200, body: { name: 'BellaComponents' } }) });
    assert.deepEqual([ok.ok, ok.says], [true, 'Connected to BellaComponents']);
    assert.ok(!seen[0][0].includes(FAKE), 'the token is a header, never in the address');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).name, 'BellaComponents', 'the last good read is kept with its time');
    for (const status of [403, 404, 429, 500]) {
      const r = await testFigma({ file, get: async () => ({ ok: false, status, body: null }) });
      assert.equal(r.ok, false);
      assert.ok(!JSON.stringify(r).includes(FAKE));
    }
    delete process.env.FIGMA_ACCESS_TOKEN;
    assert.match((await testFigma({ file })).says, /no Figma token/);
  } finally {
    for (const [name, v] of [['FIGMA_FILE_KEY', keep.k], ['FIGMA_ACCESS_TOKEN', keep.t]]) {
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  }
});

test('the routes that take the token and call Figma refuse other websites', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  for (const route of ["app.post('/figma-token'", "app.post('/figma-test'"]) {
    const at = src.indexOf(route);
    assert.ok(at > 0, route);
    assert.match(src.slice(at, at + 200), /sameApp\(req, res\)/);
  }
  assert.ok(!/console\.(log|error|warn)\([^)]*(token|TOKEN)/.test(src.slice(src.indexOf("app.post('/figma-token'"), src.indexOf("app.get('/host'"))), 'the token routes log nothing');
});
