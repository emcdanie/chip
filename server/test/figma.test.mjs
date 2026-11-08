// Figma check: the guard lets only CHIP's own scripts through, on CHIP's own
// file keys; the comparisons say what differs. Run: node --test server/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIGMA_FILE_KEY = 'COMPKEY';
process.env.FIGMA_FOUNDATIONS_KEY = 'FOUNDKEY';
const { isFixedRead, FIXED_SCRIPTS } = await import('../host/fixed-reads.js');
const { guard } = await import('../host/guard.js');
const { compareComponents, compareVariables } = await import('../lib/figma-snapshot.mjs');

const cfg = { name: 'figma-console', allow: ['read', 'write'], allowWrite: [] };
const exec = { name: 'figma_execute', kind: 'write' };

test('a fixed script on its own file runs without a Confirm', async () => {
  const g = await guard({ serverCfg: cfg, tool: exec, args: { code: FIXED_SCRIPTS.components, fileKey: 'COMPKEY', timeout: 30000 } });
  assert.deepEqual(g, { run: true });
});

test('any other file key is refused as a fixed read', () => {
  assert.equal(isFixedRead('figma-console', 'figma_execute', { code: FIXED_SCRIPTS.components, fileKey: 'CLIENTFILE' }), false);
  // each script belongs to its own file: the variables script on the components file is not a fixed read
  assert.equal(isFixedRead('figma-console', 'figma_execute', { code: FIXED_SCRIPTS.variables, fileKey: 'COMPKEY' }), false);
});

test('no file key means the active file: refused', () => {
  assert.equal(isFixedRead('figma-console', 'figma_execute', { code: FIXED_SCRIPTS.components }), false);
});

test('any other code goes through Confirm (never runs straight away)', async () => {
  const g = await guard({ serverCfg: cfg, tool: exec, args: { code: 'figma.currentPage.children[0].remove()', fileKey: 'COMPKEY' } });
  assert.equal(g.run, undefined);
  assert.ok(g.refused || g.pending);
});

test('a fixed script with an extra argument is not a fixed read', () => {
  assert.equal(isFixedRead('figma-console', 'figma_execute', { code: FIXED_SCRIPTS.components, fileKey: 'COMPKEY', lock: true }), false);
  assert.equal(isFixedRead('figma-console', 'figma_execute', { code: FIXED_SCRIPTS.components, fileKey: 'COMPKEY', timeout: 999999 }), false);
});

test('only figma-console and figma_execute', () => {
  assert.equal(isFixedRead('figma', 'figma_execute', { code: FIXED_SCRIPTS.components, fileKey: 'COMPKEY' }), false);
  assert.equal(isFixedRead('figma-console', 'figma_navigate', { code: FIXED_SCRIPTS.components, fileKey: 'COMPKEY' }), false);
});

test('components: set name, then variant values against the contract', () => {
  const code = [
    { name: 'Button', variants: ['primary', 'secondary'], shapes: ['default', 'pill'], states: ['default', 'hover'] },
    { name: 'Slider', variants: [], states: [] },
    { name: 'Columns', variants: [] },
  ];
  const figma = { comps: [
    { name: 'Button', type: 'COMPONENT_SET', id: '1:1', page: 'Button', variants: ['variant=primary, shape=default, state=default', 'variant=primary, shape=pill, state=hover', 'variant=tertiary, shape=default, state=default'] },
    { name: 'Grid', type: 'COMPONENT_SET', id: '2:2', page: 'Layout', variants: [] },
    { name: 'HelperText', type: 'COMPONENT_SET', id: '3:3', page: 'Inputs', variants: [] },
  ] };
  const r = compareComponents(code, figma);
  assert.equal(r.matched, 1);
  const b = r.rows.find((x) => x.name === 'Button');
  assert.deepEqual(b.diffs, [{ axis: 'variant', codeOnly: ['secondary'], figmaOnly: ['tertiary'] }]);
  assert.equal(r.inStep, 0);
  assert.equal(r.rows.find((x) => x.name === 'Columns').maybe, 'Grid');
  assert.deepEqual(r.figmaOnly, ['Grid', 'HelperText']);
});

test('variables: names, figma-only, and names used twice', () => {
  const r = compareVariables(['surface', 'border', 'surface-glass'], { collections: [{ name: '2. Semantic', modes: ['Light', 'Dark'], names: ['color/semantic/surface', 'color/semantic/border', 'color/x/surface', 'color/semantic/accent-ink'] }] });
  assert.equal(r.matched, 2);
  assert.deepEqual(r.codeOnly, ['surface-glass']);
  assert.deepEqual(r.figmaOnly, ['accent-ink']);
  assert.deepEqual(r.twice, ['surface']);
});

test('a lone component and a missing axis are not in step', () => {
  const code = [
    { name: 'ChatThread', variants: [], states: ['default', 'hover'] },
    { name: 'Card', variants: ['default', 'peek'], states: ['default', 'hover', 'focus'] },
    { name: 'Kbd', variants: [], states: ['default'] },
  ];
  const figma = { comps: [
    { name: 'ChatThread', type: 'COMPONENT', id: '1:1', page: 'Chat', variants: [] },
    { name: 'Card', type: 'COMPONENT_SET', id: '2:2', page: 'Layout', variants: ['variant=default', 'variant=peek'] },
    { name: 'Kbd', type: 'COMPONENT_SET', id: '3:3', page: 'Data', variants: ['caps=1'] },
  ] };
  const r = compareComponents(code, figma);
  const by = (n) => r.rows.find((x) => x.name === n);
  assert.ok(by('ChatThread').diffs.length > 0);
  assert.deepEqual(by('Card').diffs, [{ axis: 'state', codeOnly: ['default', 'hover', 'focus'], figmaOnly: [], note: 'Figma has no state property' }]);
  assert.deepEqual(by('Kbd').diffs, []); // a lone "default" state needs no axis
  assert.equal(r.inStep, 1);
});

test('no semantic collection is an error, not a pass', () => {
  const r = compareVariables(['surface'], { collections: [{ name: '1. Primitive', modes: ['Value'], names: ['color/cool/0'] }] });
  assert.ok(r.error);
});

test('an axis named by the prop (Heading tier) matches the contract\'s variants', () => {
  const r = compareComponents([{ name: 'Heading', variants: ['hero', 'page', 'section'], states: ['default'] }], { comps: [{ name: 'Heading', type: 'COMPONENT_SET', id: '1:1', page: 'Layout', variants: ['tier=hero, accent=off', 'tier=page, accent=off', 'tier=section, accent=on'] }] });
  assert.deepEqual(r.rows[0].diffs, []);
});
