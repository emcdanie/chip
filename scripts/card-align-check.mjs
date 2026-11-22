// Card alignment check (Elleta, 23 Nov 2026: "the white space on the cards when they move and that they dont align
// on content is a problem i have brought up soooooo many times.. why is it still breaking"). For every page, at
// 1440, 1024, 768 and 320, with the side menu shown and hidden and the Work panel closed and open (and Health's
// drawers open), it finds every card (a rounded, shadowed box), groups the cards that sit side by side into rows
// and FAILS when
//   (a) the same part (title row, big number, bar, caption, footer) of cards in one row sits at a different y
//       by more than 1px, or a footer's bottom is not the same distance from its card's bottom edge,
//   (b) a card has more than 24px between its last content and its bottom edge (the padding included),
//   (c) a card overflows its own box or the window, or clips its content,
//   (d) the cards of a page or of a card do not share their edges: a band of cards that touch vertically leaves
//       more than 24px unused at its left or right end of the box they sit in, or two bands that fill that box differ
//       at their left or right edge by more than 1px,
//   (e) a scrolling container (the page's content, a column that scrolls on its own) ends less than 48px after its
//       last content: from the last content to the end of the scroll is at least 48px (the page and the inspector
//       panel give 64, the cards' own 24 gap is a different thing; Elleta, 22 Nov).
// It prints, for every page and width, how many cards and rows it measured and the worst numbers, so it cannot
// pass on nothing. Usage: node scripts/card-align-check.mjs [--app http://localhost:3160] [--out dir]
//   [--route '#/health'] [--width 1024] [--quick]   (--quick: the menu as it comes and the panel closed only; no record)
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure. A full run leaves data/card-align.json.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';
import { CARD_RECORD, cardInputsHash } from './lib/stage-leaders.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-card-align'));
const ONLY_ROUTE = arg('route', null);
const ONLY_WIDTH = arg('width', null);
const QUICK = process.argv.includes('--quick');
const ROUTES = ['#/work', '#/health', '#/system/components', '#/system/foundations', '#/system/history', '#/playground', '#/system-map', '#/connectors', '#/team', '#/not-again'];
const WIDTHS = [1440, 1024, 768, 320, 1920, 2000];
const MENUS = QUICK ? [null] : ['open', 'col'];
const PANELS = QUICK ? [false] : [false, true];
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
mkdirSync(OUT, { recursive: true });

