// Responsive check (Elleta, 23 Nov 2026: "you didnt check it in responsive screen.. you should just do that every time
// please"). Opens every page at 1440, 1024, 768 and 320, in the Chip light and dark themes, and FAILS on
//   (a) sideways scroll: the page or any box not made to scroll reaches past the window's right edge,
//   (b) clipping: text, an icon or a control cut by a box that hides its overflow and does not scroll,
//   (c) overlap: two pieces of text drawn over each other,
//   (d) unstyled text: text that is not in Lexend or Geist Mono (the browser's own face showing through).
// It prints the matrix (pages by widths, light and dark) and what it measured, so it cannot pass on nothing. A full
// run (no --route or --width) leaves data/responsive.json, which on-system-guard.mjs reads before a commit that
// touches app/src/pages or the templates (the same watched files as check:cards).
// Usage: node scripts/responsive-check.mjs [--app http://localhost:3160] [--out dir] [--route '#/system/foundations'] [--width 320]
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';
import { RESPONSIVE_RECORD, fileHashes } from './lib/stage-leaders.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-responsive'));
const ONLY_ROUTE = arg('route', null);
const ONLY_WIDTH = arg('width', null);
const ROUTES = ['#/work', '#/health', '#/system/components', '#/system/foundations', '#/system/history', '#/playground', '#/system-map', '#/connectors', '#/team', '#/not-again'].filter((r) => !ONLY_ROUTE || r === ONLY_ROUTE);
const WIDTHS = [1440, 1024, 768, 320].filter((w) => !ONLY_WIDTH || w === Number(ONLY_WIDTH));
const THEMES = ['light', 'dark'];
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
mkdirSync(OUT, { recursive: true });

/* run in the page */
const measure = () => {
  const bad = [];
  const px = (v) => parseFloat(v) || 0;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || px(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}"`;
  const scrolls = (el) => /auto|scroll/.test(getComputedStyle(el).overflowX);
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) if (scrolls(p)) return true; return false; };
  // what a viewer can see of an element: its box cut by every ancestor that hides overflow or scrolls
  const seenRect = (el) => {
    const r = el.getBoundingClientRect();
    let o = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        o = { left: Math.max(o.left, q.left), right: Math.min(o.right, q.right), top: Math.max(o.top, q.top), bottom: Math.min(o.bottom, q.bottom) };
      }
    }
    return o.right - o.left > 1 && o.bottom - o.top > 1 ? o : null;
  };
  const W = innerWidth;
  // (a) sideways scroll
  if (document.documentElement.scrollWidth > W + 1) bad.push(`a) the page scrolls sideways: ${document.documentElement.scrollWidth}px in a ${W}px window`);
  const leaves = [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && el.textContent.trim() && visible(el) && !el.closest('script,style,svg,[aria-hidden="true"]') && el.getBoundingClientRect().width > 2 && seenRect(el));
  for (const el of leaves) {
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && !inScroller(el)) { bad.push(`a) ${label(el)} reaches ${Math.round(r.right - W)}px past the window`); if (bad.length > 12) break; }
  }
  // (b) clipping by a box that hides overflow and does not scroll
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (!(s.overflowX === 'hidden' || s.overflowX === 'clip') || scrolls(el) || !visible(el) || el.clientWidth <= 2) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.textContent.trim() && !/ellipsis/.test(s.textOverflow) && !el.closest('[aria-hidden="true"]')) bad.push(`b) ${label(el)} cuts its content by ${el.scrollWidth - el.clientWidth}px`);
  }
  // a fixed or sticky layer (header, dock, drawer) is meant to sit over what scrolls under it: its own text is
  // only compared with text in the same layer
  const layer = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return null; };
  // (c) overlap of text: two text boxes that share more than 2px both ways and neither holds the other
  // the text's own line boxes (a Range), never the element's box: padding, line-height room and a clamped
  // paragraph's hidden lines are not text a reader sees drawn over other text
  const lines = [];
  for (const el of leaves) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const clip = seenRect(el);
    for (const q of range.getClientRects()) {
      const r = { left: Math.max(q.left, clip.left), right: Math.min(q.right, clip.right), top: Math.max(q.top, clip.top), bottom: Math.min(q.bottom, clip.bottom) };
      if (r.right - r.left <= 2 || r.bottom - r.top <= 2) continue;
      // only text that is painted: on screen now, and not covered by something drawn over it (the other scroll
      // steps cover the rest of the page)
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
      lines.push({ el, r, layer: layer(el) });
    }
  }
  lines.sort((x, y) => x.r.top - y.r.top);
  for (let i = 0; i < lines.length && bad.length < 40; i++) {
    for (let j = i + 1; j < lines.length && lines[j].r.top < lines[i].r.bottom - 2; j++) {
      const a = lines[i].r, b = lines[j].r;
      const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left), dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (dx > 2 && dy > 2 && lines[i].layer === lines[j].layer && lines[i].el !== lines[j].el && !lines[i].el.contains(lines[j].el) && !lines[j].el.contains(lines[i].el)) bad.push(`c) ${label(lines[i].el)} overlaps ${label(lines[j].el)} by ${Math.round(dx)} x ${Math.round(dy)}px`);
    }
  }
  // (d) unstyled text: the first face is not Lexend or Geist Mono
  for (const el of leaves) {
    const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!/^(Lexend|Geist Mono)/i.test(fam) && !/icon/i.test(fam)) bad.push(`d) ${label(el)} is set in ${fam}`);
  }
  return { bad: [...new Set(bad)].slice(0, 12), texts: leaves.length };
};

