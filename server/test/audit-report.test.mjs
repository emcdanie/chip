// The Health audit drawer reads each saved report into a reading view (CHIP rule 23 Nov): lights, scores,
// work orders and one line of meaning come from the report's text; no markdown reaches the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greenFrom, parseReport, plain } from '../../app/src/pages/auditReport.js';

const DS = `# Design system inspection: BELLA · 22 Nov 2026

## Short version

BELLA's code is in good shape: 88 parts. Paperwork lags.

| # | Station | Quality | Light | Score |
|--:|:--|:--|:--:|--:|
| 1 | Coverage | Complete | Yellow | 6/10 |
| 3 | Accessibility | Sound | Green | 8/10 |
| 6 | Orchestration | Sync | Red | 4/10 |
|   | **Overall** | | | **62/100** |

### Station 6 · Orchestration: RED (4/10)
- Findings:
- [verified] **Two** configs on \`bella-chip-theme\`.

## Part 3 · Work order

### Fix now (red)

**1. One BELLA, one place**
- Station 6 · [verified] 2 configs differ.
- First move: set all launch configs to bella-parts.
- Effort: S

**2. Specs rebuilt** · Station 9 · [verified] 6 of 8 miss props. First move: rebuild them. Done when: checked. Effort: M.
`;

test('a station sheet and its work orders are read, with the light as a word', () => {
  const r = parseReport(DS);
  assert.equal(r.title, 'Design system inspection: BELLA');
  assert.equal(r.date, '22 Nov 2026');
  assert.equal(r.meaning, "BELLA's code is in good shape: 88 parts.");
  assert.deepEqual(r.stations.map((s) => [s.n, s.light, s.score]), [[1, 'yellow', 6], [3, 'green', 8], [6, 'red', 4]]);
  assert.deepEqual(r.stations[2].evidence, ['Two configs on bella-chip-theme.']);
  assert.equal(r.orders.length, 2);
  assert.equal(r.orders[0].move, 'set all launch configs to bella-parts.');
  assert.equal(r.orders[1].move, 'rebuild them.');
  assert.equal(greenFrom([{ light: 'green', score: 8, max: 10 }, { light: 'yellow', score: 7, max: 10 }]), 8);
  assert.equal(greenFrom([{ light: 'green', score: 8, max: 10 }]), null);
});

test('no markdown reaches the screen', () => {
  assert.equal(plain('**Bold** `code` [link](http://x) | cell _it_'), 'Bold code link · cell it');
});

test('a table work order and a Figma score list are read', () => {
  const t = parseReport('# T\n\n## Work order\n\n| # | Do | What I saw | First move |\n|--|--|--|--|\n| 1 | Fix the chart | 3 bars | Rebuild it |\n');
  assert.deepEqual(t.orders.map((o) => [o.title, o.why, o.move]), [['Fix the chart', '3 bars', 'Rebuild it']]);
  const f = parseReport('# F\n\n## Flow 2 · Health\n\n### Screen 1 · A · 1:2 · score 40\n### Screen 2 · B · 1:3 · score 60\n');
  assert.deepEqual([f.stations[0].name, f.stations[0].score, f.stations[0].max, f.stations[0].light], ['Health', 50, 100, null]);
});