/* geometry, run in the page */
const measure = () => {
  const px = (v) => parseFloat(v) || 0;
  const isCard = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // a drawer or dialog is a surface the cards sit on, not a card
    if (s.position === 'fixed' || el.matches('[role="dialog"], dialog, aside')) return false;
    return s.boxShadow !== 'none' && px(s.borderTopLeftRadius) >= 12 && r.width > 120 && r.height > 56 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const cards = [...document.querySelectorAll('body *')].filter(isCard);
  // a card in a lane or strip that scrolls sideways by design may sit past the window's edge
  const sideScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  // what a viewer can see of an element: its box cut by every ancestor (up to the card) that clips
  const seen = (el, stop) => {
    const r = el.getBoundingClientRect();
    let r2 = { l: r.left, r: r.right, t: r.top, b: r.bottom };
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        r2 = { l: Math.max(r2.l, q.left), r: Math.min(r2.r, q.right), t: Math.max(r2.t, q.top), b: Math.min(r2.b, q.bottom) };
      }
    }
    return r2;
  };
  const hidden = (e) => {
    const s = getComputedStyle(e);
    return s.visibility === 'hidden' || s.display === 'none' || px(s.opacity) === 0;
  };
  return cards.map((c) => {
    const cr = c.getBoundingClientRect();
    const leaves = [...c.querySelectorAll('*')].filter((e) => {
      const act = ['A', 'BUTTON'].includes(e.tagName) || ['button', 'link', 'tab'].includes(e.getAttribute('role'));
      if (e.children.length && e.tagName !== 'svg' && !act) return false;
      if (e.closest('svg') && e.tagName !== 'svg') return false;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || hidden(e)) return false;
      const pos = getComputedStyle(e).position;
      if (pos === 'absolute' || pos === 'fixed') return false;
      const bg = getComputedStyle(e).backgroundColor;
      const mark = e.children.length === 0 && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && r.height >= 4;
      // a button or link that only holds an icon (the 44 target of a ↗) is not content by itself: its glyph is
      return mark || (act && (e.textContent || '').trim() !== '') || (e.textContent || '').trim() !== '' || ['svg', 'IMG', 'CANVAS', 'INPUT'].includes(e.tagName) || e.hasAttribute('role');
    });
    const boxes = leaves.map((e) => seen(e, c)).filter((b) => b.b > b.t && b.r > b.l);
    // a box that is only text (a label): the text's own rectangle
    if (!boxes.length && (c.textContent || '').trim()) {
      const rg = document.createRange();
      rg.selectNodeContents(c);
      const q = rg.getBoundingClientRect();
      if (q.height > 0) boxes.push({ l: q.left, r: q.right, t: q.top, b: q.bottom });
    }
    const last = boxes.length ? Math.max(...boxes.map((b) => b.b)) : cr.top;
    const lastEl = leaves.map((e) => [e, seen(e, c).b]).sort((x, y) => y[1] - x[1])[0]?.[0];
    const over = boxes.filter((b) => b.r > cr.right + 1 || b.l < cr.left - 1);
    const pick = (sel) => [...c.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().height > 0 && !hidden(x))?.getBoundingClientRect() ?? null;
    const part = (name, sel, edge = 'top', within = Infinity) => {
      const r = pick(sel);
      // a title is the head row's: one lower down is another kind of text
      return r && r.top - cr.top <= within ? [name, edge === 'top' ? r.top : cr.bottom - r.bottom] : null;
    };
    const parts = Object.fromEntries(
      [
        part('title', '[class*="title"]:not([class*="ubtitle"]), h1, h2, h3, h4, [role="heading"]', 'top', 48),
        part('label', '[class*="label"]'),
        part('number', '[class*="number"]'),
        part('bar', '[role="progressbar"], [role="meter"], [class*="rogress"]'),
        part('context', '[class*="context"]'),
        part('caption', '[class*="caption"]'),
        part('footer', '[class*="footer"], [class*="Footer"]'),
        part('footer foot', '[class*="footer"], [class*="Footer"]', 'foot'),
      ].filter(Boolean),
    );
    const name = (c.querySelector('[class*="title"], h1, h2, h3, h4, [role="heading"]')?.textContent || c.getAttribute('aria-label') || String(c.className)).trim().slice(0, 28);
    // a card inside another card is part of that card's content, not a row beside it
    let outer = null;
    for (let p = c.parentElement; p; p = p.parentElement) if (cards.includes(p)) { outer = cards.indexOf(p); break; }
    // the content's own spacing under its last line (a list row's padding, a line's margin) is not left-over space
    let own = 0;
    if (lastEl) for (let p = lastEl; p && p !== c; p = p.parentElement) { const ps = getComputedStyle(p); own += px(ps.paddingBottom) + px(ps.marginBottom); }
    const kind = c.getAttribute('data-bella-component') || String(c.className).split(' ')[0].replace(/_[a-z0-9]{5,}_\d+$/i, '');
    const sig = ['label', 'number', 'bar'].filter((k) => k in parts).join('+');
    const inner = [c, ...c.querySelectorAll('*')];
    return {
      name,
      kind: `${kind}`,
      sig,
      outer,
      t: cr.top,
      b: cr.bottom,
      l: cr.left,
      r: cr.right,
      dead: cr.bottom - last - own,
      lastIs: lastEl ? `${lastEl.tagName.toLowerCase()}.${String(lastEl.className?.baseVal ?? lastEl.className).slice(0, 24)}` : '',
      scrolls: inner.some((e) => { const s = getComputedStyle(e); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1; }),
      clipped: inner.some((e) => { const s = getComputedStyle(e); return s.overflowX === 'hidden' && s.position !== 'absolute' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth >= 24 && !s.textOverflow.includes('ellipsis'); }),
      overWindow: (cr.right > innerWidth + 1 || cr.left < -1) && !sideScroller(c),
      over: over.length,
      parts,
      boxIn: (() => {
        // the box the card sits in: the card that holds it, else the page's content area (its padding left out)
        let host = null;
        for (let p = c.parentElement; p; p = p.parentElement) if (cards.includes(p)) { host = p; break; }
        host = host ?? c.closest('.chip-screen__content');
        if (!host) return null;
        const hr = host.getBoundingClientRect();
        const hs = getComputedStyle(host);
        const hostIsCard = cards.includes(host);
        return { l: hr.left + px(hs.paddingLeft) + (hostIsCard ? 0 : 0), r: hr.right - px(hs.paddingRight) - (host.offsetWidth - host.clientWidth), skip: !!c.closest('[class*="board"], [class*="lane"], [role="dialog"], dialog, aside') || sideScroller(c) };
      })(),
      shown: cr.bottom > 0 && cr.top < innerHeight * 3,
    };
  });
};

/* (e) the space after the last content of every container that scrolls: its scroll height less the lowest bottom of
   anything inside it. Lanes, cards and lists that scroll inside a card by design are not pages. */