const browser = await chromium.launch();
const results = [];
for (const route of ROUTES) {
  for (const w of WIDTHS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(`${APP}/${route}`, { waitUntil: 'load' });
      await p.waitForTimeout(1800);
      if (theme === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'chip-dark'));
      await p.waitForTimeout(300);
      // the page scrolls inside its own box: measure the whole content, not the first screen
      const m = { bad: [], texts: 0 };
      const scroller = '.chip-screen__content';
      const room = await p.evaluate((sel) => { const e = document.querySelector(sel); return e ? { h: e.scrollHeight, c: e.clientHeight } : { h: 0, c: 0 }; }, scroller);
      for (let y = 0; ; y += Math.max(200, Math.round(room.c * 0.7))) {
        await p.evaluate(([sel, top]) => { const e = document.querySelector(sel); if (e) e.scrollTop = top; }, [scroller, y]);
        const one = await p.evaluate(measure);
        m.bad.push(...one.bad.filter((b) => !m.bad.includes(b)));
        m.texts += one.texts;
        if (y + room.c >= room.h - 1) break;
      }
      const label = `${route} ${w} ${theme}`;
      results.push({ label, route, w, theme, bad: m.bad, texts: m.texts });
      if (m.bad.length) await p.screenshot({ path: join(OUT, `${route.replace(/\W+/g, '-')}-${w}-${theme}.png`) }).catch(() => {});
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));

// the matrix: one row per page, one column per width, light/dark each marked ok or FAIL
console.log(`${'page'.padEnd(26)}${WIDTHS.map((w) => String(w).padEnd(14)).join('')}`);
for (const route of ROUTES) {
  const cells = WIDTHS.map((w) => THEMES.map((t) => (results.find((r) => r.route === route && r.w === w && r.theme === t)?.bad.length ? 'FAIL' : 'ok')).join('/').padEnd(14));
  console.log(`${route.padEnd(26)}${cells.join('')}`);
}
for (const r of results.filter((x) => x.bad.length)) { console.log(`FAIL ${r.label}`); for (const b of r.bad) console.log(`   ${b}`); }
const failed = results.filter((r) => r.bad.length).length;
const texts = results.reduce((t, r) => t + r.texts, 0);
if (!texts) { console.log('responsive-check: no text found on any page, so nothing was measured'); process.exit(1); }
if (!ONLY_ROUTE && !ONLY_WIDTH) {
  const routes = Object.fromEntries(ROUTES.map((r) => [r, !results.some((x) => x.route === r && x.bad.length)]));
  writeFileSync(RESPONSIVE_RECORD, JSON.stringify({ at: new Date().toISOString(), files: fileHashes(), routes, ok: !failed, clean: results.length - failed, total: results.length, texts }, null, 1));
}
console.log(`responsive-check: ${results.length - failed} of ${results.length} page-widths clean · ${texts} text boxes measured · ${OUT}`);
process.exit(failed ? 1 : 0);
