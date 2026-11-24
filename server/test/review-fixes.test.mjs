// Everything waiting for her look is in Needs you (Elleta, 24 Nov 2026, 10:40): the review-fix folders read live as one card
// per area, before and after paired, answered until a picture changes, and the waiting A/B pages with what is left to pick.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { areaOfFiles } = await import('../lib/progress-live.mjs');
const { prArea } = await import('../lib/lanes.mjs');
const { readBullets, pictureOf, plainName, readArea, readPage, reviewsWaiting, FIXES_DIR } = await import('../lib/review-fixes.mjs');
const { boardModel, decisionOf, needsOrder, tableStatus, tableArea } = await import('../../app/src/pages/workModel.js');
const { appOrigins, onlyChip } = await import('../lib/origin.mjs');

const REVIEW = 'http://localhost:3123/screens/progress/';
function screens() {
  const root = mkdtempSync(join(tmpdir(), 'review-fixes-'));
  mkdirSync(join(root, 'progress'));
  writeFileSync(join(root, 'progress', 'answers.json'), '[]');
  const area = join(root, FIXES_DIR, 'needs-you');
  mkdirSync(area, { recursive: true });
  for (const f of ['before-board-1440.png', 'after-board-1440.png', 'after-board-320.png', 'quality-before-1440.png', 'quality-after-1440.png']) writeFileSync(join(area, f), 'x');
  return root;
}

test('a picture says what it shows: after or before, its width, its topic, whichever order the builder named it', async () => {
  assert.deepEqual(pictureOf('after-1440-motion.png'), { path: 'after-1440-motion.png', role: 'after', width: 1440, topic: 'motion' });
  assert.deepEqual(pictureOf('quality-before-1440.png'), { path: 'quality-before-1440.png', role: 'before', width: 1440, topic: 'quality' });
  assert.equal(pictureOf('gaps-drawer-after-320.png').topic, 'gaps drawer');
  assert.equal(pictureOf('approved-mock-1100.png').role, 'other');
  assert.equal(plainName('status-marks'), 'Status marks');
});

test('an area is one card: each topic with its widths, the before of the same width behind it', async () => {
  const root = screens();
  const a = readArea(join(root, FIXES_DIR, 'needs-you'), 'needs-you', `${REVIEW}../${FIXES_DIR}/needs-you/`);
  assert.equal(a.title, 'Needs you');
  const board = a.topics.find((t) => t.topic === 'board');
  assert.deepEqual(board.views.map((v) => v.width), [1440, 320]);
  assert.match(board.views[0].before, /before-board-1440\.png$/);
  assert.equal(board.views[1].before !== null, true, 'a width with no before of its own falls back to the topic’s before');
  assert.match(a.line, /What changed: board, quality/);
  // each picture carries its own time, so the card can say which version is showing
  assert.ok(!Number.isNaN(Date.parse(board.views[0].at)) && !Number.isNaN(Date.parse(board.views[0].beforeAt)));
});

test('answered areas leave the board but stay on Needs you, split into Answered and Change asked', async () => {
  const root = screens();
  mkdirSync(join(root, FIXES_DIR, 'runs'));
  writeFileSync(join(root, FIXES_DIR, 'runs', 'after-drawer-1440.png'), 'x');
  const sent = new Date(Date.now() + 60_000).toISOString();
  writeFileSync(join(root, 'progress', 'answers.json'), JSON.stringify([
    { sent, answers: { url: `/screens/${FIXES_DIR}/needs-you/`, cards: [{ title: 'Needs you', answer: 'Accept' }] } },
    { sent, answers: { url: `/screens/${FIXES_DIR}/runs/`, cards: [{ title: 'Runs', answer: 'Change', note: 'the bar is cut' }] } },
  ]));
  const m = boardModel({ board: { reviews: reviewsWaiting({ screens: root, review: REVIEW }), progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } } });
  assert.equal(m.lanes.flatMap((l) => l.cards).filter((c) => c.kind === 'fixes').length, 0);
  assert.deepEqual(m.answered.map((c) => [c.id, c.status, c.needs]).sort(), [['fixes-needs-you', 'Accepted', false], ['fixes-runs', 'Change asked', false]]);
  assert.equal(m.answered.find((c) => c.id === 'fixes-runs').answer.note, 'the bar is cut');
});

