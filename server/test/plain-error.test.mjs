// Errors reach the page in three plain lines and the raw text stays in the log (22 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { plainError } from '../lib/plain-error.mjs';

const quiet = { log: false };
test('a spec with bad YAML gives the plain message, not "yaml"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plain-err-'));
  mkdirSync(join(dir, 'specs/components'), { recursive: true });
  const file = join(dir, 'specs/components/Button.spec.yaml');
  writeFileSync(file, 'name: Button\n  props: [a\n bad: : :\n');
  const yaml = createRequire(import.meta.url)(join(process.env.BELLA_DIR || `${process.env.HOME}/DEV/bella-parts`, 'node_modules/js-yaml'));
  let err;
  try {
    yaml.load(readText(file), { filename: 'specs/components/Button.spec.yaml' });
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'the fixture really is bad YAML');
  const p = plainError(err, quiet);
  assert.equal(p.id, 'yaml');
  assert.equal(p.what, "I couldn't read one of BELLA's spec files.");
  assert.match(p.why, /isn't valid YAML/);
  assert.deepEqual(p.can, ['try-again', 'ask-agent', 'open-file']);
  assert.equal(p.file, 'specs/components/Button.spec.yaml');
  assert.ok(!/^yaml$/i.test(p.text) && !/bad indentation|mapping/.test(p.text), 'no raw exception text');
});
import { readFileSync } from 'node:fs';
const readText = (f) => readFileSync(f, 'utf8');

test('a file path in the error turns on Open the file', () => {
  const p = plainError(new Error('YAMLException: bad indentation in specs/components/Pin.spec.yaml at line 3'), quiet);
  assert.equal(p.file, 'specs/components/Pin.spec.yaml');
  assert.deepEqual(p.can, ['try-again', 'ask-agent', 'open-file']);
});
test('every kind has what, why and something to do; unknown text never leaks', () => {
  for (const m of ['fetch failed', 'no index', 'not signed in', 'timed out', 'ENOENT x/y.json', 'Unexpected token < in JSON', 'weird internal xyzzy']) {
    const p = plainError(new Error(m), quiet);
    assert.ok(p.what && p.why && p.text);
    assert.ok(!p.text.includes('xyzzy'));
  }
  assert.equal(plainError(new Error('weird'), quiet).id, 'unknown');
});
test('the raw error goes to the server log, never into the message', () => {
  const lines = [];
  const was = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  const p = plainError(new Error('YAMLException: secret detail'), { where: 'ask' });
  console.error = was;
  assert.match(lines.join('\n'), /secret detail/);
  assert.ok(!p.text.includes('secret detail'));
});
