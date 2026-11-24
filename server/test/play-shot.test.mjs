// The Pages tab's page picture: which addresses it may open (only the project's own origin and a path or #/hash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotUrl, shotWidth } from '../lib/play-shot.mjs';

test('a route becomes an address on the project itself', () => {
  assert.equal(shotUrl('http://127.0.0.1:3000/', '/about'), 'http://127.0.0.1:3000/about');
  assert.equal(shotUrl('http://127.0.0.1:3160', '#/not-again'), 'http://127.0.0.1:3160/#/not-again');
  assert.equal(shotUrl('http://127.0.0.1:3000', ''), 'http://127.0.0.1:3000/');
});

test('a route can never point at another site', () => {
  for (const bad of ['http://evil.example/', '//evil.example/x', 'about', 'javascript:alert(1)', '/a b']) {
    assert.throws(() => shotUrl('http://127.0.0.1:3000', bad), /not a page route/, bad);
  }
});

test('the width stays between 320 and 1920', () => {
  assert.equal(shotWidth('1440'), 1440);
  assert.equal(shotWidth(10), 320);
  assert.equal(shotWidth(99999), 1920);
  assert.equal(shotWidth('x'), 1440);
});
