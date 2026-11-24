// Grid sweep: every block's outer edge on a column of the CHIP / Screen grid,
// measured, not guessed (visual study, 22 Nov 2026, approved: "ok i approve").
// Runs beside clip-sweep.mjs before every report.
//
// Per page, width and theme it takes the content grid (12 columns, the
// --layout-gutter between them, inside .chip-screen__content's padding) and
// every outermost block (BELLA cards, lanes, rows, headers, headings). A block
// misses when its left edge, or its right edge (not for text), is more than
// 1px from a column edge. Controls on the right of a control bar are exempt on
// the left, and on the right when another control follows on their line; anything running past the grid's right edge (a scrolled board
// lane) is not judged. Each miss gets a numbered pin on a full-page picture
// with the columns drawn in.
//
// Usage: node scripts/grid-sweep.mjs [--app http://localhost:3160] [--out dir]
//        [--pages work,health] [--widths 1100,1440] [--themes light]
// Needs a CHIP server and Playwright in BELLA_DIR (as clip-sweep.mjs).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-grid-sweep'));
const PAGES = arg('pages', 'work,health,components,foundations,history,playground,not-again,team,system-map,connectors').split(',');
const WIDTHS = arg('widths', '320,768,1024,1100,1440').split(',').map(Number);
const THEMES = arg('themes', 'light').split(',');
const BLOCKS = ['task-card', 'board-lane', 'card', 'stat-card', 'notification', 'list-row', 'empty-state', 'stage', 'section-head', 'page-header', 'segmented-control', 'tabs', 'heading'];

const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');

// runs in the page: the grid and every outer block against it
function grid(BLOCKS) {
  const m = document.querySelector('.chip-screen__content') || document.querySelector('main');
  const ms = getComputedStyle(m);
  const mr = m.getBoundingClientRect();
  const L = mr.left + parseFloat(ms.paddingLeft);
  const R = mr.right - parseFloat(ms.paddingRight);
  const W = R - L;
  const g = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layout-gutter')) || 24;
  const col = (W - 11 * g) / 12;
  const lefts = [];
  const rights = [];
  for (let i = 0; i < 12; i++) {
    lefts.push(L + i * (col + g));
    rights.push(L + i * (col + g) + col);
  }
  // cards (corner 16 or more, wider than 120) hold their own layout: what is inside one is not judged
  document.querySelectorAll('main *').forEach((e) => {
    if (parseFloat(getComputedStyle(e).borderTopLeftRadius) >= 16 && e.getBoundingClientRect().width > 120) e.setAttribute('data-gs-card', '');
  });
  const sel = BLOCKS.map((b) => `[data-bella-component="${b}"]`).join(',') + ',h1,h2,h3';
  const all = [...m.querySelectorAll(sel)].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= mr.left - 1 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[role=dialog]');
  });
  const blocks = all.filter((e) => !all.some((o) => o !== e && o.contains(e) && !['page-header', 'tabs'].includes(o.dataset.bellaComponent)) && !(e.parentElement && e.parentElement.closest('[data-gs-card]')));
  const sy = window.scrollY;
  const res = [];
  for (const e of blocks) {
    const r = e.getBoundingClientRect();
    const name = e.dataset.bellaComponent || e.tagName.toLowerCase();
    const text = (e.innerText || '').trim().split('\n')[0].slice(0, 40);
    if (r.right > R + 1) {
      res.push({ name, text, x: r.left, y: r.top + sy, w: r.width, past: true });
      continue;
    }
    const dl = Math.min(...lefts.map((x) => Math.abs(x - r.left)));
    const dr = Math.min(...rights.map((x) => Math.abs(x - r.right)));
    const ctl = ['segmented-control', 'select'].includes(e.dataset.bellaComponent) || (!!e.closest('[class*=between]') && r.left > L + W / 2);
    const isText = /^h\d$/.test(e.tagName.toLowerCase()) || e.dataset.bellaComponent === 'heading';
    // a control with another control after it on its line: its right edge is inside the bar, the bar's end is judged
    const inner = ctl && [...(e.parentElement?.parentElement ?? e.parentElement).querySelectorAll('button,select,input,[data-bella-component]')].some((o) => {
      const q = o.getBoundingClientRect();
      return !e.contains(o) && q.width > 0 && q.left >= r.right && q.top < r.bottom && q.bottom > r.top;
    });
    res.push({ name, text, x: r.left, y: r.top + sy, w: r.width, dl: Math.round(dl * 10) / 10, dr: isText ? 0 : Math.round(dr * 10) / 10, missL: dl > 1 && !ctl, missR: !isText && !inner && dr > 1 });
  }
  return { L, R, W, col, gutter: g, lefts, rights, res };
}

// runs in the page: the columns drawn in, a numbered pin on each miss
function draw(gd) {
  const o = document.createElement('div');
  o.style.cssText = `position:absolute;left:0;top:0;width:100%;height:${document.documentElement.scrollHeight}px;pointer-events:none;z-index:2147483647`;
  for (const x of gd.lefts) {
    const c = document.createElement('div');
    c.style.cssText = `position:absolute;top:0;bottom:0;left:${x}px;width:${gd.col}px;background:rgba(255,138,128,.16);border-left:1px solid rgba(214,40,40,.45);border-right:1px solid rgba(214,40,40,.45)`;
    o.appendChild(c);
  }
  let n = 0;
  for (const r of gd.res) {
    if (!r.missL && !r.missR) continue;
    n++;
    const p = document.createElement('div');
    const x = r.missL ? r.x : r.x + r.w;
    p.textContent = n;
    p.style.cssText = `position:absolute;left:${x - 14}px;top:${r.y - 14}px;width:28px;height:28px;border-radius:50%;background:#ff8a80;color:#1d2030;font:700 16px/28px "Geist Mono",monospace;text-align:center;box-shadow:0 0 0 2px #fff`;
    o.appendChild(p);
    r.pin = n;
  }
  document.body.appendChild(o);
  return gd.res;
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
const misses = [];
let edges = 0;
for (const page of PAGES) {
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const p = await browser.newPage({ viewport: { width: w, height: 900 } });
      await p.goto(`${APP}/#/${page}`);
      await p.waitForTimeout(2500);
      if (theme === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'chip-dark'));
      await p.waitForTimeout(400);
      const gd = await p.evaluate(grid, BLOCKS);
      const judged = gd.res.filter((r) => !r.past);
      edges += judged.length;
      const miss = judged.filter((r) => r.missL || r.missR);
      if (miss.length) {
        gd.res = await p.evaluate(draw, gd);
        const file = `${page}-${w}-${theme}-grid.png`;
        await p.screenshot({ path: join(OUT, file), fullPage: true }).catch(() => {});
        for (const r of gd.res.filter((x) => x.pin)) misses.push({ page, at: `${w} ${theme}`, pin: r.pin, el: r.name, text: r.text, left: r.missL ? r.dl : 0, right: r.missR ? r.dr : 0, picture: file });
      }
      await p.close();
    }
  }
}
await browser.close();
writeFileSync(join(OUT, 'misses.json'), JSON.stringify(misses, null, 2));
console.log(`grid-sweep: ${misses.length} misses of ${edges} blocks`);
for (const m of misses) console.log(`${m.page} ${m.at} #${m.pin} ${m.el} "${m.text}"  left ${m.left}px  right ${m.right}px  ${m.picture}`);
process.exitCode = misses.length ? 1 : 0;
