// Top bar check (Elleta, 23 Nov 2026, from her drawn-on Processes screenshot: the bell sat on the account's avatar at
// about 2000 wide). Since her header mark-up (23 Nov) there is no top bar: the page's one row holds the menu button, the
// breadcrumb and the actions, and search is the Find field at the side menu's top. On several pages at 2000, 1440, 1024,
// 768 and 320, with the Work panel closed and open, it measures the menu button, the Find field (where the menu shows),
// the bell and the page's New button, and fails when
//   - any two of them intersect,
//   - two that sit on one row are closer than 8px,
//   - any of them leaves the window,
//   - the page's title (its h1) is cut,
//   - an avatar or a top bar is back in the frame,
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
  const head = document.querySelector('.chip-screen__head');
  const found = {
    menu: head?.querySelector('button[aria-label="Hide menu"], button[aria-label="Show menu"]'),
    search: document.querySelector('.chip-screen__menu [role=search] input'),
    bell: [...(head?.querySelectorAll('button') ?? [])].find((b) => /notifications|things? need you|need you/i.test(b.getAttribute('aria-label') ?? '')),
    New: [...(head?.querySelectorAll('button') ?? [])].find((b) => /^\+?\s*New$/.test(b.textContent.trim())),
  };
  const boxes = Object.fromEntries(Object.entries(found).map(([k, e]) => [k, e ? box(e) : null]));
  const h1 = head?.querySelector('h1');
  return {
    boxes,
    menuShown: !!document.querySelector('.chip-screen__menu') && !document.querySelector('.chip-screen__menu [data-bella-component="icon-rail"]'), // the icon rail (Components, 1024 and up) carries no Find field: the parts column has its own
    titleCut: h1 ? h1.scrollWidth > h1.clientWidth + 1 : true,
    extra: document.querySelectorAll('[data-bella-component=avatar], [data-bella-component=top-bar]').length,
    sideways: document.documentElement.scrollWidth > innerWidth + 1,
    w: innerWidth,
  };
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
        const bell = page.getByRole('button', { name: /notifications|need you/i }).first();
        if (await bell.count()) {
          await bell.click();
          await page.waitForTimeout(900);
        }
      }
      const m = await page.evaluate(measure);
      await page.close();
      const issues = [];
      const names = Object.keys(m.boxes).filter((k) => m.boxes[k]);
      for (const k of ['menu', 'bell', ...(m.menuShown ? ['search'] : [])]) if (!m.boxes[k]) issues.push(`${k} not found`);
      if (m.titleCut) issues.push('the title is cut');
      if (m.extra) issues.push('an avatar or a top bar is back');
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
