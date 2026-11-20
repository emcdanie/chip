// Clip sweep: finds anything clipped on every CHIP page, measured, not guessed
// (Elleta, 21 Nov 2026: "make sure it check the UI pixel perfect becuase alot of
// stuff is clipped like the cards, table corener etc"). Runs before every report.
//
// Per page, width (320, 768, 1024, 1100, 1440), theme (Chip light, dark) and
// Work drawer (closed, open) it measures:
//   shadow  an element's box-shadow is cut by a clipping ancestor's edge while
//           the element sits inside it, and is still 1% ink or more at the cut
//   content text, an icon or a control is cut by a clipping ancestor that
//           does not scroll (overflow hidden or clip)
//   corner  a filled child pokes past its rounded parent's corner (the child
//           touches the corner, has a smaller radius and nothing clips it)
//   ring    a control's real focus ring (focused, its outline read) would be
//           cut by a clipping or scrolling ancestor's edge
// Each hit names the element, the clipping ancestor and the overhang in px, and
// gets a 100% picture of the ancestor with the element outlined.
//
// Usage: node scripts/clip-sweep.mjs [--app http://localhost:3160] [--out dir]
//        [--pages work,health] [--widths 1100] [--themes light]
// Needs a CHIP server and Playwright in BELLA_DIR (as checkpoint.mjs).
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
const OUT = arg('out', join(tmpdir(), 'chip-clip-sweep'));
const PAGES = arg('pages', 'work,health,components,foundations,history,playground,not-again,team,system-map,connectors').split(',');
const WIDTHS = arg('widths', '320,768,1024,1100,1440').split(',').map(Number);
const THEMES = arg('themes', 'light,dark').split(',');
const DRAWER = arg('drawer', 'closed,open').split(',');

const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');

