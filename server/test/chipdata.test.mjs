// Ask BELLA answers from CHIP's measured data (Work panel, 23 Nov). Every source with a fixture, the
// router, the prompt and the guard on a model's numbers. No model runs and nothing is paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOURCES, classify, gather, pickWithModel, dataPrompt, shapeData, numbersHeld, plainReply, measured, NO_DATA, DATA_SYSTEM } from '../lib/chipdata.mjs';

const T = Date.parse('2026-11-23T16:49:00');
const fixture = (over = {}) => ({
  now: () => T,
  mtimeOf: () => T,
  guard: async () => ({ at: T, ok: true, output: '' }),
  baseline: () => ({ files: { 'app/src/A.jsx': { '<button>': 5, '<input>': 1 }, 'app/src/B.css': { 'css raw size': 3 } } }),
  bella: () => ({ components: [{ name: 'Button', category: 'Actions', hasStory: true, hasDocs: true, hasContract: true, hasA11yNotes: false, variants: ['primary'], props: ['a', 'b'], tokens: { count: 4 }, health: { contrast: { status: 'pass', failing: [] } } }, { name: 'Pin', hasStory: false, health: { contrast: { status: 'fail', failing: ['x'] } } }], gates: { contrastPairs: { ok: true, checked: 429, pairs: 105 } } }),
  partsUsed: () => ['Button', 'Card'],
  drift: () => ({ at: '2026-11-22T10:00:00Z', total: 93, compared: 43, drifting: 33, specBehind: 30, noSpec: 31, parts: [{ name: 'ListRow', differ: 14, specBehind: ['a'], noSpec: false }] }),
  gaps: () => ({ notInCode: ['Banner'], notInBella: ['Tooltip', 'Modal'] }),
  checks: () => ({ gate: { status: 'passed', ranAt: '2026-11-23T16:00:00Z', counts: { total: 5, passed: 5, failed: 0 }, members: [{ name: 'Colour contrast', status: 'passed' }] } }),
  audits: () => [{ title: 'CHIP app', ran: '2026-11-22', value: 60, unit: 'of 100', orders: ['Fix X'], prev: { value: 42, day: '2026-11-12' } }, { title: 'Agents', ran: null }],
  needs: async () => ({ items: [{ title: 'Push chip/parts-dev?', kind: 'Git', risk: 'High', status: 'Waiting on you' }], gate: { passed: 5, total: 5 } }),
  since: () => '2026-11-23T00:00:00',
  sinceLabel: () => 'midnight',
  commits: () => [{ repo: 'chip-whole', when: '16:10', subject: 'Side menu' }, { repo: 'bella-parts', when: '15:00', subject: 'Pin fix' }, { repo: 'chip-whole', when: '14:00', subject: 'Work board' }],
  sweep: () => ({ at: T, results: [{ page: 'health', what: 'Story row', shown: '91/93', truth: '91/93', ok: true }, { page: 'work', what: 'Cards', shown: '3', truth: '4', ok: false }] }),
  designedText: () => ({ at: T, text: '- **A** x. present\n- **B** y. partly\n- **C** z. waits on BELLA\n- **D** w. restored' }),
  ...over,
});

