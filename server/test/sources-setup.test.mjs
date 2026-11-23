// Sources and set up (23 Nov 2026): every source is real and complete, the Notion secret stays in .env, and the routes refuse other websites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOURCES, sourceList, readSource, sectionOf, withoutHerWords } from '../lib/sources.mjs';
import { saveNotionToken, savedAt, markSaved } from '../lib/connections.mjs';

test('every source names who, what and a place to read it, and nothing is a bare "Notion" or "YAML"', () => {
  const ids = new Set();
  for (const s of SOURCES) {
    assert.ok(!ids.has(s.id), `${s.id} twice`);
    ids.add(s.id);
    assert.ok(s.author && s.title, `${s.id} needs an author and a title`);
    assert.ok(!/^(notion|yaml)$/i.test(s.title));
    assert.ok(s.original || s.read, `${s.id} has neither an original nor a text`);
    if (s.original) assert.match(s.original, /^https:\/\//);
    if (s.kind === 'standard') assert.match(s.original, /^https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/.+\.html$/);
  }
  assert.equal(sourceList().length, SOURCES.length);
  // the list the page gets never carries a file path
  assert.ok(sourceList().every((s) => !('file' in s) && !('note' in s)));
});

test('a rule file gives one section', () => {
  assert.equal(sectionOf('# A\nx\n## B\ny\n## C\nz', 'B').trim(), 'y');
});

test('a house rule never shows her own words back to her', () => {
  const out = withoutHerWords('Keep it (Elleta, 22 Nov: "why are we naming them colors"). Next.');
  assert.ok(!/colors/.test(out));
});

test('a standard shows who, what and when with its link, and copies no text from the other site', async () => {
  const r = await readSource('wcag-4-1-2');
  assert.equal(r.text, null);
  assert.match(r.original, /^https:\/\/www\.w3\.org\//);
  assert.equal(sourceList().find((x) => x.id === 'wcag-4-1-2').readable, false);
  assert.equal(await readSource('nope'), null);
});

test('the Notion secret goes to .env only, with the day kept apart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chip-notion-'));
  const env = join(dir, '.env');
  const dates = join(dir, 'connections.json');
  writeFileSync(env, 'PORT=3100\n');
  const was = process.env.NOTION_API_TOKEN;
  const secret = 'ntn_fake_secret_for_tests_only_0123456789';
  try {
    const r = saveNotionToken(secret, { env, dates });
    assert.deepEqual(Object.keys(r).sort(), ['ok', 'savedAt', 'token']);
    assert.equal(readFileSync(env, 'utf8'), `PORT=3100\nNOTION_API_TOKEN=${secret}\n`);
    assert.ok(!readFileSync(dates, 'utf8').includes(secret));
    assert.ok(savedAt('notion-token', dates));
    assert.throws(() => saveNotionToken('two words', { env, dates }), /does not look like a Notion secret/);
    markSaved('x', dates);
    assert.ok(savedAt('x', dates));
  } finally {
    if (was === undefined) delete process.env.NOTION_API_TOKEN;
    else process.env.NOTION_API_TOKEN = was;
  }
});

test('the routes that write or read secrets and sources refuse other websites', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("app.get('/notion-token'"), src.indexOf("app.post('/figma-test'"));
  assert.equal((block.match(/sameApp\(req, res\)/g) ?? []).length, 1);
  assert.equal((block.match(/sameApp\(req, res, \{ post: false \}\)/g) ?? []).length, 3);
  assert.doesNotMatch(block, /console\.log|NOTION_API_TOKEN/);
});