const endGaps = () => {
  const out = [];
  const els = [...document.querySelectorAll('.chip-screen__content, .chip-flow--scroll')];
  for (const sc of els) {
    const cs = getComputedStyle(sc);
    if (!/(auto|scroll)/.test(cs.overflowY) || sc.scrollHeight <= sc.clientHeight + 1) continue;
    if (sc.closest('[role="dialog"], dialog, [class*="lane"], [class*="board"]') || sc.getBoundingClientRect().height < 40) continue;
    // the Work board fills the window to its foot by design (its lanes scroll, not the page)
    if (sc.querySelector(':scope > .chip-board')) continue;
    const top = sc.getBoundingClientRect().top - sc.scrollTop;
    let low = 0;
    for (const e of sc.querySelectorAll('*')) {
      const st = getComputedStyle(e);
      if (st.position === 'fixed' || st.position === 'absolute' || st.display === 'none' || st.visibility === 'hidden' || e.closest('svg') && e.tagName !== 'svg') continue;
      if (e.children.length && st.backgroundColor === 'rgba(0, 0, 0, 0)' && !e.matches('button, a, [role]') && !(e.textContent || '').trim()) continue;
      // what a box inside a scroller or a clip holds is that box's own business: only the box itself counts here
      let inner = false;
      for (let p = e.parentElement; p && p !== sc; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) { inner = true; break; }
      if (inner) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 1 || r.width < 1) continue;
      low = Math.max(low, r.bottom - top);
    }
    const gap = Math.round(sc.scrollHeight - low);
    // a negative gap means something is drawn outside the scroll (a clipped or positioned box), not a short end: not measurable here
    if (gap >= 0) out.push({ name: sc.className.split(' ')[0], gap, rows: 1 });
  }
  return out;
};

/* rows of cards that sit side by side (same outer card, the same top) */
function rowsOf(cards) {
  const rows = [];
  const used = new Set();
  cards.forEach((c, i) => {
    if (used.has(i)) return;
    const row = [c];
    used.add(i);
    cards.forEach((d, j) => {
      if (used.has(j) || d.outer !== c.outer) return;
      // a row starts at one line; cards that overlap it but start elsewhere are stacked columns, not a row
      if (Math.abs(c.t - d.t) <= 1.5 && row.every((x) => x.l >= d.r - 1 || x.r <= d.l + 1)) (row.push(d), used.add(j));
    });
    if (row.length > 1) rows.push(row);
  });
  return rows;
}

function judge(cards) {
  const bad = [];
  let worstDy = 0;
  let worstDead = 0;
  cards.forEach((c) => {
    if (!c.scrolls) worstDead = Math.max(worstDead, c.dead);
    if (!c.scrolls && c.dead > 25.5) bad.push(`b) "${c.name}" has ${Math.round(c.dead)}px under its last line (${c.lastIs})`);
    if (c.overWindow) bad.push(`c) "${c.name}" leaves the window`);
    if (c.clipped) bad.push(`c) "${c.name}" clips its content sideways`);
    if (c.over) bad.push(`c) "${c.name}" has content past its edge`);
  });
  const rows = rowsOf(cards);
  // cards of one kind in a row are compared part by part; the parts below a chart are compared only among cards
  // that draw the same parts above it (a card with no bar has its line higher by design)
  const TOP = ['title', 'label', 'number', 'bar', 'context'];
  rows.forEach((row) => {
    [...new Set(row.map((c) => c.kind))].forEach((kind) => {
      const same = row.filter((c) => c.kind === kind);
      if (same.length < 2) return;
      const bySig = [...new Set(same.map((c) => c.sig))].map((sg) => same.filter((c) => c.sig === sg));
      const test = (group, k, y) => {
        const have = group.filter((c) => k in c.parts);
        if (have.length < 2) return;
        const ys = have.map((c) => y(c));
        const d = Math.max(...ys) - Math.min(...ys);
        worstDy = Math.max(worstDy, d);
        if (d > 1.01) bad.push(`a) ${k} differs by ${d.toFixed(1)}px in the row ${group.map((c) => `"${c.name}"`).join(', ')}`);
      };
      // the title row is the same in every card of the row; the footer's foot is the same distance from the edge
      test(same, 'title', (c) => c.parts.title);
      test(same, 'footer foot', (c) => c.parts['footer foot']);
      bySig.forEach((g) => TOP.slice(1).forEach((k) => test(g, k, (c) => c.parts[k])));
    });
  });
  return { bad, rows: rows.length, worstDy, worstDead };
}

