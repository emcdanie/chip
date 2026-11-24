// Process line check (Elleta, 23 Nov 2026: "lines never pass through a step or its text"; Processes is now the mind
// maps she picked). For each map (BELLA pipeline, Agent workflow, Audits and skills), at 320, 768, 1024 and 1440, it
// measures what the page actually draws, with nothing picked and with each step picked in turn, and fails when
//   - a branch or a link enters a step's box (its text sits inside it), a stage's name or the root,
//   - two of the root's branches run closer than 12px for more than 40px (they would read as one cable),
//   - two links of one pick run closer than 6px (they would read as one strand), except where they share a step's edge,
//   - the page scrolls sideways,
//   - a wide map is not a tree (no steps drawn, or no branch to a step), or a narrow one (under the phone step) still draws branches.
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
  const textBox = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return box(rg.getBoundingClientRect()); };
  const leaves = [...document.querySelectorAll('[data-mindmap] [data-leaf]')].map((w) => ({ id: w.dataset.leaf, ...box(w.getBoundingClientRect()) }));
  const labels = [...document.querySelectorAll('[data-mindmap] [data-stage-label]')].map((w) => ({ id: w.textContent.trim(), ...textBox(w) }));
  const root = [...document.querySelectorAll('[data-mindmap] [data-root-label]')].map((w) => ({ id: 'root', ...textBox(w) }));
  const path = (el) => {
    const pa = el.querySelector('svg path');
    const m = pa.getScreenCTM();
    const n = 120;
    return Array.from({ length: n + 1 }, (_, i) => { const q = pa.getPointAtLength((pa.getTotalLength() * i) / n); return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]; });
  };
  const tree = [...document.querySelectorAll('[data-process-lines] [data-bella-component="branch"]')].map(path);
  // a link is three pieces, in order
  const pieces = [...document.querySelectorAll('[data-process-links] [data-bella-component="branch"]')].map(path);
  const links = [];
  for (let i = 0; i + 2 < pieces.length; i += 3) links.push(pieces[i].concat(pieces[i + 1], pieces[i + 2]));
  return { leaves, labels, root, tree, links, groups: document.querySelectorAll('[data-bella-component="branch-group"]').length, sx: document.documentElement.scrollWidth - innerWidth };
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

const near = (pts, other, hubs, min) => {
  let worst = Infinity;
  for (const [x, y] of pts) {
    if (hubs.some(([hx, hy]) => Math.hypot(x - hx, y - hy) < 32)) continue;
    for (const [u, v] of other) worst = Math.min(worst, Math.hypot(x - u, y - v));
  }
  return worst < min ? worst : null;
};