// runs in the page: every clipped thing, measured
function measure() {
  const RING = 8; // focus ring 4 wide + 4 gap, outside (READ FIRST: focus ring)
  const hits = [];
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    if (!el || el === document.documentElement) return 'html';
    const cls = [...el.classList].map((c) => c.replace(/_[a-z0-9]{5}_\d+$/i, '').replace(/^_/, '')).filter(Boolean).slice(0, 2).join('.');
    const label = el.getAttribute('aria-label') || (el.children.length === 0 ? el.textContent.trim().slice(0, 24) : '');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${label ? ` "${label}"` : ''}`;
  };
  const path = (el) => {
    const out = [];
    for (let e = el; e && e !== document.body && out.length < 4; e = e.parentElement) out.unshift(name(e));
    return out.join(' > ');
  };
  const clips = (el) => {
    const s = getComputedStyle(el);
    return { x: s.overflowX !== 'visible', y: s.overflowY !== 'visible', scrolls: /auto|scroll/.test(s.overflowX + s.overflowY), s };
  };
  // the ancestor's clip box: its padding box (inside the border)
  const clipBox = (a) => {
    const r = a.getBoundingClientRect();
    const s = getComputedStyle(a);
    return { l: r.left + parseFloat(s.borderLeftWidth), t: r.top + parseFloat(s.borderTopWidth), r: r.left + parseFloat(s.borderLeftWidth) + a.clientWidth, b: r.top + parseFloat(s.borderTopWidth) + a.clientHeight };
  };
  const ancestorsClipping = (el) => {
    const out = [];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const c = clips(a);
      if (c.x || c.y) out.push({ a, ...c });
      if (getComputedStyle(a).position === 'fixed') break;
    }
    return out;
  };
  const inside = (r, b, slack = 0.5) => r.left >= b.l - slack && r.right <= b.r + slack && r.top >= b.t - slack && r.bottom <= b.b + slack;
  const over = (ext, b, c) => {
    const o = { l: c.x ? b.l - ext.l : 0, r: c.x ? ext.r - b.r : 0, t: c.y ? b.t - ext.t : 0, b: c.y ? ext.b - b.b : 0 };
    const sides = Object.entries(o).filter(([, v]) => v > 1).map(([k, v]) => `${k}${Math.round(v)}`);
    return sides.length ? sides.join(' ') : null;
  };
  // a cut shadow counts when the shadow is still visible at the clip line: each layer's
  // strength there is alpha × (1 − Φ(distance / σ)), σ = blur / 2 (the CSS blur), summed;
  // 1% ink or more reads as a hard edge. Returns per side the strength, or null.
  const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  const tail = (d, blur) => (d <= 0 ? 1 : blur <= 0 ? 0 : 0.5 * (1 - erf(d / (blur / 2) / Math.SQRT2)));
  const layers = (el) => {
    const sh = getComputedStyle(el).boxShadow;
    if (!sh || sh === 'none') return [];
    return sh.split(/,(?![^(]*\))/).filter((part) => !/inset/.test(part)).map((part) => {
      const col = part.match(/rgba?\(([^)]*)\)/)?.[1].split(/[\s,\/]+/).filter(Boolean) ?? [];
      const alpha = col.length > 3 ? parseFloat(col[3]) : 1;
      const [x = 0, y = 0, blur = 0, spread = 0] = (part.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
      return { alpha, x, y, blur, spread };
    }).filter((l) => l.alpha > 0);
  };
  const shadowCut = (ls, r, b, c) => {
    // gap from the box edge to the clip line, and the layer's push toward that side
    const sides = { l: [r.left - b.l, (l) => -l.x], r: [b.r - r.right, (l) => l.x], t: [r.top - b.t, (l) => -l.y], b: [b.b - r.bottom, (l) => l.y] };
    const out = [];
    for (const [k, [gap, push]] of Object.entries(sides)) {
      if ((k === 'l' || k === 'r') && !c.x) continue;
      if ((k === 't' || k === 'b') && !c.y) continue;
      const ink = ls.reduce((sum, l) => sum + l.alpha * tail(gap - push(l) - l.spread, l.blur), 0);
      if (ink >= 0.01) out.push(`${k}${Math.round(gap)} ${(ink * 100).toFixed(1)}%`);
    }
    return out.length ? out.join(', ') : null;
  };
  const opaque = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  const all = [...document.body.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement && el.tagName !== 'svg') && vis(el));
  for (const el of all) {
    const r = el.getBoundingClientRect();
    // in the viewport only: what she sees
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const anc = ancestorsClipping(el);
    const leaf = el.tagName === 'svg' || el.tagName === 'IMG' || (el.childElementCount === 0 && el.textContent.trim()) || /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    // shadow
    const ls = layers(el);
    if (ls.length) for (const { a, x, y } of anc) {
      const b = clipBox(a);
      if (!inside(r, b)) break; // scrolled out or itself cut: content check covers it
      const o = shadowCut(ls, r, b, { x, y });
      if (o) { hits.push({ kind: 'shadow', el: path(el), by: name(a), over: `gap and ink at the cut: ${o}`, box: [r.left, r.top, r.width, r.height], clip: [b.l, b.t, b.r - b.l, b.b - b.t] }); break; }
    }
    // content cut by a clip that does not scroll
    if (leaf) for (const { a, x, y, scrolls } of anc) {
      if (scrolls) break;
      const b = clipBox(a);
      // wholly outside is hidden on purpose (a mask, Button's label roll); only a part cut counts
      const apart = r.right <= b.l + 0.5 || r.left >= b.r - 0.5 || r.bottom <= b.t + 0.5 || r.top >= b.b - 0.5;
      const o = apart ? null : over({ l: r.left, r: r.right, t: r.top, b: r.bottom }, b, { x, y });
      if (o && !a.matches('[class*=srOnly], .sr-only, [class*=visually]') && !el.closest('[class*=srOnly], .sr-only')) { hits.push({ kind: 'content', el: path(el), by: name(a), over: o, box: [r.left, r.top, r.width, r.height], clip: [b.l, b.t, b.r - b.l, b.b - b.t] }); break; }
    }
    // focus ring: focus it, read the ring it really draws (outline outside its box, or a
    // box-shadow ring), and test that against each clipping ancestor
    if (el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') && !el.disabled) {
      const cands = anc.filter(({ a }) => inside(r, clipBox(a)));
      const near = cands.some(({ a, x, y }) => over({ l: r.left - RING, r: r.right + RING, t: r.top - RING, b: r.bottom + RING }, clipBox(a), { x, y }));
      if (near) {
        el.focus({ preventScroll: true, focusVisible: true });
        const fs = getComputedStyle(el);
        const ring = fs.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(fs.outlineWidth) + parseFloat(fs.outlineOffset));
        const sh = Math.max(0, ...layers(el).map((l) => l.spread));
        el.blur();
        const R = Math.max(ring, sh);
        for (const { a, x, y } of cands) {
          const b = clipBox(a);
          const o = R ? over({ l: r.left - R, r: r.right + R, t: r.top - R, b: r.bottom + R }, b, { x, y }) : null;
          if (o) { hits.push({ kind: 'ring', el: path(el), by: name(a), over: `${o} (ring ${R})`, box: [r.left - R, r.top - R, r.width + 2 * R, r.height + 2 * R], clip: [b.l, b.t, b.r - b.l, b.b - b.t] }); break; }
        }
      }
    }
    // corner: a filled child poking past this element's rounded corner
    const s = getComputedStyle(el);
    const rad = { tl: parseFloat(s.borderTopLeftRadius), tr: parseFloat(s.borderTopRightRadius), bl: parseFloat(s.borderBottomLeftRadius), br: parseFloat(s.borderBottomRightRadius) };
    if (Math.max(rad.tl, rad.tr, rad.bl, rad.br) >= 4 && s.overflow === 'visible') {
      const bw = parseFloat(s.borderLeftWidth);
      for (const d of el.querySelectorAll('*')) {
        if (!vis(d)) continue;
        const ds = getComputedStyle(d);
        if (!opaque(ds.backgroundColor) && ds.backgroundImage === 'none') continue;
        // clipped on the way up to el? then the clip handles it
        let clipped = false;
        for (let p = d.parentElement; p && p !== el; p = p.parentElement) if (getComputedStyle(p).overflow !== 'visible' && parseFloat(getComputedStyle(p).borderTopLeftRadius) > 0) clipped = true;
        if (clipped) continue;
        const dr = d.getBoundingClientRect();
        const near = (u, v) => Math.abs(u - v) <= bw + 1;
        const corners = [
          ['tl', near(dr.left, r.left) && near(dr.top, r.top), parseFloat(ds.borderTopLeftRadius)],
          ['tr', near(dr.right, r.right) && near(dr.top, r.top), parseFloat(ds.borderTopRightRadius)],
          ['bl', near(dr.left, r.left) && near(dr.bottom, r.bottom), parseFloat(ds.borderBottomLeftRadius)],
          ['br', near(dr.right, r.right) && near(dr.bottom, r.bottom), parseFloat(ds.borderBottomRightRadius)],
        ];
        for (const [k, touches, own] of corners) {
          if (touches && own < rad[k] - bw - 1) { hits.push({ kind: 'corner', el: path(d), by: name(el), over: `${k} radius ${own} under ${rad[k]}`, box: [dr.left, dr.top, dr.width, dr.height], clip: [r.left, r.top, r.width, r.height] }); break; }
        }
      }
    }
  }
  return hits;
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
const found = new Map(); // one entry per page + kind + element + ancestor
for (const page of PAGES) {
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      for (const drawer of DRAWER) {
        const p = await browser.newPage({ viewport: { width: w, height: 900 } });
        await p.goto(`${APP}/#/${page}`);
        await p.waitForTimeout(2500);
        if (theme === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'chip-dark'));
        if (drawer === 'open') {
          await p.keyboard.press('Meta+j');
          await p.getByRole('dialog').first().waitFor({ timeout: 5000 }).catch(() => {});
        }
        await p.waitForTimeout(500); // past the 150 ms transitions
        const hits = await p.evaluate(measure);
        for (const h of hits) {
          const key = `${page}|${h.kind}|${h.el}|${h.by}`;
          const at = `${w} ${theme}${drawer === 'open' ? ' drawer' : ''}`;
          if (found.has(key)) {
            found.get(key).at.push(at);
            continue;
          }
          const file = `${String(found.size + 1).padStart(3, '0')}-${page}-${h.kind}-${w}-${theme}${drawer === 'open' ? '-drawer' : ''}.png`;
          // 100% picture: the clipping box with room round it, the element outlined
          await p.evaluate(([x, y, wd, ht]) => {
            const o = document.createElement('div');
            o.id = '__clip_mark';
            Object.assign(o.style, { position: 'fixed', left: `${x - 2}px`, top: `${y - 2}px`, width: `${wd + 4}px`, height: `${ht + 4}px`, outline: '2px dashed magenta', zIndex: 2147483647, pointerEvents: 'none' });
            document.body.appendChild(o);
          }, h.box);
          const [cx, cy, cw, ch] = h.clip;
          const clip = { x: Math.max(0, cx - 24), y: Math.max(0, cy - 24), width: Math.min(w, cw + 48), height: Math.min(900, ch + 48) };
          clip.width = Math.min(clip.width, w - clip.x);
          clip.height = Math.min(clip.height, 900 - clip.y);
          if (clip.width > 0 && clip.height > 0) await p.screenshot({ path: join(OUT, file), clip }).catch(() => {});
          await p.evaluate(() => document.getElementById('__clip_mark')?.remove());
          found.set(key, { page, ...h, box: h.box.map(Math.round), clip: h.clip.map(Math.round), at: [at], picture: file });
        }
        await p.close();
      }
    }
  }
}
await browser.close();
const list = [...found.values()];
writeFileSync(join(OUT, 'hits.json'), JSON.stringify(list, null, 2));
const by = (k) => list.reduce((m, h) => ((m[h[k]] = (m[h[k]] ?? 0) + 1), m), {});
console.log(`clip-sweep: ${list.length} hits`, JSON.stringify(by('kind')), JSON.stringify(by('page')));
for (const h of list) console.log(`${h.page} ${h.kind} ${h.el}  ⟂ ${h.by}  ${h.over}  [${h.at.length}× e.g. ${h.at[0]}]  ${h.picture}`);
console.log(`pictures and hits.json: ${OUT}`);
process.exitCode = list.length ? 1 : 0;