test('an answered area leaves Needs you, and comes back when a picture changes after her answer', async () => {
  const root = screens();
  const sent = new Date(Date.now() + 60_000);
  writeFileSync(join(root, 'progress', 'answers.json'), JSON.stringify([{ sent: sent.toISOString(), answers: { page: 'Review fixes · Needs you', url: `/screens/${FIXES_DIR}/needs-you/`, cards: [{ from: 'x', title: 'Needs you', answer: 'Accept' }] } }]));
  assert.equal(reviewsWaiting({ screens: root, review: REVIEW }).areas[0].answered.answer, 'Accept');
  const later = new Date(sent.getTime() + 120_000);
  utimesSync(join(root, FIXES_DIR, 'needs-you', 'after-board-1440.png'), later, later);
  const again = reviewsWaiting({ screens: root, review: REVIEW }).areas[0];
  assert.equal(again.answered, null);
  assert.equal(again.changedSinceAnswer, true);
});

test('a waiting A/B page counts the questions she has not picked yet', async () => {
  const root = screens();
  mkdirSync(join(root, '2026-11-24-tools-row'));
  writeFileSync(join(root, '2026-11-24-tools-row', 'index.html'), '<h1>Work: where the project chips go</h1><section class="part"><h2>Chips</h2><img src="A-1440.png"></section><section class="part"><h2>Sort</h2></section>');
  writeFileSync(join(root, 'progress', 'answers.json'), JSON.stringify([{ sent: 's', answers: { url: '/screens/2026-11-24-tools-row/', cards: [{ title: 'Chips', answer: 'A · in the row' }] } }]));
  const p = readPage(root, '2026-11-24-tools-row/', REVIEW, JSON.parse('[{"sent":"s","answers":{"url":"/screens/2026-11-24-tools-row/","cards":[{"title":"Chips","answer":"A"}]}}]'));
  assert.deepEqual([p.title, p.questions, p.open], ['Work: where the project chips go', 2, 1]);
  assert.match(p.img, /\/screens\/2026-11-24-tools-row\/A-1440\.png$/);
});

test('on the board: an unanswered area and a page with picks left are cards that need her, with Accept and Change', async () => {
  const root = screens();
  const reviews = reviewsWaiting({ screens: root, review: REVIEW });
  reviews.pages = [{ id: 'page-x', title: 'Tools row', url: 'http://localhost:3123/screens/x/', img: null, questions: 2, open: 1 }, { id: 'page-done', title: 'Done', url: 'u', questions: 1, open: 0 }];
  const now = boardModel({ board: { reviews, progress: { reached: true, items: [], tasks: [] }, board: { place: {}, order: {} } } }).lanes.find((l) => l.id === 'now').cards;
  assert.deepEqual(now.filter((c) => c.needs).map((c) => c.id).sort(), ['fixes-needs-you', 'page-x']);
  const d = decisionOf(now.find((c) => c.kind === 'fixes'));
  assert.deepEqual([d.yes.label, d.no.label, d.no.call.note], ['Accept', 'Change', true]);
});

test('GET /needs/reviews answers CHIP only (the guard every route sits behind)', async () => {
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  after(() => server.close());
  const port = server.address().port;
  app.use(onlyChip(appOrigins(port)));
  app.get('/needs/reviews', (_req, res) => res.json({ ok: true }));
  const get = (origin) => fetch(`http://127.0.0.1:${port}/needs/reviews`, { headers: origin ? { origin } : {} });
  assert.equal((await get('https://evil.example')).status, 403);
  assert.equal((await get()).status, 200);
});

