// The model router: Auto picks by the question, says why, never starts a cloud model by itself (22 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeModel, menuOf, kindOf } from '../lib/model-router.mjs';
import { askStream } from '../lib/ask.mjs';
import { providers } from '../providers/index.mjs';

const models = [
  { id: 'local:qwen3:8b', label: 'qwen3:8b', group: 'On this machine', place: 'local', available: true, isDefault: true },
  { id: 'local:qwen3.8:27b', label: 'qwen3.8:27b', group: 'On this machine', place: 'local', available: true },
  { id: 'claude:haiku', label: 'Claude Haiku 5.5', group: 'Cloud', place: 'cloud', available: true, note: 'quick · uses your plan', hint: 'quick' },
  { id: 'claude:sonnet', label: 'Claude Sonnet 5.5', group: 'Cloud', place: 'cloud', available: true, note: 'balanced · uses your plan', hint: 'balanced' },
  { id: 'jev', label: 'Jev', group: 'Cloud', place: 'cloud', available: false, kind: 'decider', note: 'not connected yet' },
];
const budget = { used: 3, limit: 20 };

test('questions are classified: lookup, short fact, explanation, review', () => {
  assert.equal(kindOf('what changed today', { data: true }), 'lookup');
  assert.equal(kindOf('is Button ok'), 'short');
  assert.equal(kindOf('how did elleta build this'), 'explain');
  assert.equal(kindOf('review the code in Button'), 'review');
});
test('a data lookup goes to the quick local model and says why, free', () => {
  const r = routeModel('what changed today', { models, budget, data: true });
  assert.equal(r.id, 'local:qwen3:8b');
  assert.equal(r.why, "Auto: local 8b because it is a lookup in CHIP's data, free");
  assert.equal(r.confirm, false);
});
test('an explanation goes to the deeper local model', () => {
  const r = routeModel('explain why contrast pairs matter', { models, budget });
  assert.equal(r.id, 'local:qwen3.8:27b');
  assert.equal(r.why, 'Auto: local 8:27b because it is an explanation, free'.replace('8:27b', '27b'));
});
test('without the deeper model an explanation says so and stays local', () => {
  const r = routeModel('explain why', { models: models.filter((m) => m.id !== 'local:qwen3.8:27b'), budget });
  assert.equal(r.id, 'local:qwen3:8b');
  assert.match(r.why, /deeper model is not installed/);
});
test('a review or code question picks Claude Sonnet but waits for her click, with the budget', () => {
  const r = routeModel('review the code in Button', { models, budget });
  assert.equal(r.id, 'claude:sonnet');
  assert.equal(r.confirm, true);
  assert.match(r.why, /uses your plan, 3 of 20 today/);
});
test('Claude spent for today or not available: stays local and says why', () => {
  const spent = routeModel('review the code', { models, budget: { used: 20, limit: 20 } });
  assert.equal(spent.confirm, false);
  assert.match(spent.why, /used up for today \(20 of 20\)/);
  const off = routeModel('review the code', { models: models.map((m) => (m.place === 'cloud' ? { ...m, available: false } : m)), budget });
  assert.match(off.why, /Claude is not available/);
});
test('no model at all says nothing was sent anywhere', () => {
  assert.equal(routeModel('hi', { models: [], budget }).id, null);
});
test('the menu: groups in order, cost notes, unavailable said in words', () => {
  const m = menuOf(models, budget);
  assert.equal(m.auto.note, 'picks by the question · Claude 3 of 20 today');
  assert.deepEqual(m.models.map((x) => x.group), ['On this machine', 'On this machine', 'Cloud', 'Cloud', 'Cloud']);
  assert.equal(m.models[0].note, 'quick · free · stays on this Mac');
  assert.equal(m.models.find((x) => x.id === 'local:qwen3.8:27b').note, 'deeper · free · stays on this Mac');
  assert.equal(m.models.find((x) => x.id === 'jev').note, 'not available: not connected yet');
  assert.equal(m.models.find((x) => x.id === 'jev').label, 'Jev decider');
});

