// The card and scroll records are per route (23 Nov evening, her pick: the commit gate is per page): a failing
// page blocks only the commits of its own files, a shared template needs every route clean, and a pass belongs to
// the version of the files it ran on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROUTES, routeWhy, scrollWhy } from '../../scripts/lib/stage-leaders.mjs';

const HEALTH = 'app/src/pages/HealthContent.jsx';
const WORK = 'app/src/pages/WorkContent.jsx';
const SCREEN = 'app/src/templates/Screen.jsx';
const now = { [HEALTH]: 'h1', [WORK]: 'w1', [SCREEN]: 's1' };
const entry = (ok, files = now) => ({ ok, clean: ok ? 10 : 7, total: 10, files });
const rec = (over = {}) => ({ routes: Object.fromEntries(ALL_ROUTES.map((r) => [r, entry(true)])), ...over });

test('a failing #/health does not block a commit that only touches another page', () => {
  const r = rec();
  r.routes['#/health'] = entry(false);
  assert.equal(routeWhy(r, [WORK], now), null);
  assert.match(routeWhy(r, [HEALTH], now), /#\/health has 3 of 10/);
});

test('a shared template needs every route clean', () => {
  const r = rec();
  assert.equal(routeWhy(r, [SCREEN], now), null);
  r.routes['#/health'] = entry(false);
  assert.match(routeWhy(r, [SCREEN], now), /#\/health/);
});

test('a pass on another version of the file, or no pass, blocks', () => {
  assert.match(routeWhy(rec(), [WORK], { ...now, [WORK]: 'w2' }), /another version of/);
  assert.match(routeWhy(null, [WORK], now), /not been run/);
  const r = rec();
  delete r.routes['#/work'];
  assert.match(routeWhy(r, [WORK], now), /#\/work has not been checked/);
  assert.equal(routeWhy({ hash: 'x', ok: true }, [WORK], now), 'it has not been run'); // the old single record never passes
});

test('the scroll record needs every route clean on these files', () => {
  const ok = { routes: Object.fromEntries(ALL_ROUTES.map((r) => [r, { hash: 'a', ok: true, bad: 0, total: 3 }])) };
  assert.equal(scrollWhy(ok, 'a'), null);
  assert.match(scrollWhy(ok, 'b'), /other files/);
  ok.routes['#/work'] = { hash: 'a', ok: false, bad: 2, total: 3 };
  assert.match(scrollWhy(ok, 'a'), /#\/work has 2 scroll boxes/);
});
