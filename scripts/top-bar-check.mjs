// Top bar check (Elleta, 23 Nov 2026, from her drawn-on Processes screenshot: the bell sat on the account's avatar at
// about 2000 wide). On several pages at 2000, 1440, 1024, 768 and 320, with the Work panel closed and open, it measures
// the boxes of the menu button, the search field, the bell, the account and the page's New task button and fails when
//   - any two of them intersect,
//   - two that sit on one row are closer than 8px,
//   - any of them leaves the window (or the bar),
//   - the page scrolls sideways.
// Usage: node scripts/top-bar-check.mjs [--app http://localhost:3160]
// Needs a CHIP server and Playwright in BELLA_DIR (as stage-leader-check.mjs). Exit 1 on any failure.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { bellaDir } from './lib/bella-dir.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const WIDTHS = [2000, 1440, 1024, 768, 320];
const PAGES = ['#/system-map', '#/work', '#/health', '#/system/components', '#/playground'];
const GAP = 8;
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');

const measure = () => {
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return r.width && r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null;
  };
  const bar = document.querySelector('.chip-screen__topbar');
  const found = {
    menu: bar?.querySelector('.chip-screen__lead button'),
    search: bar?.querySelector('input[type=search], [role=search], input'),
    bell: [...(bar?.querySelectorAll('button') ?? [])].find((b) => /things? need you|need you/i.test(b.getAttribute('aria-label') ?? '')),
    account: [...(bar?.querySelectorAll('[aria-label], [class*=avatar]') ?? [])].find((b) => /account|Elleta|McDaniel/i.test(b.getAttribute('aria-label') ?? '') || /avatar/i.test(b.className?.toString() ?? '')),
    'New task': [...document.querySelectorAll('main button, header button, .chip-screen button')].find((b) => /^New task$/.test(b.textContent.trim())),
  };
  const boxes = Object.fromEntries(Object.entries(found).map(([k, e]) => [k, e ? box(e) : null]));
  const phone = innerWidth < 600;
  // on a phone the search is an icon button inside the bar: it is the one named "Search"
  if (phone && !boxes.search) boxes.search = box([...(bar?.querySelectorAll('button') ?? [])].find((b) => /^search/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) ?? document.body);
  return { boxes, bar: bar ? box(bar) : null, sideways: document.documentElement.scrollWidth > innerWidth + 1, w: innerWidth };
};

const browser = await chromium.launch();
let bad = 0;
let total = 0;
for (const width of WIDTHS) {
  for (const hash of PAGES) {
    for (const panel of [false, true]) {
      total += 1;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${APP}/${hash}`);
      await page.waitForTimeout(3500);
      if (panel) {
        const bell = page.getByRole('button', { name: /need you/i }).first();
        if (await bell.count()) {
          await bell.click();
          await page.waitForTimeout(900);
        }
      }
      const m = await page.evaluate(measure);
      await page.close();
      const issues = [];
      const names = Object.keys(m.boxes).filter((k) => m.boxes[k]);
      for (const k of ['menu', 'search', 'bell', ...(m.w < 1000 ? [] : ['account'])]) if (!m.boxes[k]) issues.push(`${k} not found`);
      for (const k of names) {
        const a = m.boxes[k];
        if (a.l < -0.5 || a.r > m.w + 0.5) issues.push(`${k} leaves the window`);
      }
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const a = m.boxes[names[i]];
          const b = m.boxes[names[j]];
          const overlapY = a.t < b.b && b.t < a.b;
          const overlapX = a.l < b.r && b.l < a.r;
          if (overlapX && overlapY) issues.push(`${names[i]} and ${names[j]} overlap`);
          else if (overlapY) {
            const gap = Math.max(a.l - b.r, b.l - a.r);
            if (gap < GAP - 0.5) issues.push(`${names[i]} and ${names[j]} are ${Math.round(gap)}px apart`);
          }
        }
      }
      if (m.sideways) issues.push('the page scrolls sideways');
      if (issues.length) bad += 1;
      console.log(`${issues.length ? 'FAIL' : 'ok  '} ${String(width).padStart(4)} ${hash.padEnd(20)} ${panel ? 'panel open  ' : 'panel closed'} ${issues.join('; ')}`);
    }
  }
}
await browser.close();
console.log(`top-bar-check: ${total - bad} of ${total} clean`);
process.exit(bad ? 1 : 0);