test('askStream: Auto on a review question runs no model and asks for a click', async () => {
  let ran = 0;
  const was = providers.claude.ask;
  providers.claude.ask = async function* () { ran++; yield 'x'; };
  const events = [];
  for await (const e of askStream('review the code in Button', 's1', undefined, { models, budget, scope: 'x' })) events.push(e);
  providers.claude.ask = was;
  assert.equal(ran, 0);
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.needsConfirm.provider, 'claude:sonnet');
  assert.match(done.route.why, /^Auto: Claude Sonnet 5\.5/);
});
test('the answer paths agree: no token is streamed before the checked reply, the data path included', async () => {
  const wasAsk = providers.local.ask;
  const wasList = providers.local.list;
  providers.local.ask = async function* () { yield 'On system is clean. 9999 files.'; };
  providers.local.list = async () => models.filter((m) => m.place === 'local');
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  const ctx = { ...defaultCtx(), guard: async () => ({ at: Date.now(), ok: true }), baseline: () => ({ files: { a: { x: 1 } } }), partsUsed: () => ['Button'], bella: () => ({ components: [{ name: 'Button' }] }) };
  const events = [];
  for await (const e of askStream('are we on system', 's2', undefined, { scope: 'data', models, budget, ctx })) events.push(e);
  providers.local.ask = wasAsk;
  providers.local.list = wasList;
  const toks = events.filter((e) => e.type === 'token');
  const done = events.find((e) => e.type === 'done');
  assert.equal(toks.map((t) => t.text).join(''), done.reply, 'the one token is the checked reply');
  assert.ok(!/9999/.test(done.reply), 'a number the data does not hold never reaches the page');
  assert.match(done.route.why, /^Auto: local 8b because it is a lookup/);
  assert.equal(done.model, 'qwen3:8b');
});
test('a picked model is used as picked and one line says so', async () => {
  const events = [];
  const wasAsk = providers.local.ask;
  providers.local.ask = async function* () { yield 'Clean.'; };
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  const ctx = { ...defaultCtx(), guard: async () => ({ at: Date.now(), ok: true }), baseline: () => null, partsUsed: () => ['Button'], bella: () => ({ components: [{ name: 'Button' }] }) };
  for await (const e of askStream('are we on system', 's3', undefined, { scope: 'data', provider: 'local:qwen3.8:27b', models, budget, ctx })) events.push(e);
  providers.local.ask = wasAsk;
  assert.equal(events.find((e) => e.type === 'done').route.why, 'You picked qwen3.8:27b');
});

test('"how did elleta build this" answers from the record: three blocks, no model, same text everywhere', async () => {
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  let ran = 0;
  const wasAsk = providers.local.ask;
  providers.local.ask = async function* () { ran++; yield 'x'; };
  const builtInfo = () => ({ repos: [{ name: 'CHIP', count: 10, coAuthored: 9, first: { date: '2026-04-26', subject: 'CHIP v0' }, last: { date: '2026-11-22', subject: 'Work' } }], rules: [{ file: 'CHIP CLAUDE.md', kind: 'dated rules', count: 8, latest: { title: 'x', date: '2026-11-12' }, recent: [] }], docs: [{ name: 'handoff.md', at: '2026-11-22T10:00:00Z', what: 'w' }] });
  const events = [];
  for await (const e of askStream('how did elleta build this', 's4', undefined, { models, budget, ctx: { ...defaultCtx(), builtInfo } })) events.push(e);
  providers.local.ask = wasAsk;
  assert.equal(ran, 0);
  const done = events.find((e) => e.type === 'done');
  assert.equal(events.filter((e) => e.type === 'token').map((t) => t.text).join(''), done.reply, 'older Ask builds its text from tokens');
  assert.equal(done.model, 'CHIP’s data');
  assert.match(done.reply, /9 of 10 commits\*\* carry a Claude co-author line: an agent built it from Elleta's rules/);
  assert.match(done.reply, /- Order: first commits CHIP 2026-04-26/);
  assert.match(done.reply, /- Rules: CHIP CLAUDE\.md \(8 dated rules, latest 2026-11-12\)/);
  assert.match(done.reply, /- Documented: handoff\.md/);
  assert.equal(done.route.why, 'Answered from the record, no model, free');
  assert.ok(done.data[0].rows.length > 0);
});

test('a review question in the data panel gets the data and a one-click Claude offer, started by nothing', async () => {
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  let ran = 0;
  const was = providers.claude.ask;
  providers.claude.ask = async function* () { ran++; yield 'x'; };
  const wasLocal = providers.local.ask;
  providers.local.ask = async function* () { yield 'Button: story yes.'; };
  const ctx = { ...defaultCtx(), bella: () => ({ components: [{ name: 'Button', hasStory: true, health: { contrast: { status: 'pass' } } }] }), partsUsed: () => ['Button'] };
  const events = [];
  for await (const e of askStream('review the code in Button', 's5', undefined, { scope: 'data', models, budget, ctx })) events.push(e);
  providers.claude.ask = was;
  providers.local.ask = wasLocal;
  assert.equal(ran, 0);
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.route.alt.id, 'claude:sonnet');
  assert.match(done.route.why, /Claude is one click away \(3 of 20 today\)/);
});

