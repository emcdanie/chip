// Two safety rules from the click test (22 Nov), proved without starting a run or a push:
// 1. a run starts only from its approved plan, and a run that isn't going can't be "stopped";
// 2. a push card never carries a typed command, and its preview reads git without pushing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { startRun, stopRun, listRuns } = await import('../lib/runs.mjs');
const { gitItems, pushPreview } = await import('../lib/needs.mjs');

test('a run without an approved plan is refused before Claude is asked', async () => {
  const before = listRuns().length;
  for (const body of [{ brief: 'Add a story for Tag, one per variant.' }, { brief: 'Add a story for Tag, one per variant.', approved: 'yes' }, { brief: 'Add a story for Tag, one per variant.', approved: 1 }]) {
    await assert.rejects(startRun(body), /approved plan/);
  }
  assert.equal(listRuns().length, before, 'no run was recorded');
});

test('Stop on a run that is not going says so and changes nothing', () => {
  assert.throws(() => stopRun('no-such-run'), /Nothing is running/);
});

// a throwaway remote and clone, one local commit ahead
const dir = mkdtempSync(join(tmpdir(), 'chip-push-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const remote = join(dir, 'remote.git');
const work = join(dir, 'work');
execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
execFileSync('git', ['clone', '-q', remote, work], { stdio: 'ignore' });
g(work, 'config', 'user.email', 'test@example.invalid');
g(work, 'config', 'user.name', 'test');
g(work, 'checkout', '-q', '-b', 'main');
writeFileSync(join(work, 'a.txt'), 'one\n');
g(work, 'add', 'a.txt');
g(work, 'commit', '-q', '-m', 'first');
g(work, 'push', '-q', '-u', 'origin', 'main');
writeFileSync(join(work, 'a.txt'), 'two\n');
g(work, 'commit', '-q', '-am', 'second, not pushed');
const repos = [{ id: 'test', name: 'Test', dir: work, branch: 'main' }];

test('a push card opens the preview and carries no command to type', () => {
  const push = gitItems(repos).find((i) => i.id === 'ahead-test');
  assert.ok(push, 'the push card is there');
  assert.equal(push.action.type, 'push');
  assert.equal(push.action.command, undefined);
  assert.doesNotMatch(JSON.stringify(push.action), /git push/);
});

test('the preview lists what a push would send and pushes nothing', () => {
  const tipBefore = g(remote, 'rev-parse', 'main');
  const p = pushPreview('test', repos);
  assert.equal(p.upstream, 'origin/main');
  assert.deepEqual(p.commits.map((c) => c.subject), ['second, not pushed']);
  assert.equal(p.files, 1);
  assert.equal(g(remote, 'rev-parse', 'main'), tipBefore, 'the remote did not move');
});
