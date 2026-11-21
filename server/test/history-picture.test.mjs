// History's "What changed" picture (GET /history/picture) reads only a .png the record itself lists,
// from git: never another file, a path outside the repo, or a record that isn't there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyPicture, searchHistory } from '../lib/history.mjs';

const rec = searchHistory({ limit: 2000 }).records.find((r) => r.repo === 'bella' && (r.files ?? []).some((f) => /\.png$/.test(f)));

test('a png the record lists comes back as a png', { skip: !rec && 'no BELLA record with a screenshot here' }, () => {
  const png = rec.files.find((f) => /\.png$/.test(f));
  const out = historyPicture(rec.id, png, 'after') ?? historyPicture(rec.id, png, 'before');
  assert.ok(out, 'one side exists');
  assert.equal(out.subarray(1, 4).toString(), 'PNG');
});

test('anything else is refused', () => {
  const id = rec?.id ?? 'bella:0000000';
  assert.equal(historyPicture(id, '../../../etc/passwd', 'after'), null);
  assert.equal(historyPicture(id, 'package.json', 'after'), null);
  assert.equal(historyPicture(id, 'src/not-in-this-record.png', 'after'), null);
  assert.equal(historyPicture('nope:123', 'a.png', 'after'), null);
});
