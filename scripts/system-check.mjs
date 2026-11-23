// `npm run check:system` (CLAUDE.md: "never say 'on system' without the output of the guard; the dashboard number is
// npm run check:system"). Runs the on-system guard, then prints the number the dashboard shows: the old off-system
// constructs the baseline holds, and how many BELLA parts app/src imports. Exit 1 when the guard fails.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const g = spawnSync(process.execPath, [join(ROOT, 'scripts/on-system-guard.mjs')], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(g.stdout ?? '');
process.stderr.write(g.stderr ?? '');

const base = JSON.parse(readFileSync(join(ROOT, 'data/on-system-baseline.json'), 'utf8'));
const files = Object.entries(base.files ?? {});
const held = files.reduce((s, [, k]) => s + Object.values(k).reduce((a, b) => a + b, 0), 0);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const parts = new Set();
for (const f of walk(join(ROOT, 'app/src')).filter((x) => /\.jsx?$/.test(x))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/@bella\/components\/([A-Za-z0-9]+)\//g)) parts.add(m[1]);
}
console.log(`on-system guard: ${g.status === 0 ? 'clean' : 'FAILS'}`);
console.log(`off-system constructs held by the baseline: ${held} in ${files.length} files`);
console.log(`BELLA parts app/src imports: ${parts.size}`);
process.exit(g.status === 0 ? 0 : 1);