test('while she reviews, Needs you opens on her looks: newest pictures first, then the A/B pages, then her runs, then the rest', async () => {
  const c = (id, kind, startedAt = 0) => ({ id, kind, startedAt });
  const order = needsOrder([c('pr', 'pr'), c('run', 'run'), c('page', 'review'), c('old-area', 'fixes', 1), c('new-area', 'fixes', 2), c('need', 'need')]).map((x) => x.id);
  assert.deepEqual(order, ['new-area', 'old-area', 'page', 'run', 'pr', 'need']);
});

test('the Table says each thing once: status only where it adds to the lane, the area from the card or Not set', async () => {
  assert.equal(tableStatus({ status: 'Shipped', tone: 'success' }), '');
  assert.equal(tableStatus({ status: 'Idea', tone: 'neutral' }), '');
  assert.equal(tableStatus({ kind: 'session', progress: { state: 'working', done: 1, total: 4 } }), 'Running · step 2 of 4');
  assert.equal(tableStatus({ needs: true, status: 'Yours to merge' }), 'Yours to merge');
  assert.equal(tableStatus({ needs: true, status: 'Needs you' }), 'Waiting on you');
  assert.equal(tableStatus({ tone: 'danger', status: 'Failed' }), 'Did not land');
  assert.equal(tableArea({ area: 'Tokens' }), 'Tokens');
  assert.equal(tableArea({ area: null }), 'Not set');
});

test("a change's area comes from the files it touched, most of them; none known is null", async () => {
  assert.equal(areaOfFiles(['tokens/bella.json', 'tokens/chip.css', 'docs/a.md']), 'Tokens');
  assert.equal(areaOfFiles(['src/components/Button/Button.tsx', 'specs/components/Button.spec.yaml']), 'Components');
  assert.equal(areaOfFiles(['app/src/pages/WorkContent.jsx', 'server/server.js']), 'Tooling & gate');
  assert.equal(areaOfFiles(['README.md']), null);
});

test("a pull request's area is read once per head commit, and Not set when gh fails", async () => {
  let calls = 0;
  const read = () => (calls++, ['tokens/bella.json', 'tokens/chip.css', 'docs/maintaining.md']);
  assert.equal(prArea('/repo', { number: 72, headRefOid: 'h1' }, read), 'Tokens');
  assert.equal(prArea('/repo', { number: 72, headRefOid: 'h1' }, read), 'Tokens');
  assert.equal(calls, 1, 'the same head is not read again');
  assert.equal(prArea('/repo', { number: 72, headRefOid: 'h2' }, read), 'Tokens');
  assert.equal(calls, 2, 'a new head is read once');
  assert.equal(prArea('/repo', { number: 9, headRefOid: 'h3' }, () => { throw new Error('gh failed'); }), null);
  assert.equal(prArea('/repo', { number: 9, headRefOid: 'h3' }, () => ['src/components/Button/Button.tsx']), 'Components', 'a failure is not kept: the next read asks again');
});

test('what changed, in plain words: up to five bullets from what-changed.md, else the line stands', async () => {
  const root = screens();
  const dir = join(root, FIXES_DIR, 'needs-you');
  const base = `${REVIEW}../${FIXES_DIR}/needs-you/`;
  assert.deepEqual(readArea(dir, 'needs-you', base).bullets, []);
  writeFileSync(join(dir, 'what-changed.md'), '# Needs you\n\n- Cards ask **one question** each\n* Yes and No at the right edge\nnot a bullet\n- 3\n- 4\n- 5\n- 6 is one too many\n');
  const a = readArea(dir, 'needs-you', base);
  assert.deepEqual(a.bullets, ['Cards ask **one question** each', 'Yes and No at the right edge', '3', '4', '5']);
  assert.deepEqual(readBullets(join(dir, 'missing.md')), []);
});
