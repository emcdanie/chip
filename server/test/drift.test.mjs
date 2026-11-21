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
