// Process line check (Elleta, 23 Nov 2026: "lines never pass through a step or its text"). For each map on
// Processes (BELLA pipeline, Agent workflow, Audits and skills), at 320, 768, 1024 and 1440, it measures what the
// board actually draws and fails when
//   - a line enters a step's box or the measured line under it,
//   - a line runs through a row's name,
//   - two lines running down a gap closer than 6px (they would read as one strand),
//   - a map that should fit (1280 and up) still floats a size note or a Fit control over its board.
// Usage: node scripts/process-line-check.mjs [--app http://localhost:3160] [--out dir]
// Needs a CHIP server and Playwright in BELLA_DIR (as stage-leader-check.mjs). Exit 1 on any failure; a full run
// leaves data/process-lines.json, which the guard reads for SystemMapContent.jsx.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';
import { PROCESS_RECORD, processInputsHash } from './lib/stage-leaders.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-process-lines'));
const WIDTHS = [320, 768, 1024, 1440];
const MAPS = ['BELLA pipeline', 'Agent workflow', 'Audits and skills'];
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
mkdirSync(OUT, { recursive: true });

const measure = () => {
  const box = (r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  const textBox = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const n = w.nextNode(); const rg = document.createRange(); rg.selectNodeContents(n ?? el); return box(rg.getBoundingClientRect()); };
  const steps = [...document.querySelectorAll('[data-step]')].map((w) => ({ id: w.dataset.step, ...box(w.getBoundingClientRect()) }));
  const labels = [...document.querySelectorAll('[data-row-label]')].map((w) => ({ id: w.textContent.trim(), ...textBox(w) }));
  const lines = [...document.querySelectorAll('[data-process-lines] [data-bella-component="map-line"]')].map((el) => {
    const path = el.querySelector('svg path');
    if (path) {
      const m = path.getScreenCTM();
      const n = 40;
      return Array.from({ length: n + 1 }, (_, i) => { const q = path.getPointAtLength((path.getTotalLength() * i) / n); return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]; });
    }
    const r = el.getBoundingClientRect(); // a straight piece: its line is down the middle
    const x = (r.left + r.right) / 2;
    return [[x, r.top], [x, r.bottom]];
  });
  const text = document.body.innerText;
  return { steps, labels, lines, floatNote: /\d+ wide · shown at/.test(text), fit: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fit'), sx: document.documentElement.scrollWidth - innerWidth };
};

// does the polyline pass through the box, shrunk by a pixel so touching its edge (where a line starts or ends) is fine
const through = (pts, b, shrink = 1) => {
  const L = b.l + shrink, R = b.r - shrink, T = b.t + shrink, B = b.b - shrink;
  if (R <= L || B <= T) return false;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let k = 0; k <= steps; k += 1) { const x = x0 + ((x1 - x0) * k) / steps, y = y0 + ((y1 - y0) * k) / steps; if (x > L && x < R && y > T && y < B) return true; }
  }
  return false;
};

const browser = await chromium.launch();
const results = [];
for (const map of MAPS) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    await page.goto(`${APP}/#/system-map`);
    await page.waitForTimeout(4500);
    const btn = page.getByRole('button', { name: new RegExp(map) }).first();
    if (await btn.count()) await btn.click(); else await page.selectOption('select', { label: map }).catch(() => {});
    await page.waitForTimeout(2500);
    const g = await page.evaluate(measure);
    const bad = [];
    if (!g.steps.length) bad.push('no steps drawn');
    g.lines.forEach((l, i) => {
      g.steps.forEach((s) => through(l, s) && bad.push(`a line enters the step ${s.id}`));
      g.labels.forEach((s) => through(l, s, 0) && bad.push(`a line runs through the row name "${s.id}"`));
    });
    // the long runs down a gap: straight pieces whose x is not a step's column
    const centres = g.steps.map((st) => (st.l + st.r) / 2);
    const runs = g.lines.filter((l) => l.length === 2 && Math.abs(l[0][0] - l[1][0]) < 0.5 && !centres.some((c) => Math.abs(c - l[0][0]) < 2)).map((l) => ({ x: l[0][0], y0: Math.min(l[0][1], l[1][1]), y1: Math.max(l[0][1], l[1][1]) }));
    runs.forEach((a, i) => runs.slice(i + 1).forEach((b) => Math.abs(a.x - b.x) < 6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2 && bad.push(`two lines run ${Math.abs(a.x - b.x).toFixed(1)}px apart in a gap`)));
    if (width >= 1280 && (g.floatNote || g.fit)) bad.push('a size note or Fit control floats over a map that should fit');
    if (g.sx > 0) bad.push(`sideways page scroll ${g.sx}`);
    await page.screenshot({ path: join(OUT, `${map.replace(/\W+/g, '-')}-${width}.png`), fullPage: true }).catch(() => {});
    results.push({ map, width, steps: g.steps.length, lines: g.lines.length, ok: !bad.length, bad: [...new Set(bad)] });
    await page.close();
  }
}
await browser.close();
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.map.padEnd(18)} ${String(r.width).padStart(4)}  ${r.steps} steps, ${r.lines} line pieces${r.ok ? '' : `: ${r.bad.join('; ')}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`process-line-check: ${results.length - failed} of ${results.length} map-widths clean · ${OUT}`);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
writeFileSync(PROCESS_RECORD, JSON.stringify({ at: new Date().toISOString(), hash: processInputsHash(), ok: !failed, clean: results.length - failed, total: results.length }, null, 1));
process.exit(failed ? 1 : 0);
