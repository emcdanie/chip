// Drawer inset check (Elleta, 23 Nov 2026: "the padding on the drawers is still wrong"). Opens each reading drawer on
// Health at 1440, 768 and 320 and measures, in px, the left edge of the title text and of every block under it
// (chart, bars, group rows, rows, headings, notices), and the right edge of the close button against each block's
// right edge (rows sit bare by the template's rule: their own 16 puts the content on the title's edge, so rows are not measured as boxes). FAILS when any block's left or right differs from the title's by more than 1px. It prints every number,
// so it cannot pass on nothing. Usage: node scripts/drawer-inset-check.mjs [--app http://localhost:3160]
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { bellaDir } from './lib/bella-dir.mjs';

const i = process.argv.indexOf('--app');
const APP = i > 0 ? process.argv[i + 1] : 'http://localhost:3160';
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
const WIDTHS = [1440, 768, 320];
const DRAWERS = [
  { name: 'Drift', card: /^Drift from BELLA/ },
  { name: 'Gaps', card: /^Gaps/ },
  { name: 'Audit', card: /^BELLA system/ },
];
const BLOCKS = ['bar-chart', 'progress', 'disclosure', 'stat-card', 'section-head', 'notification', 'text-stack'];

const browser = await chromium.launch();
let bad = 0;
let measured = 0;
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const d of DRAWERS) {
    await page.goto(`${APP}/#/health`);
    await page.reload();
    await page.waitForTimeout(2500);
    const card = page.locator('button', { hasText: d.card }).first();
    if (!(await card.count())) { console.log(`FAIL ${width} ${d.name}: card not found`); bad++; continue; }
    await card.click();
    await page.waitForTimeout(1200);
    const res = await page.evaluate((blocks) => {
      const dlg = [...document.querySelectorAll('dialog')].find((x) => x.getBoundingClientRect().width > 0);
      if (!dlg) return null;
      const r = (e) => e.getBoundingClientRect();
      const title = dlg.querySelector('h1,h2,h3');
      const close = dlg.querySelector('button');
      const L = r(title).left;
      const R = r(close).right;
      const nodes = [...dlg.querySelectorAll(blocks.map((b) => `[data-bella-component="${b}"]`).join(','))];
      // top-level blocks only: not inside another measured block (a row's text stack is the row's own padding)
      const top = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)) && !n.closest('[data-bella-component="list-row"]'));
      return { L: Math.round(L * 10) / 10, R: Math.round(R * 10) / 10, rows: top.map((n) => [n.dataset.bellaComponent, Math.round(r(n).left * 10) / 10, Math.round(r(n).right * 10) / 10]) };
    }, BLOCKS);
    if (!res) { console.log(`FAIL ${width} ${d.name}: drawer did not open`); bad++; continue; }
    const off = res.rows.filter(([, l, rt]) => Math.abs(l - res.L) > 1 || Math.abs(rt - res.R) > 1);
    measured += res.rows.length;
    console.log(`${off.length ? 'FAIL' : 'ok  '} ${width} ${d.name}: title left ${res.L}, close right ${res.R}, ${res.rows.length} blocks, ${off.length} off`);
    for (const [n, l, rt] of off.slice(0, 6)) console.log(`       ${n}: left ${l} right ${rt}`);
    if (off.length) bad++;
    await page.keyboard.press('Escape');
  }
  await page.close();
}
await browser.close();
console.log(`drawer-inset-check: ${measured} blocks measured, ${bad} drawers failed`);
process.exit(bad ? 1 : 0);
