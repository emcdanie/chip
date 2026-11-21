// A run works on the one BELLA: bella-parts on chip/parts-dev, never bella-chip-theme (22 Nov: the last
// run's gate failed on the old checkout). And a dry run goes as far as the worktree and stops before the
// paid model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.BELLA_DIR ??= join(process.env.HOME, 'DEV', 'bella-parts');
const { runBellaProblem, startRun, getRun } = await import('../lib/runs.mjs');
const { DATA_DIR } = await import('../lib/config.mjs');

test('only bella-parts on chip/parts-dev', () => {
  assert.equal(runBellaProblem({ dir: '/Users/x/DEV/bella-parts', base: 'chip/parts-dev' }), null);
  assert.match(runBellaProblem({ dir: '/Users/x/DEV/bella-chip-theme', base: 'chip/parts-dev' }), /not bella-chip-theme/);
  assert.match(runBellaProblem({ dir: '/Users/x/DEV/bella', base: 'chip/parts-dev' }), /not bella /);
  assert.match(runBellaProblem({ dir: '/Users/x/DEV/bella-parts', base: 'feat/chip-components' }), /not feat\/chip-components/);
});

test('a dry run makes the worktree on bella-parts and stops before the model call', async () => {
  const r = await startRun({ brief: 'Dry run from the test: change nothing at all.', title: 'Dry run test', from: 'test', approved: true, dryRun: true });
  let run = getRun(r.id);
  for (let i = 0; i < 200 && !['dry', 'failed', 'login'].includes(run.status); i++) {
    await new Promise((d) => setTimeout(d, 100));
    run = getRun(r.id);
  }
  try {
    assert.equal(run.status, 'dry', run.error ?? '');
    assert.match(run.summary, /bella-parts/);
    assert.match(run.summary, /stopped before the model call/);
    assert.equal(run.cost, null);
    // nothing left behind: no branch, no worktree
    const branches = execFileSync('git', ['-C', process.env.BELLA_DIR, 'branch', '--list', run.branch], { encoding: 'utf8' }).trim();
    assert.equal(branches, '');
  } finally {
    for (const ext of ['json', 'md']) {
      const f = join(DATA_DIR, 'runs', `${run.id}.${ext}`);
      if (existsSync(f)) unlinkSync(f);
    }
  }
});

test('after an Accept: the touched parts, their specs rebuilt, Figma and CHIP data said, each a step', async () => {
  const { afterKeep, partsTouched } = await import('../lib/runs.mjs');
  assert.deepEqual(partsTouched(['src/components/Avatar/Avatar.tsx', 'src/components/Avatar/Avatar.stories.tsx', 'tokens/bella.json']), ['Avatar']);
  const B = process.env.BELLA_DIR;
  const branch = `chip/test-after-${Date.now().toString(36)}`;
  execFileSync('git', ['-C', B, 'branch', branch, 'chip/parts-dev']);
  const run = { id: `test-after-${Date.now()}`, title: 'After test', branch, files: ['src/components/Avatar/Avatar.tsx'], steps: [], step: null };
  try {
    await afterKeep(run, { only: ['spec', 'figma', 'sync'] });
    const said = run.steps.map((s) => s.step);
    assert.deepEqual(said, [`Opening ${branch} to update its specs and docs`, 'Spec rebuilt: Avatar', 'Figma: listed for the parts session (Avatar)', "CHIP's BELLA data: re-syncs when the branch is merged"]);
    assert.equal(run.step, null);
    assert.ok(run.after.endedAt);
  } finally {
    execFileSync('git', ['-C', B, 'branch', '-D', branch]);
    for (const ext of ['json']) {
      const f = join(DATA_DIR, 'runs', `${run.id}.${ext}`);
      if (existsSync(f)) unlinkSync(f);
    }
  }
});
