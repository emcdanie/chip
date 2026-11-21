// The guard's checks for her repeated misses (22 Nov): a sparkle, a whole sentence as a bold title, a typed
// measure, and a git commit without paths each fail the commit. Each runs on a copy of the guard in a temporary
// project, so no real file is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'on-system-guard.mjs');

function guard(files) {
  const root = mkdtempSync(join(tmpdir(), 'chip-guard-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    cpSync(GUARD, join(root, 'scripts', 'on-system-guard.mjs'));
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'data', 'on-system-baseline.json'), JSON.stringify({ files: {} }));
    mkdirSync(join(root, 'app', 'src'), { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'on-system-guard.mjs')], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('clean code passes', () => {
  const r = guard({ 'app/src/a.jsx': 'export default () => <Step title="Health" detail="One sentence, regular." />;' });
  assert.equal(r.code, 0, r.out);
});

test('a sparkle fails', () => {
  assert.equal(guard({ 'app/src/a.jsx': 'export const m = "✨";' }).code, 1);
  assert.equal(guard({ 'app/src/a.jsx': "export const i = <Icon name=\"Sparks\" />;" }).code, 1);
});

test('a whole sentence as a Step or ListRow title fails', () => {
  const r = guard({ 'app/src/a.jsx': 'export default () => <Step title="Health: Component checks read as Weather rows" />;' });
  assert.equal(r.code, 1);
  assert.match(r.out, /bold sentence title/);
  assert.equal(guard({ 'app/src/a.jsx': 'export default () => <ListRow title="Opens the plan. Then asks." />;' }).code, 1);
});

test('a typed measure fails, a computed one does not', () => {
  const r = guard({ 'app/src/a.jsx': 'export default () => <p>All 88 parts pass</p>;' });
  assert.equal(r.code, 1);
  assert.match(r.out, /typed measure/);
  assert.equal(guard({ 'app/src/a.jsx': 'export default ({ n }) => <p>{`All ${n} parts pass`}</p>;' }).code, 0);
  // a fixture is Figma's sample data
  assert.equal(guard({ 'app/src/pages/x.fixture.js': '' , 'app/src/pages/xFixture.js': "export const a = 'Push 6 commits?';" }).code, 0);
});

test('a git commit without paths fails, with paths or in its own worktree it does not', () => {
  const bare = guard({ 'scripts/x.mjs': "import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['commit', '-m', 'x']);\n" });
  assert.equal(bare.code, 1);
  assert.match(bare.out, /git commit without paths/);
  assert.equal(guard({ 'scripts/x.mjs': "run('git commit -m x -- a.txt');\n" }).code, 0);
  assert.equal(guard({ 'scripts/x.mjs': "await sh('git', ['-C', dir, 'commit', '-q', '-m', 'x'], dir);\n" }).code, 0);
});
