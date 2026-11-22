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
