// Processes step panel: read only, behind the origin guard, and only files the table names are ever opened.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { appOrigins, onlyChip } from '../lib/origin.mjs';
import { stepRoutes, stepFacts, skillFacts, scriptFacts } from '../lib/step-facts.mjs';

const app = express();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const origins = appOrigins(port);
app.use(onlyChip(origins));
app.use(stepRoutes({ origins }));
after(() => server.close());
const get = (path, origin) => fetch(`http://127.0.0.1:${port}${path}`, { headers: origin ? { origin } : {} });
const own = `http://localhost:${port}`;

test('a foreign site is refused on both routes', async () => {
  assert.equal((await get('/step-facts?map=audits&step=dsinsp', 'https://evil.example')).status, 403);
  assert.equal((await get('/step-file?id=skill:ds-inspection', 'https://evil.example')).status, 403);
});

test('a path or a skill not in the table is never read', async () => {
  for (const id of ['../../etc/passwd', 'script:chip:../../.env', 'skill:../../secrets', 'script:/etc/hosts', 'skill:vibe-killer']) {
    assert.equal((await get(`/step-file?id=${encodeURIComponent(id)}`, own)).status, 404, id);
  }
});

test('a step with nothing behind it says so, and a known one answers', { skip: process.env.CI && 'reads the CHIP checkout in her home folder' }, async () => {
  assert.ok(stepFacts('pipeline', 'gate').gaps.some((g) => /No skill or script/.test(g)));
  const r = await get('/step-file?id=script:chip:scripts/data-sweep.mjs', own);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).sections[0].blocks[0].t, 'code');
});

test('a skill gives its description and headings; a script its header and what it fails on', () => {
  const s = skillFacts('---\nname: x\ndescription: Does a thing well. Use when asked.\n---\n# X\n## Rules\n## Files\n');
  assert.equal(s.bullets[0], 'Does a thing well.');
  assert.ok(s.bullets.includes('Covers: Rules'));
  const c = scriptFacts('// Checks cards at 320.\n// Exits 1 when a card is clipped.\nimport x from "y";\n');
  assert.ok(c.bullets.some((b) => /clipped/.test(b)));
});
