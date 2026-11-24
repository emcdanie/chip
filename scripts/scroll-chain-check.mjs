// Scroll chain check (Elleta, 22 Nov 2026: "if there is a card like in history and you scroll inside and get to the
// bottom then it just stops and you have to move and click on to scroll the page"). Opens every page at 1440 and 320,
// plus the reading drawers on Health, finds every box that scrolls on its own (overflow auto or scroll and content
// taller than the box) and, for each one, sends real wheel events (page.mouse.wheel) over it until it is at its end,
// then keeps wheeling. FAILS when
//   (a) the page does not move within 400ms of the inner box being at its end (a scroll trap), while the page has room, or
//   (c) SQUEEZED (23 Nov: "the scroll on the main board is messed up and I can't scroll down the entire page"): a box that scrolls on
//       its own, holds much more than it shows, is under 320px tall, and the page around it has no room to scroll (the Work board was only
//       as tall as the window's leftover, 355px at 1440x800, so every lane scrolled in a small strip and nothing moved the page), or
//   (d) the page's own scroller, driven by real wheel events over its side gutter (no inner box under the pointer), does not reach its end, or
//       its last content ends less than 48px above the scroller's foot (the 22 Nov page-end rule), or
//   (b) a scroller sets overscroll-behavior contain or none and is not a modal drawer or a panel of its own
//       (the page's own scroller and the drawers are the only ones allowed).
// A scroller with no keyboard way in (no tabindex and no name) is listed as a warning, not a failure.
// It prints every scroller found, so it cannot pass on nothing. Usage: node scripts/scroll-chain-check.mjs [--app http://localhost:3160] [--route '#/system/history'] [--width 320]
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { bellaDir } from './lib/bella-dir.mjs';
import { SCROLL_RECORD, scrollInputsHash, mergeRouteRecord } from './lib/stage-leaders.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const ONLY_ROUTE = arg('route', null);
const ONLY_WIDTH = arg('width', null);
const ROUTES = ['#/work', '#/health', '#/health/audits', '#/system/components', '#/system/foundations', '#/system/history', '#/playground', '#/system-map', '#/connectors', '#/team', '#/not-again'].filter((r) => !ONLY_ROUTE || r === ONLY_ROUTE);
const WIDTHS = [1440, 1024, 768, 320].filter((w) => !ONLY_WIDTH || w === Number(ONLY_WIDTH));
const DRAWERS = [/^Drift from BELLA/, /^Gaps/, /^BELLA system/];
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');

