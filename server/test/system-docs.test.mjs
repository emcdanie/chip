// System > Docs: read only, from the allow-listed folders of two checkouts. A foreign site is refused, a typed path never
// reaches the disk, and a doc that matches the private-term list is never listed or served (the term is not in this file's source:
// the fixture writes its own term list).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appOrigins, onlyChip } from '../lib/origin.mjs';
import { createSystemDocs, mountSystemDocs, structure, readTerms } from '../lib/system-docs.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'sysdocs-'));
const theme = join(tmp, 'theme');
const chip = join(tmp, 'chip');
const parts = join(tmp, 'parts');
for (const d of ['docs/decisions', 'docs/agents/rules', 'specs/components']) mkdirSync(join(theme, d), { recursive: true });
mkdirSync(join(chip, 'docs/plans'), { recursive: true });
mkdirSync(join(parts, 'tokens'), { recursive: true });
writeFileSync(join(tmp, 'secret.md'), '# Outside\n\nNot in any allowed folder, so never served.\n');
writeFileSync(join(theme, 'docs/principles.md'), '# Principles\n\nBELLA says less is more, always.\n\n## Rules\n\n| Rule | Why |\n| --- | --- |\n| One primary | Focus |\n\n```js\nconst a = 1;\n```\n');
writeFileSync(join(theme, 'docs/decisions/2026-11-01-a.md'), '# Older\n\nAn older decision about corners.\n');
writeFileSync(join(theme, 'docs/decisions/2026-11-20-b.md'), '# Newer\n\nA newer decision about ink.\n');
writeFileSync(join(theme, 'docs/decisions/2026-11-21-c.md'), '# Leaky\n\nThis one names zorblax, a private thing.\n');
writeFileSync(join(chip, 'docs/plans/p.md'), '# A plan\n\nWhat we do next in CHIP.\n');
writeFileSync(join(parts, 'tokens/contracts.json'), JSON.stringify({ component: {} }));
const terms = join(tmp, 'terms.txt');
writeFileSync(terms, '# private\nzorblax\n');

const docs = createSystemDocs({ roots: { theme, chip, parts }, termsFile: terms });
const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
app.use(onlyChip(appOrigins(port)));
mountSystemDocs(app, docs);
after(() => server.close());
const get = (path, origin) => fetch(`http://127.0.0.1:${port}${path}`, { headers: origin ? { origin } : {} });

test('a foreign site is refused on every route', async () => {
  for (const p of ['/system-docs', '/system-docs/doc?id=theme/docs/principles.md', '/system-docs/contract/Button']) {
    assert.equal((await get(p, 'https://evil.example')).status, 403, p);
  }
});

test('lists by kind, decisions newest first, with a title, a first line and a size', async () => {
  const { docs: list } = await (await get('/system-docs', `http://localhost:${port}`)).json();
  const dec = list.filter((d) => d.kind === 'Decisions').map((d) => d.title);
  assert.deepEqual(dec, ['Newer', 'Older']);
  const p = list.find((d) => d.title === 'Principles');
  assert.match(p.line, /less is more/);
  assert.ok(p.bytes > 20 && p.updated);
  assert.ok(list.some((d) => d.kind === 'CHIP' && d.title === 'A plan'));
});

test('a doc with a private term is neither listed nor served', async () => {
  const { docs: list } = await (await get('/system-docs')).json();
  assert.ok(!list.some((d) => d.title === 'Leaky'));
  assert.equal((await get('/system-docs/doc?id=theme/docs/decisions/2026-11-21-c.md')).status, 404);
});

test('a typed path never reaches the disk', async () => {
  for (const id of ['theme/../secret.md', '../secret.md', '/etc/passwd', 'theme/docs/../../secret.md', 'chip/docs/plans/../../../secret.md', 'theme/docs/principles.md\0']) {
    assert.equal((await get(`/system-docs/doc?id=${encodeURIComponent(id)}`)).status, 404, id);
  }
  assert.equal((await get('/system-docs/contract/..%2F..%2Fsecret')).status, 404);
});

test('a listed doc comes back as sections, rows for tables and a code block, never raw markdown', async () => {
  const d = await (await get('/system-docs/doc?id=theme/docs/principles.md')).json();
  const rules = d.sections.find((s) => s.title === 'Rules');
  assert.equal(rules.blocks.find((b) => b.t === 'table').rows[0][0], 'One primary');
  assert.equal(rules.blocks.find((b) => b.t === 'code').lang, 'js');
  assert.ok(!JSON.stringify(d).includes('| ---'));
});

test('structure and readTerms', () => {
  assert.equal(structure('# T\n\n- a\n- **b**\n').sections[0].blocks[0].items[1], 'b');
  assert.equal(readTerms(terms).length, 1);
  assert.deepEqual(readTerms(join(tmp, 'missing')), []);
});
