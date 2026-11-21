// Clip sweep: finds anything clipped on every CHIP page, measured, not guessed
// (Elleta, 21 Nov 2026: "make sure it check the UI pixel perfect becuase alot of
// stuff is clipped like the cards, table corener etc"). Runs before every report.
//
// Per page, width (320, 768, 1024, 1100, 1440), theme (Chip light, dark) and
// Work drawer (closed, open) it measures:
//   shadow  an element's box-shadow is cut by a clipping ancestor's edge while
//           the element sits inside it, and is still 1% ink or more at the cut,
//           after any mask-image fade on the way up (ink × the mask's alpha at
//           the cut line: a cut inside a faded band to transparent is not seen)
//   content text, an icon or a control is cut by a clipping ancestor that
//           does not scroll (overflow hidden or clip)
//   corner  a filled child pokes past its rounded parent's corner (the child
//           touches the corner, has a smaller radius and nothing clips it)
//   ring    a control's real focus ring would be cut by a clipping or scrolling
//           ancestor's edge, judged where focus puts it: the control is focused
//           for real, scrolls into view as a keyboard user would see it (the
//           ancestors' scroll-padding included), then the scroll is put back
// Each hit names the element, the clipping ancestor and the overhang in px, and
// gets a 100% picture of the ancestor with the element outlined.
//
// Every run starts with a self-test on built-in fixtures (two real clips that
// must stay hits, three that must not): a rule that hides a real clip stops
// the sweep. --self-test runs only that.
//
// Usage: node scripts/clip-sweep.mjs [--app http://localhost:3160] [--out dir]
//        [--pages work,health] [--widths 1100] [--themes light] [--self-test]
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
    // overflow: clip paints up to overflow-clip-margin past the padding box (Stage, 82b6301)
    const m = s.overflowX === 'clip' && s.overflowY === 'clip' ? parseFloat(s.overflowClipMargin) || 0 : 0;
    const l = r.left + parseFloat(s.borderLeftWidth), t = r.top + parseFloat(s.borderTopWidth);
    return { l: l - m, t: t - m, r: l + a.clientWidth + m, b: t + a.clientHeight + m };
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
  // a mask-image linear-gradient's alpha at a point: 1 where nothing masks it
  const splitTop = (str) => { const out = []; let d = 0, cur = ''; for (const ch of str) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const colourAlpha = (c) => { if (/^transparent/.test(c)) return 0; const m = c.match(/rgba?\(([^)]*)\)/); if (!m) return 1; const v = m[1].split(/[\s,\/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
  const maskAlpha = (m, x, y) => {
    const st = getComputedStyle(m);
    const mi = st.maskImage && st.maskImage !== 'none' ? st.maskImage : st.webkitMaskImage;
    const g = mi && mi.match(/^linear-gradient\((.*)\)$/);
    if (!g) return 1;
    const args = splitTop(g[1]);
    let dir = 'to bottom';
    if (/^to /.test(args[0])) dir = args.shift();
    const mr = m.getBoundingClientRect();
    const [len, pos] = dir === 'to top' ? [mr.height, mr.bottom - y] : dir === 'to left' ? [mr.width, mr.right - x] : dir === 'to right' ? [mr.width, x - mr.left] : [mr.height, y - mr.top];
    const stops = args.map((a) => { const at = a.match(/(-?[\d.]+)(px|%)\s*$/); return { a: colourAlpha(a), at: at ? (at[2] === '%' ? (len * parseFloat(at[1])) / 100 : parseFloat(at[1])) : null }; });
    if (stops[0].at == null) stops[0].at = 0;
    if (stops[stops.length - 1].at == null) stops[stops.length - 1].at = len;
    for (let i = 1; i < stops.length; i++) if (stops[i].at == null) { let j = i; while (stops[j].at == null) j++; stops[i].at = stops[i - 1].at + (stops[j].at - stops[i - 1].at) / (j - i + 1); }
    for (let i = 1; i < stops.length; i++) stops[i].at = Math.max(stops[i].at, stops[i - 1].at);
    if (pos <= stops[0].at) return stops[0].a;
    for (let i = 1; i < stops.length; i++) if (pos <= stops[i].at) { const w = stops[i].at - stops[i - 1].at; return w ? stops[i - 1].a + ((stops[i].a - stops[i - 1].a) * (pos - stops[i - 1].at)) / w : stops[i].a; }
    return stops[stops.length - 1].a;
  };
  // the masks between an element and its clipping ancestor, multiplied, at a point
  const masksAt = (el, a, x, y) => { let k = 1; for (let m = el; m && m !== a.parentElement; m = m.parentElement) k *= maskAlpha(m, x, y); return k; };
  const shadowCut = (ls, r, b, c, el, a) => {
    // gap from the box edge to the clip line, and the layer's push toward that side
    const sides = { l: [r.left - b.l, (l) => -l.x], r: [b.r - r.right, (l) => l.x], t: [r.top - b.t, (l) => -l.y], b: [b.b - r.bottom, (l) => l.y] };
    const out = [];
    for (const [k, [gap, push]] of Object.entries(sides)) {
      if ((k === 'l' || k === 'r') && !c.x) continue;
      if ((k === 't' || k === 'b') && !c.y) continue;
      // a side the box can still scroll toward is a fold, not a clip: more content waits past it, as at the
      // window's own fold (the page content scrolls in its own box since 22 Nov, not the window)
      if (c.scrolls) {
        if (k === 'b' && a.scrollTop + a.clientHeight < a.scrollHeight - 1) continue;
        if (k === 't' && a.scrollTop > 0) continue;
        if (k === 'r' && a.scrollLeft + a.clientWidth < a.scrollWidth - 1) continue;
        if (k === 'l' && a.scrollLeft > 0) continue;
      }
      // the cut line's middle, beside the box, with what any mask leaves of it
      const cx = k === 'l' ? b.l + 0.5 : k === 'r' ? b.r - 0.5 : (Math.max(r.left, b.l) + Math.min(r.right, b.r)) / 2;
      const cy = k === 't' ? b.t + 0.5 : k === 'b' ? b.b - 0.5 : (Math.max(r.top, b.t) + Math.min(r.bottom, b.b)) / 2;
      const ink = ls.reduce((sum, l) => sum + l.alpha * tail(gap - push(l) - l.spread, l.blur), 0) * masksAt(el, a, cx, cy);
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
    if (ls.length) for (const { a, x, y, scrolls } of anc) {
      const b = clipBox(a);
      if (!inside(r, b)) break; // scrolled out or itself cut: content check covers it
      const o = shadowCut(ls, r, b, { x, y, scrolls }, el, a);
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
    // focus ring: focus it for real so it scrolls into view as a keyboard user sees it
    // (the ancestors' scroll-padding included), read the ring it draws (outline outside
    // its box, or a box-shadow ring), test that against each clipping ancestor, then put
    // every scroll back
    if (el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') && !el.disabled) {
      const near = anc.filter(({ a }) => inside(r, clipBox(a))).some(({ a, x, y }) => over({ l: r.left - RING, r: r.right + RING, t: r.top - RING, b: r.bottom + RING }, clipBox(a), { x, y }));
      if (near) {
        const scrollers = [...anc.map(({ a }) => a), document.scrollingElement];
        const kept = scrollers.map((a) => [a, a.scrollLeft, a.scrollTop, a.style.scrollBehavior]);
        for (const a of scrollers) a.style.scrollBehavior = 'auto';
        el.focus({ focusVisible: true });
        const fr = el.getBoundingClientRect();
        const fs = getComputedStyle(el);
        const ring = fs.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(fs.outlineWidth) + parseFloat(fs.outlineOffset));
        const sh = Math.max(0, ...layers(el).map((l) => l.spread));
        const R = Math.max(ring, sh);
        for (const { a, x, y } of anc) {
          const b = clipBox(a);
          if (!inside(fr, b)) break; // focus could not bring it into view: the content check covers a cut box
          const o = R ? over({ l: fr.left - R, r: fr.right + R, t: fr.top - R, b: fr.bottom + R }, b, { x, y }) : null;
          if (o) { hits.push({ kind: 'ring', el: path(el), by: name(a), over: `${o} (ring ${R}, focused and scrolled into view)`, box: [fr.left - R, fr.top - R, fr.width + 2 * R, fr.height + 2 * R], clip: [b.l, b.t, b.r - b.l, b.b - b.t] }); break; }
        }
        el.blur();
        for (const [a, l, t, sb] of kept) { a.scrollLeft = l; a.scrollTop = t; a.style.scrollBehavior = sb; }
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

// Self-test: real clips must stay hits, faded or scrolled-clear ones must not.
const FIXTURE = `<!doctype html><style>
body{margin:0;font:16px/1.5 sans-serif}
.f{position:absolute;top:24px;width:220px}
.card{height:60px;margin:32px 16px 0;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3)}
button{display:block;margin:0 16px;height:44px;outline:none}
button:focus-visible{outline:4px solid #2b8fd0;outline-offset:4px}
.shadow{height:100px;overflow:hidden}
.ring{height:120px;overflow:auto}
.spacer{height:70px}.after{height:200px}
</style>
<div class="f f1-shadow-cut shadow" style="left:0"><div class="card"></div></div>
<div class="f f2-shadow-faded shadow" style="left:260px;mask-image:linear-gradient(to top,transparent,#000 24px)"><div class="card"></div></div>
<div class="f f3-ring-cut" style="left:520px;height:44px;overflow:hidden"><button>Cut</button></div>
<div class="f f4-ring-room ring" style="left:780px;scroll-padding-block:16px"><div class="spacer"></div><button>Room</button><div class="after"></div></div>
<div class="f f5-ring-no-room ring" style="left:1040px"><div class="spacer"></div><button>No room</button><div class="after"></div></div>
<div class="f f6-shadow-fold" style="left:0;top:200px;height:100px;overflow:auto"><div class="card"></div><div class="after"></div></div>
<div class="f f7-shadow-scroll-end" style="left:260px;top:200px;height:100px;overflow:auto"><div class="card"></div></div>`;
// f6: a card at a scroller's fold, more to scroll to: not a cut; f7: the scroller's real end cuts it: a cut
const EXPECT = { 'f1-shadow-cut': 'shadow', 'f2-shadow-faded': null, 'f3-ring-cut': 'ring', 'f4-ring-room': null, 'f5-ring-no-room': 'ring', 'f6-shadow-fold': null, 'f7-shadow-scroll-end': 'shadow' };
{
  const p = await browser.newPage({ viewport: { width: 1300, height: 400 } });
  await p.setContent(FIXTURE);
  await p.keyboard.press('Tab'); // so focus() draws :focus-visible rings
  const hits = await p.evaluate(measure);
  await p.screenshot({ path: join(OUT, 'self-test-fixtures.png') });
  await p.close();
  const bad = Object.entries(EXPECT).filter(([f, kind]) => {
    const got = hits.filter((h) => h.by.includes(f) && (h.kind === 'shadow' || h.kind === 'ring')).map((h) => h.kind);
    return kind ? !got.includes(kind) : got.length > 0;
  });
  console.log(`clip-sweep self-test: ${Object.keys(EXPECT).length - bad.length} of ${Object.keys(EXPECT).length} fixtures as expected${bad.length ? `; WRONG: ${bad.map(([f]) => f).join(', ')}` : ''}`);
  if (bad.length) {
    await browser.close();
    process.exit(2);
  }
  if (process.argv.includes('--self-test')) {
    await browser.close();
    process.exit(0);
  }
}
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