/* ---- every question ends inside a minute (22 Nov) ---- */
const hang = () => new Promise(() => {});
async function dataRun(askImpl, provider, env = {}) {
  const { defaultCtx } = await import('../lib/chipdata.mjs');
  const wasAsk = providers.local.ask;
  const wasList = providers.local.list;
  providers.local.ask = askImpl;
  providers.local.list = async () => models.filter((m) => m.place === 'local');
  env = { CHIP_NO_WARM: '1', ...env };
  Object.assign(process.env, env);
  const ctx = { ...defaultCtx(), guard: async () => ({ at: Date.now(), ok: true }), baseline: () => ({ files: { a: { x: 1 } } }), partsUsed: () => ['Button'], bella: () => ({ components: [{ name: 'Button' }] }) };
  const events = [];
  const t0 = Date.now();
  try {
    for await (const e of askStream('are we on system', 's9', undefined, { scope: 'data', provider, models, budget, ctx })) events.push(e);
  } finally {
    providers.local.ask = wasAsk;
    providers.local.list = wasList;
    for (const k of Object.keys(env)) delete process.env[k];
  }
  return { events, ms: Date.now() - t0 };
}
test('a 27b that does not start in time is dropped for the 8b, and the answer says so', async () => {
  const { events, ms } = await dataRun(async function* ({ model }) {
    if (/27b/.test(model)) await hang();
    yield 'On system is clean.';
  }, 'local:qwen3.8:27b', { CHIP_FIRST_TOKEN_MS: '150' });
  assert.ok(ms < 2000);
  assert.match(events.find((e) => e.type === 'progress').text, /^Asking qwen3\.8:27b, loading it can take 30 seconds/);
  const slow = events.find((e) => e.type === 'slow');
  assert.deepEqual([slow.from, slow.to], ['qwen3.8:27b', 'qwen3:8b']);
  const done = events.find((e) => e.type === 'done');
  assert.equal(done.model, 'qwen3:8b');
  assert.match(done.route.why, /qwen3\.8:27b did not start in 0 seconds, so qwen3:8b answered/);
});
test('a model that starts and then stalls ends in the facts alone inside the time limit', async () => {
  const { events, ms } = await dataRun(async function* () {
    yield 'On ';
    await hang();
  }, undefined, { CHIP_ANSWER_MS: '250' });
  assert.ok(ms < 2500);
  const done = events.find((e) => e.type === 'done');
  assert.match(done.reply, /^On system: /);
});
test('with no model at all the facts alone still answer', async () => {
  const { events } = await dataRun(async function* () { throw new Error('ECONNREFUSED'); }, undefined);
  assert.match(events.find((e) => e.type === 'done').reply, /^On system: /);
});