const browser = await chromium.launch();
const results = [];
// the tools row (23 Nov: the chips ran under 'Updated · Refresh' at about 2000 wide): at wide, normal and small widths
// the chip row and the Updated group never overlap, the Updated group stays right of the chips, and at 1440 and up
// the chips stand whole (nothing scrolls or is cut)
for (const width of [320, 768, 1024, 1440, 1920, 2000, 2200]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
  await page.goto(`${APP}/#/system-map`);
  await page.waitForTimeout(4500);
  const t = await page.evaluate(() => {
    const c = document.querySelector('[data-tools-chips]');
    const f = document.querySelector('[data-tools-fresh]');
    if (!c || !f) return null;
    const a = c.getBoundingClientRect(), b = f.getBoundingClientRect();
    return { overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, scrolls: c.scrollWidth > c.clientWidth + 1, rightOf: b.left >= a.right - 1 || b.top >= a.bottom - 1, sx: document.documentElement.scrollWidth - innerWidth };
  });
  const bad = [];
  if (!t) bad.push('no tools row');
  else {
    if (t.overlap) bad.push('the chips and Updated · Refresh overlap');
    if (!t.rightOf) bad.push('Updated · Refresh sits left of the chips');
    if (width >= 1440 && t.scrolls) bad.push('the chips scroll or are cut though there is room');
    if (t.sx > 0) bad.push(`sideways page scroll ${t.sx}`);
  }
  results.push({ map: 'Tools row', width, mode: 'row', steps: 0, picks: 1, ok: !bad.length, bad });
  await page.close();
}
for (const map of MAPS) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    await page.goto(`${APP}/#/system-map`);
    await page.waitForTimeout(4500);
    const btn = page.getByRole('button', { name: new RegExp(map) }).first();
    if (await btn.count()) await btn.click(); else await page.selectOption('select', { label: map }).catch(() => {});
    await page.waitForTimeout(2500);
    const bad = [];
    let steps = 0, lines = 0, picks = 0;
    const leafBtns = page.locator('[data-bella-component="map-leaf"]');
    const count = await leafBtns.count();
    const tree = (await page.locator('[data-mindmap]').count()) > 0;
    // nothing picked (Esc), then each step in turn
    for (let i = -1; i < (tree ? count : 0); i += 1) {
      if (i < 0) { await page.keyboard.press('Escape'); await leafBtns.first().focus().catch(() => {}); await page.keyboard.press('Escape'); } else { await leafBtns.nth(i).click(); }
      await page.waitForTimeout(i < 0 ? 400 : 1300);
      const g = await page.evaluate(measure);
      steps = g.leaves.length;
      lines = g.tree.length + g.links.length;
      picks += 1;
      const sub = (b, n) => ({ ...b, l: b.l, r: b.r });
      const all = [...g.tree, ...g.links];
      all.forEach((l) => {
        g.leaves.forEach((s) => through(l, s) && bad.push(`a line enters the step ${s.id}`));
        g.labels.forEach((s) => through(l, s, 0) && bad.push(`a line runs through the stage name "${s.id}"`));
        g.root.forEach((s) => through(l, s, 1) && bad.push('a line enters the root'));
      });
      // the root's branches fan out of one point: no two closer than 12px for more than 40px of length (a cable, not a fan)
      const stageLeft = Math.min(...g.labels.map((s) => s.l));
      const rootBranches = g.tree.filter((l) => l[0][0] < stageLeft - 1);
      const lenOf = (l, i) => Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
      rootBranches.forEach((a, x) => rootBranches.slice(x + 1).forEach((b) => {
        let run = 0;
        for (let i = 1; i < a.length; i += 1) if (Math.min(...b.map((q) => Math.hypot(q[0] - a[i][0], q[1] - a[i][1]))) < 12) run += lenOf(a, i);
        if (run > 40) bad.push(`two root branches run within 12px for ${run.toFixed(0)}px`);
      }));
      // the links of one pick: no two closer than 6px, leaving out the 32px around a step edge two of them share
      const ends = g.links.flatMap((l) => [l[0], l[l.length - 1]]);
      const hubs = ends.filter((e, a) => ends.some((o, b) => a !== b && Math.hypot(e[0] - o[0], e[1] - o[1]) < 1));
      g.links.forEach((a, x) => g.links.slice(x + 1).forEach((b) => { const d = near(a, b, hubs, 6); if (d !== null) bad.push(`two links run ${d.toFixed(1)}px apart`); }));
      if (g.sx > 0) bad.push(`sideways page scroll ${g.sx}`);
      if (tree && !g.leaves.length) bad.push('no steps drawn');
      if (tree && g.tree.length < g.leaves.length) bad.push('a step has no branch');
      if (!tree && g.tree.length) bad.push('branches drawn under the phone width');
      if (!tree && !g.groups) bad.push('no stage groups on the phone layout');
    }
    if (!tree && !count) bad.push('no steps drawn');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: join(OUT, `${map.replace(/\W+/g, '-')}-${width}.png`), fullPage: true }).catch(() => {});
    results.push({ map, width, mode: tree ? 'tree' : 'phone', steps, lines, picks, ok: !bad.length, bad: [...new Set(bad)] });
    await page.close();
  }
}
await browser.close();
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.map.padEnd(18)} ${String(r.width).padStart(4)}  ${r.mode}, ${r.steps} steps, ${r.picks} picks checked${r.ok ? '' : `: ${r.bad.join('; ')}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`process-line-check: ${results.length - failed} of ${results.length} map-widths clean · ${OUT}`);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
writeFileSync(PROCESS_RECORD, JSON.stringify({ at: new Date().toISOString(), hash: processInputsHash(), ok: !failed, clean: results.length - failed, total: results.length }, null, 1));
process.exit(failed ? 1 : 0);
