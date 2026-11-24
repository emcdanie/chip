// Audits read from their saved reports: score, lights, three work orders, and "not run" when nothing is saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'chip-audits-'));
process.env.CHIP_AUDIT_DIR = dir;
const { readAudits, readReport, readAuditReport } = await import('../lib/audits.mjs');

const ds = `# x\n**Overall: 62/100.** Starter.\n### Station 1 · A: YELLOW (6/10)\n### Station 2 · B: RED (4/10)\n### Station 3 · C: GREEN (8/10)\n## Work order\n**1. One BELLA, one place.** text\n**2. Rebuild specs.** text\n**3. Point agents.** text\n**4. Fourth.** text\n`;
const tokens = `# t\n### Check 1: Ladder: GREEN\n### Check 2: Refs: YELLOW\n## Work order\n\n| Priority | Item | Check |\n|:--|:--|:--|\n| 1, now | Export is behind | 9 |\n| 2, later | Wash pairs | 4 |\n`;

test('a report gives its score, lights and first three work orders', () => {
  const r = readReport('ds', ds);
  assert.deepEqual([r.value, r.unit, r.red, r.yellow, r.green], [62, 'of 100', 1, 1, 1]);
  assert.deepEqual(r.orders, ['One BELLA, one place', 'Rebuild specs', 'Point agents']);
});
test('a report with no overall score counts its green checks; table rows are work orders', () => {
  const r = readReport('tokens', tokens);
  assert.deepEqual([r.value, r.unit], [1, 'of 2 checks healthy']);
  assert.deepEqual(r.orders, ['Export is behind', 'Wash pairs']);
});
test('latest report per kind, its trend, and "not run" for an audit with no saved report', () => {
  mkdirSync(join(dir, '2026-11-20'));
  mkdirSync(join(dir, '2026-11-22'));
  writeFileSync(join(dir, '2026-11-20/ds-inspection.md'), ds.replace('62/100', '50/100'));
  writeFileSync(join(dir, '2026-11-22/ds-inspection.md'), ds);
  const all = readAudits();
  const d = all.find((a) => a.id === 'ds');
  assert.equal(d.ran, '2026-11-22');
  assert.deepEqual(d.prev, { value: 50, day: '2026-11-20' });
  assert.equal(all.find((a) => a.id === 'a11y').ran, null);
  assert.match(readAuditReport('ds'), /Overall: 62/);
  assert.equal(readAuditReport('agents'), null);
});
