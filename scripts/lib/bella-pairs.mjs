// BELLA's contrast pairs, read the way BELLA checks them. BELLA builds its
// PAIRS list in code (flatMap over surfaces and status tones), so a regex over
// the script's text finds nothing: CHIP showed "0 of 68 have pairs" while the
// gate checked 409 (19 Nov 2026). Instead:
//  - the list itself: BELLA's own PAIRS and DISTINCT blocks, evaluated as
//    written (a sandbox with nothing but the helpers they use);
//  - the ratios: BELLA's script run unmodified with --verbose, so every number
//    is the gate's own maths, in its four themes.
// One reader for the sync (scripts/sync-bella.mjs) and the server (gaps.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const blockOf = (src, name) => {
  const a = src.indexOf(`const ${name} = [`);
  return a < 0 ? null : src.slice(a, src.indexOf('\n];', a) + 3);
};

/** The declared lists: { pairs: [{label, fg, bg, bar}], distinct: [{label, fg, bg, bar}] }. */
export function declaredLists(bellaDir) {
  const src = readFileSync(join(bellaDir, 'scripts/contrast-pairs.mjs'), 'utf8');
  const pairs = blockOf(src, 'PAIRS');
  const distinct = blockOf(src, 'DISTINCT');
  if (!pairs) throw new Error('bella-pairs: no PAIRS list in scripts/contrast-pairs.mjs');
  const consts = ['TEXT', 'MARK', 'APART'].map((k) => src.match(new RegExp(`const ${k} = ([\\d.]+);`))).filter(Boolean).map((m) => m[0]).join('\n');
  const pages = src.match(/const PAGES = \[[^\]]*\];/)?.[0] ?? '';
  const code = `${consts}\nconst c = (n) => \`--color-\${n}\`;\n${pages}\n${pairs}\n${distinct ?? 'const DISTINCT = [];'}\n({ PAIRS, DISTINCT, APART: typeof APART === 'number' ? APART : 1.08 })`;
  const out = vm.runInNewContext(code, {}, { timeout: 1000 });
  return {
    pairs: out.PAIRS.map(([label, fg, bg, bar]) => ({ label, fg, bg, bar })),
    distinct: out.DISTINCT.map(([label, fg, bg]) => ({ label, fg, bg, bar: out.APART })),
  };
}

/** The tokens a pair reads ('--a over --b' is two). */
export const pairTokens = (p) => [p.fg, ...p.bg.split(' over ')];

/**
 * Every declared pair with BELLA's measured ratio in each theme.
 * { ok, checked, summary, pairs: [{label, fg, bg, bar, measured: [{theme, ratio}], worst, ok}], failing: [label] }
 */
export function bellaPairs(bellaDir) {
  const { pairs, distinct } = declaredLists(bellaDir);
  const r = spawnSync(process.execPath, ['scripts/contrast-pairs.mjs', '--verbose'], { cwd: bellaDir, encoding: 'utf8' });
  const byLabel = new Map();
  for (const m of (r.stdout ?? '').matchAll(/^(\S+)\s+([\d.]+):1\s+>=\s+([\d.]+)\s+(.+)$/gm)) {
    const [, theme, ratio, , label] = m;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push({ theme, ratio: Number(ratio) });
  }
  const measure = (p) => {
    const measured = byLabel.get(p.label) ?? [];
    const worst = measured.length ? Math.min(...measured.map((x) => x.ratio)) : null;
    return { ...p, measured, worst, ok: worst != null && worst >= p.bar };
  };
  const all = pairs.map(measure);
  const summary = (r.status === 0 ? r.stdout : r.stderr).trim().split('\n').filter((l) => /^contrast pairs:/.test(l)).pop() ?? null;
  return {
    ok: r.status === 0,
    checked: Number(summary?.match(/(\d+) checked/)?.[1] ?? 0) || null,
    summary,
    pairs: all,
    distinct: distinct.map(measure),
    failing: all.filter((p) => p.measured.length && !p.ok).map((p) => p.label),
  };
}