/* run in the page: tag every scroller with data-sc and describe it */
const scan = () => {
  document.querySelectorAll('[data-sc]').forEach((e) => e.removeAttribute('data-sc'));
  const out = [];
  const name = (e) => {
    const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${c ? '.' + c : ''}`;
  };
  const isPage = (e) => e.classList.contains('chip-screen__content');
  [...document.querySelectorAll('*')].forEach((e) => {
    const s = getComputedStyle(e);
    const y = /(auto|scroll)/.test(s.overflowY);
    const oc = s.overscrollBehaviorY;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === 'hidden') return;
    if (e.querySelector('.chip-screen__content')) return; // the app frame around the page
    const scrolls = y && e.scrollHeight > e.clientHeight + 1;
    const contains = oc === 'contain' || oc === 'none';
    if (!scrolls && !(y && contains)) return;
    const modal = !!e.closest('dialog');
    const panel = !!e.closest('.wp-body, .wp-ask, .obi-thread, .wp-bottom');
    e.setAttribute('data-sc', String(out.length));
    let up = e.parentElement;
    while (up && !(/(auto|scroll)/.test(getComputedStyle(up).overflowY) && up.scrollHeight > up.clientHeight + 1)) up = up.parentElement;
    const pageEl = e.closest('.chip-screen__content');
    out.push({
      i: out.length, pageRoom: pageEl ? pageEl.scrollHeight - pageEl.clientHeight : 0, name: name(e), page: isPage(e), modal, panel, scrolls, oc,
      h: Math.round(r.height), sh: e.scrollHeight,
      key: e.tabIndex >= 0 || !!e.getAttribute('aria-label') || !!e.getAttribute('aria-labelledby') || e.matches('textarea,input,select'),
      text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
    });
  });
  return out;
};

const state = (i) => document.querySelector(`[data-sc="${i}"]`);
let bad = 0;
const STARTED_HASH = scrollInputsHash();
const perRoute = {}; // route -> { bad, total }, for the per-route record
const tally = (route, ok) => { const t = (perRoute[route] ??= { bad: 0, total: 0 }); t.total++; if (!ok) t.bad++; };
let total = 0;
const rows = [];

const wheelTest = async (page, sc) => {
  // the page scroller for this scroller: the nearest scrollable ancestor with room
  const info = await page.evaluate((i) => {
    const el = document.querySelector(`[data-sc="${i}"]`);
    el.scrollIntoView({ block: 'center' });
    let p = el.parentElement;
    while (p && !(/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1)) p = p.parentElement;
    if (p) p.setAttribute('data-sc-up', '1');
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 200), y: r.top + Math.min(r.height / 2, 200), upRoom: p ? p.scrollHeight - p.clientHeight - p.scrollTop : 0, hasUp: !!p };
  }, sc.i);
  await page.mouse.move(info.x, info.y);
  const pos = () => page.evaluate((i) => {
    const el = document.querySelector(`[data-sc="${i}"]`);
    const up = document.querySelector('[data-sc-up]');
    return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight, up: up ? up.scrollTop : 0 };
  }, sc.i);
  // a continuous gesture: wheel steps 16ms apart until the inner box stops moving
  for (let n = 0; n < 60; n++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(16);
    const p = await pos();
    if (p.max - p.top < 1) break;
  }
  const before = await pos();
  if (before.max - before.top >= 1) return { verdict: 'could not reach its end' };
  // keep wheeling, still the same gesture, then watch 400ms
  for (let n = 0; n < 6; n++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  const after = await pos();
  const moved = after.up - before.up;
  await page.evaluate(() => document.querySelectorAll('[data-sc-up]').forEach((e) => e.removeAttribute('data-sc-up')));
  if (!info.hasUp || info.upRoom < 4) return { verdict: 'page has no room', ok: true };
  return moved > 0 ? { verdict: `chains (+${Math.round(moved)}px)`, ok: true } : { verdict: 'TRAP: page did not move', ok: false };
};

/* (d) real wheel over the page's side gutter (x=8 of the content: no inner box under the pointer) until it stops, then End and PageDown from focus */
const pageEnd = async (page, width) => {
  const r = await page.evaluate(() => {
    const el = document.querySelector('.chip-screen__content');
    if (!el) return null;
    el.scrollTop = 0;
    const b = el.getBoundingClientRect();
    // the side gutter, at a height where nothing clickable sits (at 1024 the Work board's lanes reach the gutter, and a click
    // on a card opens the part and leaves the page); the middle if every height has something
    const x = b.left + 4;
    for (let y = b.top + b.height / 2, d = 0; d < b.height / 2 - 20; d += 12) {
      for (const yy of [y + d, y - d]) {
        const hit = document.elementFromPoint(x, yy);
        if (hit && el.contains(hit) && !hit.closest('a, button, [role=button], [role=link], input, select, textarea, [tabindex]:not([tabindex="-1"]), [data-bella-component="card"]')) return { x, y: yy };
      }
    }
    return { x, y: b.top + b.height / 2 };
  });
  if (!r) return { ok: false, text: 'no .chip-screen__content' };
  await page.mouse.move(r.x, r.y);
  for (let n = 0; n < 120; n++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(8); }
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const el = document.querySelector('.chip-screen__content');
    const foot = el.getBoundingClientRect().bottom;
    let last = 0;
    el.querySelectorAll('*').forEach((e) => {
      const q = e.getBoundingClientRect();
      const shut = e.closest('details:not([open])'); // a closed disclosure's body has a box but is not shown
      if (shut && !e.closest('summary')) return;
      if (!q.height || getComputedStyle(e).position === 'absolute' || getComputedStyle(e).position === 'fixed') return;
      for (let p = e.parentElement; p && p !== el; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(hidden|auto|scroll|clip)/.test(s.overflowY) && p.getBoundingClientRect().bottom < q.bottom - 1) return; // clipped by a box of its own
      }
      last = Math.max(last, q.bottom);
    });
    return { left: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop), room: el.scrollHeight - el.clientHeight, after: Math.round(foot - last) };
  });
  // keyboard: click the page's side gutter (focus goes into the page, nothing is pressed), then PageDown must move it and End must reach the end
  const kb = [];
  if (m.room > 4) {
    await page.evaluate(() => { document.querySelector('.chip-screen__content').scrollTop = 0; });
    await page.mouse.click(r.x, r.y);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);
    const pd = await page.evaluate(() => document.querySelector('.chip-screen__content').scrollTop);
    await page.keyboard.press('End');
    await page.waitForTimeout(900);
    const en = await page.evaluate(() => { const e = document.querySelector('.chip-screen__content'); return e.scrollHeight - e.clientHeight - e.scrollTop; });
    if (pd < 1) kb.push('PageDown did not move the page');
    if (en > 2) kb.push(`End stopped ${Math.round(en)}px short`);
  }
  const notes = kb;
  if (m.left > 2) notes.push(`wheel stopped ${m.left}px short of the end`);
  if (m.after < 48) notes.push(`last content ends ${m.after}px above the foot (needs 48+)`);
  return { ok: !notes.length, text: notes.length ? notes.join('; ') : `wheel reaches the end, ${m.after}px after the last content (room ${m.room}px)` };
};

const browser = await chromium.launch();
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const targets = ROUTES.map((r) => ({ label: r, route: r }));
  if (!ONLY_ROUTE || ONLY_ROUTE === '#/health') DRAWERS.forEach((d) => targets.push({ label: `#/health drawer ${d.source.replace(/[\^\\]/g, '')}`, route: '#/health', drawer: d }));
  for (const t of targets) {
    await page.goto(`${APP}/${t.route}`);
    await page.reload();
    await page.waitForTimeout(2500);
    // the page has settled before it is measured, as card-align-check (24 Nov: Health at 320, 768 and 1024 read
    // "card not found" on a busy server): no loading notice, the reads quiet, nothing marked aria-busy
    await page.waitForFunction(() => !/Reading BELLA|Counting every part|Loading/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
    if (t.drawer) {
      const card = page.locator('button', { hasText: t.drawer }).first();
      await card.waitFor({ timeout: 15000 }).catch(() => {});
      if (!(await card.count())) { console.log(`FAIL ${width} ${t.label}: card not found`); bad++; tally(t.route, false); continue; }
      await card.click();
      await page.waitForTimeout(1200);
    }
    const list = await page.evaluate(scan);
    for (const sc of list) {
      total++;
      const notes = [];
      let ok = true;
      let verdict = '';
      const contains = sc.oc === 'contain' || sc.oc === 'none';
      if (contains && !sc.page && !sc.modal && !sc.panel) { ok = false; notes.push(`overscroll-behavior ${sc.oc}, not a drawer or panel`); }
      if (sc.scrolls && !sc.page && !sc.modal && !sc.panel) {
        const w = await wheelTest(page, sc);
        verdict = w.verdict;
        if (w.ok === false) { ok = false; notes.push(w.verdict); }
      } else verdict = sc.page ? 'the page' : sc.modal ? 'drawer (contain allowed)' : sc.panel ? 'panel (contain allowed)' : 'not scrolling here';
      if (sc.scrolls && !sc.page && !sc.modal && !sc.panel && sc.h < 320 && sc.sh > sc.h * 1.5 && sc.pageRoom < 4) { ok = false; notes.push(`SQUEEZED: ${sc.h}px box holds ${sc.sh}px and the page cannot scroll`); }
      if (sc.scrolls && !sc.key && !sc.page) notes.push('warn: no keyboard way in (tabindex 0 + name)');
      if (!ok) bad++;
      tally(t.route, ok);
      rows.push(`${ok ? 'ok  ' : 'FAIL'} ${width} ${t.label} | ${sc.name} "${sc.text}" ${sc.h}/${sc.sh}px oc=${sc.oc} | ${verdict}${notes.length ? ' | ' + notes.join('; ') : ''}`);
    }
    if (!t.drawer) {
      total++;
      const end = await pageEnd(page, width);
      if (!end.ok) bad++;
      tally(t.route, end.ok);
      rows.push(`${end.ok ? 'ok  ' : 'FAIL'} ${width} ${t.label} | the page | ${end.text}`);
    }
    if (t.drawer) await page.keyboard.press('Escape');
  }
  await page.close();
}
await browser.close();
console.log(rows.join('\n'));
if (!ONLY_WIDTH) {
  // per route, merged: running one route again leaves the others' results as they were
  const mine = Object.fromEntries(ROUTES.map((r) => [r, { hash: STARTED_HASH, ok: !perRoute[r]?.bad && !!perRoute[r]?.total, bad: perRoute[r]?.bad ?? 0, total: perRoute[r]?.total ?? 0 }]));
  mergeRouteRecord(SCROLL_RECORD, mine);
}
console.log(`\nscroll-chain-check: ${total} scrollers, ${bad} failing.`);
if (!total) { console.log('measured nothing: the check cannot pass on nothing'); process.exit(1); }
process.exit(bad ? 1 : 0);