test('on system: the guard, the baseline totals and the parts used, read not typed', async () => {
  const r = await SOURCES.onSystem(fixture());
  assert.equal(r.facts.find((f) => f.label === 'On-system guard').ok, true);
  assert.equal(r.facts.find((f) => /baseline/.test(f.label)).value, '9 in 2 files');
  assert.equal(r.facts.find((f) => /parts the app uses/.test(f.label)).value, '2 of 2');
  assert.deepEqual(r.rows[0], { Construct: '<button>', Count: 5, Files: 1 });
});
test('on system: a failing guard says so', async () => {
  const r = await SOURCES.onSystem(fixture({ guard: async () => ({ at: T, ok: false, output: 'raw hex' }) }));
  assert.equal(r.facts[0].ok, false);
});
test('drift, gaps, health, audits, needs, contrast, sweep, designed, history, component each read their source', async () => {
  const c = fixture();
  assert.equal((await SOURCES.drift(c)).facts[0].value, '33 of 43 compared');
  assert.equal((await SOURCES.gaps(c)).facts[0].value, '1 part');
  assert.equal((await SOURCES.health(c)).facts[0].value, '5 of 5');
  const a = await SOURCES.audits(c);
  assert.match(a.facts[0].value, /60 of 100, ran 2026-11-22, was 42 on 2026-11-12/);
  assert.equal(a.facts.at(-1).label, 'Not run');
  assert.equal((await SOURCES.needs(c)).facts[0].value, '1');
  const k = await SOURCES.contrast(c);
  assert.equal(k.facts[1].value, '1');
  assert.deepEqual(k.rows, [{ Part: 'Pin', 'Failing pairs': 1 }]);
  const s = await SOURCES.sweep(c);
  assert.equal(s.facts[0].value, '1 of 2');
  assert.equal(s.rows[0].Measured, '4');
  const d = await SOURCES.designed(c);
  assert.equal(d.facts[0].value, '4');
  assert.equal(d.facts.find((f) => f.label === 'Partly').value, '1');
  const h = await SOURCES.history(c);
  assert.equal(h.facts[0].value, '3');
  assert.equal(h.facts.find((f) => f.label === 'chip-whole').value, '2 commits');
});
test('a source with nothing to read returns null, never an invented number', async () => {
  const none = fixture({ drift: () => null, gaps: () => null, checks: () => null, audits: () => [], needs: async () => null, sweep: () => null, designedText: () => null, baseline: () => null, partsUsed: () => null, guard: async () => null });
  for (const id of ['drift', 'gaps', 'health', 'audits', 'needs', 'sweep', 'designed', 'onSystem']) assert.equal(await SOURCES[id](none), null, id);
});

test('the router: her five questions each pick their source', () => {
  const pick = (q) => classify(q, ['Button']).ids;
  assert.deepEqual(pick('can you check that chip is using its components and on system please'), ['onSystem']);
  assert.deepEqual(pick('what is drifting?'), ['drift']);
  assert.ok(pick('what are the gaps').includes('gaps'));
  assert.ok(pick('what needs me').includes('needs'));
  assert.ok(pick('what changed today').includes('history'));
  assert.deepEqual(pick('is Button ok'), ['component']);
  assert.ok(pick('how is contrast').includes('contrast'));
  assert.deepEqual(pick('tell me a joke'), []);
});
test('the router runs only the reads that match, and the model may pick when keywords find nothing', async () => {
  let reads = 0;
  const c = fixture({ guard: async () => (reads++, { at: T, ok: true }) });
  const g = await gather('are we on system', c);
  assert.deepEqual(g.ids, ['onSystem']);
  assert.equal(reads, 1);
  const g2 = await gather('how are we doing overall', c, { pick: async () => 'health, audits' });
  assert.deepEqual(g2.ids, ['health', 'audits']);
  assert.deepEqual(await pickWithModel('x', async () => 'none'), []);
  assert.deepEqual(await pickWithModel('x', async () => { throw new Error('off'); }), []);
  assert.deepEqual((await gather('tell me a joke', c)).results, []);
});
test('a read that throws is reported, the others still answer', async () => {
  const g = await gather('on system and drift', fixture({ drift: () => { throw new Error('no'); } }));
  assert.deepEqual(g.results.map((r) => r.id), ['onSystem']);
  assert.deepEqual(g.failed, ['drift']);
});

