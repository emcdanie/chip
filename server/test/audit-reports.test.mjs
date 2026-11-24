// The full audit report reads every figure from saved files: benchmark runs (results.json, rubric.config.ts),
// SUMMARY.md and the audit folders. A fixture with two runs proves the means, the share of the gap, the stopped
// jobs, the 8-job score, and that an older run's report is served by its day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'chip-auditreports-'));
const odsb = join(root, 'odsb');
const audit = join(root, 'audit');
const checks = join(root, 'checks');
process.env.CHIP_ODSB_DIR = odsb;
process.env.CHIP_AUDIT_DIR = audit;
process.env.CHIP_CHECKS_DIR = checks;
process.env.CHIP_BENCH_SUMMARY = join(root, 'SUMMARY.md');
const { readAuditReports } = await import('../lib/audit-reports.mjs');
const { readAuditReport } = await import('../lib/audits.mjs');

const dims = (o) => ({ imports: 100, apiFidelity: 100, tokenDiscipline: 100, a11yStatic: 100, compile: 100, judgment: 100, ...o });
const agg = (context, taskId, meanOverall, d) => ({ context, taskId, meanOverall, meanDimensions: dims(d), worstGate: 'pass' });
function run(id, startedAt, aggregates) {
  mkdirSync(join(odsb, 'runs', id), { recursive: true });
  writeFileSync(join(odsb, 'runs', id, 'results.json'), JSON.stringify({ manifest: { startedAt, profile: 'medium', totalCostUsd: 1.234, wallClockMs: 61000 }, aggregates, records: [] }));
}
mkdirSync(odsb, { recursive: true });
writeFileSync(join(odsb, 'rubric.config.ts'), 'export const rubric = { weights: { imports: 0.1, apiFidelity: 0.25, tokenDiscipline: 0.15, a11yStatic: 0.1, compile: 0.1, judgment: 0.3 }, gates: {} }');
run('20261008-aaa-baseline', '2026-10-08T10:00:00Z', [agg('bare', 'a', 90), agg('agents-md', 'a', 80), agg('bare', 'b', 80), agg('agents-md', 'b', 70)]);
run('20261112-bbb-nov12', '2026-11-12T10:00:00Z', [agg('bare', 'a', 90), agg('agents-md', 'a', 45, { apiFidelity: 0, judgment: 0 }), agg('bare', 'b', 80), agg('agents-md', 'b', 90)]);

test('the newest run: means, the stopped job, the 8-job score, and each check\'s share of the gap', () => {
  const r = readAuditReports();
  assert.equal(r.ok, true);
  assert.deepEqual(r.bench.all10, { bare: 85, md: 67.5 });
  assert.equal(r.bench.stopped, 1);
  assert.deepEqual(r.bench.eight, { bare: 80, md: 90, n: 1 });
  assert.ok(r.bench.adherence.n >= r.bench.adherence.pass); // agent adherence: AGENTS.md jobs that pass the gate
  assert.deepEqual(r.bench.series.md, [['2026-10-08', 75], ['2026-11-12', 67.5]]);
  const real = r.bench.checks.find((c) => c.id === 'apiFidelity');
  assert.equal(real.share, -12.5); // 0.25 x (50 - 100)
  assert.equal(r.bench.jobs[0].tag, 'stopped and asked'); // most behind first
  assert.equal(r.bench.how.cost, 1.23);
});

test('an audit\'s older run is read by its day, and a bad day is refused', () => {
  mkdirSync(join(audit, '2026-11-12'), { recursive: true });
  mkdirSync(join(audit, '2026-11-22'), { recursive: true });
  writeFileSync(join(audit, '2026-11-12/ds-inspection.md'), '**Overall: 40/100**');
  writeFileSync(join(audit, '2026-11-22/ds-inspection.md'), '**Overall: 62/100**');
  assert.match(readAuditReport('ds', '2026-11-12'), /40\/100/);
  assert.match(readAuditReport('ds'), /62\/100/);
  assert.equal(readAuditReport('ds', '../etc'), readAuditReport('ds'));
  assert.equal(readAuditReport('nope', '2026-11-12'), null);
  const a = readAuditReports().audits.find((x) => x.id === 'ds');
  assert.deepEqual(a.runs.map((x) => [x.day, x.value]), [['2026-11-12', 40], ['2026-11-22', 62]]);
});

test('no benchmark run says so, with no number', () => {
  process.env.CHIP_ODSB_DIR = join(root, 'none');
  return import('../lib/audit-reports.mjs').then((m) => {
    const r = m.readAuditReports();
    assert.equal(r.ok, false);
    assert.match(r.why, /rubric|run/);
  });
});

test('cost per shippable output: recorded cost over the runs whose gate passed; none passed is not a number', async () => {
  const { costOf } = await import('../lib/audit-reports.mjs');
  const c = costOf([
    { status: 'kept', cost: 1, startedAt: '2026-11-22T10:00:00Z' },
    { status: 'closed', closedFrom: 'passed', cost: 0.5, startedAt: '2026-11-21T10:00:00Z' },
    { status: 'failed', cost: 0.5, startedAt: '2026-11-20T10:00:00Z' },
    { status: 'failed', cost: null },
  ]);
  assert.deepEqual(c, { runs: 4, costed: 3, shipped: 2, total: 2, per: 1, since: '2026-11-20' });
  assert.equal(costOf([{ status: 'failed', cost: 1 }]).per, null);
  assert.equal(costOf([]), null);
});

