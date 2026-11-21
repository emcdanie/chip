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

/* The 22 Nov crash: CHIP's server runs with FORCE_COLOR=1, which made the commit hook's `console.log(port)` print
   an escape sequence, so `wait-on tcp:127.0.0.1:<port>` crashed and every run died in the Storybook step. */
test('a process CHIP starts gets plain output even when CHIP itself runs with FORCE_COLOR=1', async () => {
  const was = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = '1';
  try {
    const { sh } = await import('../lib/review.mjs');
    const r = await sh(process.execPath, ['-e', 'console.log(61116)'], process.cwd());
    assert.equal(r.out, '61116\n');
    assert.ok(!r.out.includes('\x1b'));
  } finally {
    if (was === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = was;
  }
});

test('packages: bella-parts’ own, with the one documented link to bella-chip-theme and nothing else', async () => {
  const { packagesProblem } = await import('../lib/runs.mjs');
  const { mkdtempSync, mkdirSync, symlinkSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'pk-'));
  try {
    mkdirSync(join(dir, 'bella/node_modules'), { recursive: true });
    mkdirSync(join(dir, 'theme/node_modules'), { recursive: true });
    mkdirSync(join(dir, 'other/node_modules'), { recursive: true });
    assert.equal(packagesProblem(join(dir, 'bella'), join(dir, 'theme/node_modules')), null); // its own
    rmSync(join(dir, 'bella/node_modules'), { recursive: true });
    symlinkSync(join(dir, 'theme/node_modules'), join(dir, 'bella/node_modules'));
    assert.equal(packagesProblem(join(dir, 'bella'), join(dir, 'theme/node_modules')), null); // the documented link
    rmSync(join(dir, 'bella/node_modules'));
    symlinkSync(join(dir, 'other/node_modules'), join(dir, 'bella/node_modules'));
    assert.match(packagesProblem(join(dir, 'bella'), join(dir, 'theme/node_modules')), /not bella-parts/); // anything else
    rmSync(join(dir, 'bella/node_modules'));
    assert.match(packagesProblem(join(dir, 'bella'), join(dir, 'theme/node_modules')), /no readable node_modules/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gate ready: the harness passes in CHIP’s own environment, FORCE_COLOR=1 included, with no model call', async () => {
  const was = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = '1';
  try {
    const { gateReady } = await import('../lib/runs.mjs');
    const g = await gateReady();
    const bad = g.checks.filter((c) => !c.ok);
    // Claude sign-in and port 6006 are the machine's state; the harness checks are what this proves
    const harness = bad.filter((c) => !['Claude Code signed in', 'Port 6006 free'].includes(c.name));
    assert.deepEqual(harness, [], JSON.stringify(g.checks));
    assert.ok(g.checks.some((c) => c.name === 'Gate port' && /bare number/.test(c.detail)));
    assert.ok(g.checks.some((c) => c.name === 'wait-on' && c.ok));
  } finally {
    if (was === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = was;
  }
});