test('the prompt holds only the data, with each source and when it was measured; the system prompt forbids guessing', async () => {
  const { results } = await gather('are we on system', fixture());
  const p = dataPrompt('are we on system', results);
  assert.match(p, /source: on-system guard/);
  assert.match(p, new RegExp(measured(T)));
  assert.match(DATA_SYSTEM, /I don't have data for that/);
  assert.match(DATA_SYSTEM, /never quote a document/i);
});
test('the reply carries numbered sources and structured rows, no raw markdown', async () => {
  const { results } = await gather('what changed today', fixture());
  const s = shapeData(results);
  assert.equal(s.sources[0].n, 1);
  assert.equal(s.data[0].measured, measured(T));
  assert.deepEqual(s.data[0].columns, ['Repo', 'When', 'Change']);
  assert.equal(s.data[0].rows.length, 3);
  assert.ok(!JSON.stringify(s).includes('```'));
});
test('a model reply with a number the data does not hold is replaced by the facts alone', async () => {
  const { results } = await gather('are we on system', fixture());
  assert.equal(numbersHeld('Guard is clean, 9 constructs in 2 files, measured 16:49.', results), true);
  assert.equal(numbersHeld('There are 700 constructs.', results), false);
  assert.match(plainReply(results), /^On system: on-system guard clean/);
  assert.equal(NO_DATA, "I don't have data for that.");
});

test('the real readers: a baseline file and imports counted from disk', async () => {
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  const d = defaultCtx();
  assert.ok(Object.keys(d.baseline().files).length > 0);
  assert.ok(d.partsUsed().length > 0);
  assert.ok(d.bella().components.length > 0);
  const dir = mkdtempSync(join(tmpdir(), 'chipdata-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'x'), '');
});

/* ---- how it was built, gaps and how to improve (22 Nov) ---- */
const built = () => ({
  repos: [{ name: 'CHIP', count: 10, coAuthored: 9, first: { date: '2026-04-26', subject: 'CHIP v0' }, last: { date: '2026-11-22', subject: 'Work panel' } }, { name: 'BELLA', count: 5, coAuthored: 1, first: { date: '2026-04-19', subject: 'AAA gap closure' }, last: { date: '2026-11-21', subject: 'Pin' } }],
  rules: [{ file: 'CHIP CLAUDE.md', kind: 'dated rules', count: 8, latest: { title: 'Before building', date: '2026-11-12' }, recent: [{ title: 'Before building', date: '2026-11-12' }] }],
  docs: [{ name: 'handoff.md', at: '2026-11-22T18:50:00Z', what: 'done, next, blockers' }],
});
test('how it was built: order, who, rules and where it is documented, from the record only', async () => {
  const r = await SOURCES.built(fixture({ builtInfo: built }));
  assert.match(r.facts.find((f) => f.label === 'Order made: CHIP').value, /first commit 2026-04-26.*10 commits/);
  assert.equal(r.facts.find((f) => f.label === 'Who made it').value, "10 of 15 commits carry a Claude co-author line: an agent built it from Elleta's rules");
  assert.match(r.facts.find((f) => /CHIP CLAUDE\.md/.test(f.label)).value, /8 dated rules, latest "Before building" \(2026-11-12\)/);
  assert.ok(r.rows.some((x) => x.Block === 'Documented' && x.Source === 'handoff.md'));
  assert.equal(await SOURCES.built(fixture({ builtInfo: () => null })), null);
});
test('gaps and how to improve: a short ranked list from the report, audits, drift, gaps, features and board', async () => {
  const r = await SOURCES.improve(fixture({ onSystemReport: () => ({ red: ['Old app holds the debt'] }), board: () => ({ waiting: 10, todo: 6 }) }));
  assert.equal(r.facts[0].value, 'Old app holds the debt (on-system report (Red))');
  assert.ok(r.facts.length <= 6);
  assert.ok(r.rows.some((x) => /drift from Figma/.test(x.Item)));
  assert.ok(r.rows.some((x) => /10 board items wait on Elleta, 6 still to do/.test(x.Item)));
  assert.equal(await SOURCES.improve(fixture({ onSystemReport: () => null, audits: () => [], drift: () => null, gaps: () => null, designedText: () => null, board: () => null })), null);
});
test('the router sends the two overview questions to their own source', () => {
  assert.deepEqual(classify('how did elleta build this').ids, ['built']);
  assert.deepEqual(classify('how did Elleta build this?').ids, ['built']);
  assert.deepEqual(classify("i want to know where the gaps are and how we can improve").ids, ['improve']);
  assert.deepEqual(classify('who built the Button?', ['Button']).ids, ['built']);
});
test('dated headings read the rule title and its date', async () => {
  const { datedHeadings } = await import('../lib/chipdata.mjs');
  assert.deepEqual(datedHeadings('## Before writing any UI (Elleta, 9 Nov 2026)\n## Plain heading\n### Show me first (Elleta, 11 Nov 2026: "x")'), [{ title: 'Before writing any UI', date: '2026-11-09' }, { title: 'Show me first', date: '2026-11-11' }]);
});
