// Drift read from BELLA's specs, no Figma key: a token name with the same Chip value is not drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.BELLA_DIR ??= `${process.env.HOME}/DEV/bella-parts`;
const { mismatchOf } = await import('../lib/drift.mjs');

const spec = `name: Button
figma:
  nodeId: '26:320'
mismatch:
  - field: props.type
    code:
      - button
    figma: no such variant property
  - field: tokens.Copy.fontSize
    code:
      - '--x'
    figma: typography/font-size/tag
    sameValueInChip: true
notApplicable: []
`;

test('a spec read from Figma lists its differences, same-value token names apart', () => {
  const m = mismatchOf(spec);
  assert.equal(m.compared, true);
  assert.deepEqual(m.fields, [{ field: 'props.type', sameValue: false }, { field: 'tokens.Copy.fontSize', sameValue: true }]);
});

test('a spec with no Figma read is not compared, and an empty list is no drift', () => {
  const m = mismatchOf('name: Kbd\nmismatch: []\n');
  assert.equal(m.compared, false);
  assert.deepEqual(m.fields, []);
});

test('gaps: specs with no code part, and AGENTS.md "Not in BELLA yet"', async () => {
  const { readGaps } = await import('../lib/drift.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const b = mkdtempSync(join(tmpdir(), 'bella-gaps-'));
  mkdirSync(join(b, 'specs/components'), { recursive: true });
  mkdirSync(join(b, 'src/components/BoardLane'), { recursive: true });
  for (const n of ['BoardLane', 'BoardLaneDropSpace', 'Gauge']) writeFileSync(join(b, `specs/components/${n}.spec.yaml`), `name: ${n}\n`);
  writeFileSync(join(b, 'src/components/BoardLane/BoardLane.tsx'), 'export function BoardLaneDropSpace() {}\nexport default function BoardLane() {}\n');
  writeFileSync(join(b, 'AGENTS.md'), '- Not in BELLA yet, ask, don\'t build: Switch/toggle, Checkbox, Dialog/Modal. Stopping is intended.\n');
  const g = readGaps(b);
  rmSync(b, { recursive: true, force: true });
  assert.deepEqual(g.notInCode, ['Gauge']);
  assert.deepEqual(g.notInBella, ['Switch/toggle', 'Checkbox', 'Dialog/Modal']);
});