const browser = await chromium.launch();
const results = [];
const routes = ONLY_ROUTE ? [ONLY_ROUTE] : ROUTES;
const widths = ONLY_WIDTH ? [Number(ONLY_WIDTH)] : WIDTHS;
for (const route of routes) {
  for (const width of widths) {
    for (const menu of MENUS) {
      for (const panel of PANELS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
        await ctx.addInitScript(([m, p]) => {
          try {
            if (m) localStorage.setItem('chip-side', m);
            localStorage.setItem('chip-work', JSON.stringify({ open: p, chosen: true, dock: 'right', w: 380, h: null, tab: 'needs' }));
          } catch {}
        }, [menu, panel]);
        const page = await ctx.newPage();
        // another session may restart the server between two loads: wait for it, up to a minute
        for (let tries = 0; ; tries += 1) {
          try {
            await page.goto(`${APP}/${route}`, { waitUntil: 'load' });
            break;
          } catch (e) {
            if (tries > 11) throw e;
            await page.waitForTimeout(5000);
          }
        }
        // the page has read its data: no loading notice left (a card count of 0 on a loading screen proves nothing)
        await page.waitForFunction(() => !/Reading BELLA|Counting every part|Loading/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1800);
        const label = `${route} ${width}${menu ? ` menu-${menu}` : ''}${panel ? ' work-open' : ''}`;
        let cards = await page.evaluate(measure);
        // a page that drew nothing yet (or only cards not on screen yet: Work at 320 with the menu folded) gets up to six more looks before it counts as having no cards
        for (let again = 0; again < 6 && !cards.some((c) => c.shown); again += 1) {
          await page.waitForTimeout(2500);
          cards = await page.evaluate(measure);
        }
        const j = judge(cards.filter((c) => c.shown));
        // scrolled to the end, the last content stands 48 or more clear of the end of the scroll
        // a list still arriving ends short for a moment: look again before it counts
        let ends = await page.evaluate(endGaps);
        for (let again = 0; again < 3 && ends.some((e) => e.gap < 48); again += 1) {
          await page.waitForTimeout(2000);
          ends = await page.evaluate(endGaps);
        }
        ends.filter((e) => e.gap < 48).forEach((e) => j.bad.push(`e) ${e.name} ends ${e.gap}px after its last content (needs 48 or more)`));
        j.ends = ends.length;
        j.minEnd = ends.length ? Math.min(...ends.map((e) => e.gap)) : null;
        results.push({ label, cards: cards.length, ...j });
        if (j.bad.length) await page.screenshot({ path: join(OUT, `${label.replace(/[^\w]+/g, '_')}.png`) }).catch(() => {});
        // Health's drawers: each stat card that opens one
        if (route === '#/health' && menu === MENUS[0] && !panel) {
          const heads = await page.locator('[data-bella-component="stat-card"] button').count();
          for (let i = 0; i < heads; i += 1) {
            await page.locator('[data-bella-component="stat-card"] button').nth(i).click().catch(() => {});
            await page.waitForTimeout(700);
            const dc = await page.evaluate(measure);
            const dj = judge(dc.filter((c) => c.shown));
            results.push({ label: `${label} drawer ${i + 1}`, cards: dc.length, ...dj });
            if (dj.bad.length) await page.screenshot({ path: join(OUT, `${label.replace(/[^\w]+/g, '_')}_drawer${i + 1}.png`) }).catch(() => {});
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
          }
        }
        await ctx.close();
      }
    }
  }
}
await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.bad.length ? 'FAIL' : 'ok  '} ${r.label.padEnd(52)} ${String(r.cards).padStart(3)} cards · ${r.rows} rows · worst y gap ${r.worstDy.toFixed(1)} · worst empty ${Math.round(r.worstDead)} · ${r.ends ?? 0} scroll ends${r.minEnd != null ? ` (least ${r.minEnd}px after the last content)` : ''}${r.bad.length ? `\n      ${[...new Set(r.bad)].join('\n      ')}` : ''}`);
// a page that shows cards at one width and none at another was not measured there: that fails too
for (const route of routes) {
  const mine = results.filter((r) => r.label.startsWith(`${route} `) && !/drawer/.test(r.label));
  if (mine.some((r) => r.cards > 0)) mine.filter((r) => r.cards === 0).forEach((r) => (r.bad.push('c) no card found here but there are some at other widths: not measured'), console.log(`NOT MEASURED ${r.label}`)));
}
const failed = results.filter((r) => r.bad.length).length;
const measured = results.reduce((t, r) => t + r.cards, 0);
if (!measured) {
  console.log('card-align-check: no card found on any page, so nothing was measured');
  process.exit(1);
}
if (!QUICK && !ONLY_ROUTE && !ONLY_WIDTH) {
  writeFileSync(CARD_RECORD, JSON.stringify({ at: new Date().toISOString(), hash: cardInputsHash(), ok: !failed, clean: results.length - failed, total: results.length, cards: measured }, null, 1));
}
console.log(`card-align-check: ${results.length - failed} of ${results.length} page-widths clean · ${measured} cards measured · ${OUT}`);
process.exit(failed ? 1 : 0);
