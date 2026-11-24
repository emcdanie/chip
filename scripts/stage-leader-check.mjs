// Stage leader check (Elleta, 23 Nov 2026: "the leaders are crossing and a mess.. make sure this doesn't
// happen"). For every part with an anatomy, at 320, 768, 1024 and 1440, it measures what the Components stage
// actually draws and fails when
//   - two leaders cross,
//   - a leader passes through another label or through the part,
//   - two labels overlap, or a label is cut by the stage's edge,
//   - a leader's dot is not inside the measured box of the piece its label names (Elleta, 23 Nov: "every dot sat
//     on the top or bottom edge of the fill, not on Send or the ring"). The box is read from the live part: the
//     element the anatomy names (target); the focus ring's box is that grown by its offset, the shadow's is that
//     extended below by its size. A leader may enter the part only on the last leg, to its own dot.
// A part-width also passes in legend mode (numbered pins and a legend under the stage, no leaders), when every pin
// is drawn inside the stage, no two pins overlap, and every name in the legend is whole and on screen.
// Usage: node scripts/stage-leader-check.mjs [--app http://localhost:3160] [--out dir] [--part Button]
// Needs a CHIP server and Playwright in BELLA_DIR (as data-sweep.mjs). Exit 1 on any failure.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';
import { RECORD, leaderInputsHash } from './lib/stage-leaders.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const OUT = arg('out', join(tmpdir(), 'chip-stage-leaders'));
const ONLY = arg('part', null);
const WIDTHS = [320, 768, 1024, 1440];
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
mkdirSync(OUT, { recursive: true });

const bella = await (await fetch(`${APP}/data/bella.json`)).json();
const parts = bella.components.filter((c) => (c.parts ?? []).length && (!ONLY || c.name === ONLY));

/* geometry, run in the page: every leader as a polyline in client pixels, every label's box, the part's box */
const measure = (specs) => {
  const stage = document.querySelector('[data-bella-component="stage"]');
  const live = document.querySelector('[data-stage-part]')?.firstElementChild;
  if (!stage || !live) return null;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom };
  };
  const leaders = [...stage.querySelectorAll('[data-bella-component="leader"] path')]
    .filter((p) => !/arrow|dot/.test(p.getAttribute('class') ?? '') && p.getTotalLength() > 1)
    .map((p) => {
      const m = p.getScreenCTM();
      const n = Math.max(24, Math.ceil(p.getTotalLength() / 3));
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const q = p.getPointAtLength((p.getTotalLength() * i) / n);
        return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f];
      });
      return { label: p.closest('[data-bella-component="leader"]')?.getAttribute('aria-label') ?? '', pts };
    });
  const rows = [...document.querySelectorAll('ul[aria-label$="parts on the stage"] > li')];
  const pins = [...stage.querySelectorAll('[data-stage-pin]')].map((p) => box(p.firstElementChild ?? p));
  const legend = rows.length ? { rows: rows.map((r) => { const t = r.querySelector('[class*="title"], span, p') ?? r; const q = box(r); return { text: r.textContent.trim(), ...q, clipped: [...r.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') || q.r > innerWidth + 0.5 || q.l < -0.5 }; }), pins } : null;
  // each named piece's expected box on screen, and where its dot is
  const root = live.firstElementChild ?? live;
  const sc = root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1;
  const pieces = specs.map((x) => {
    const el = !x.target || x.target === ':scope' ? root : root.querySelector(x.target) ?? root;
    const q = box(el);
    const z = x.zone ?? {};
    if (x.kind === 'ring') {
      const g = Math.abs(z.inset ?? 4) * sc;
      return { ...x, box: { l: q.l - g, r: q.r + g, t: q.t - g, b: q.b + g } };
    }
    if (x.kind === 'shadow') return { ...x, box: { ...q, b: q.b + (z.size ?? 8) * sc } };
    return { ...x, box: q };
  });
  const dist = (pt, b) => Math.hypot(Math.max(b.l - pt[0], 0, pt[0] - b.r), Math.max(b.t - pt[1], 0, pt[1] - b.b));
  const chipBoxes = [...stage.querySelectorAll('[data-stage-chip]')].map(box);
  leaders.forEach((l) => {
    const a = l.pts[0];
    const z = l.pts[l.pts.length - 1];
    const near = (pt) => Math.min(...chipBoxes.map((c) => dist(pt, c)));
    l.dot = near(a) <= near(z) ? z : a; // the end that is not on a label
  });
  const pinDots = [...stage.querySelectorAll('[data-stage-pin]')].map((p) => ({ n: p.textContent.trim(), ...box(p.firstElementChild ?? p) }));
  return { legend, pieces, pinDots, stage: box(stage), part: box(live), chips: [...stage.querySelectorAll('[data-stage-chip]')].map((c) => ({ name: c.textContent.trim(), ...box(c) })), leaders };
};

const cross = (p, q, r, s) => {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0;
};
const inside = (pt, b, pad = 0) => pt[0] > b.l + pad && pt[0] < b.r - pad && pt[1] > b.t + pad && pt[1] < b.b - pad;

function judge(g) {
  const bad = [];
  const { leaders, chips, part, stage } = g;
  for (let i = 0; i < leaders.length; i += 1)
    for (let j = i + 1; j < leaders.length; j += 1) {
      const a = leaders[i].pts;
      const b = leaders[j].pts;
      let hit = false;
      for (let x = 0; x < a.length - 1 && !hit; x += 1) for (let y = 0; y < b.length - 1 && !hit; y += 1) hit = cross(a[x], a[x + 1], b[y], b[y + 1]);
      if (hit) bad.push(`leaders cross: ${leaders[i].label} and ${leaders[j].label}`);
    }
  leaders.forEach((l, i) => {
    // the first and last 4px of a line sit on its own label and on the part's edge
    const body = l.pts.filter((_, k) => k > 0 && k < l.pts.length - 1);
    chips.forEach((c, k) => {
      if (k === i) return;
      if (body.some((pt) => inside(pt, c, -1))) bad.push(`${l.label} passes through the label ${c.name}`);
    });
    // the last leg runs inside the part to the leader's own dot, nowhere else
    if (body.some((pt) => inside(pt, part, 3) && Math.abs(pt[0] - l.dot[0]) > 3)) bad.push(`${l.label} passes through the part`);
  });
  for (let i = 0; i < chips.length; i += 1) {
    for (let j = i + 1; j < chips.length; j += 1) {
      const a = chips[i];
      const b = chips[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) bad.push(`labels overlap: ${a.name} and ${b.name}`);
    }
    if (chips[i].l < stage.l - 0.5 || chips[i].r > stage.r + 0.5) bad.push(`the stage cuts the label ${chips[i].name}`);
  }
  return bad;
}

/* a dot sits inside the measured box of the piece it names (1px for rounding) */
function judgeDots(g) {
  const bad = [];
  const within = (pt, b) => pt[0] >= b.l - 1 && pt[0] <= b.r + 1 && pt[1] >= b.t - 1 && pt[1] <= b.b + 1;
  if (g.leaders.length) {
    g.leaders.forEach((l) => {
      const piece = g.pieces.find((x) => l.label.endsWith(`points to ${x.title}`));
      if (!piece) return bad.push(`${l.label}: no named piece found`);
      if (!within(l.dot, piece.box)) bad.push(`${piece.title}: its dot is not on the ${piece.title.toLowerCase()} (${Math.round(l.dot[0])}, ${Math.round(l.dot[1])} outside ${Math.round(piece.box.l)}..${Math.round(piece.box.r)} x ${Math.round(piece.box.t)}..${Math.round(piece.box.b)})`);
    });
  } else
    g.pinDots.forEach((d) => {
      const piece = g.pieces.find((x) => String(x.n) === d.n);
      if (piece && !within([(d.l + d.r) / 2, (d.t + d.b) / 2], { l: piece.box.l - 22, r: piece.box.r + 22, t: piece.box.t - 22, b: piece.box.b + 22 })) bad.push(`${piece.title}: pin ${d.n} is not on the ${piece.title.toLowerCase()}`);
    });
  return bad;
}

function judgeLegend(g, n) {
  const bad = [];
  const { legend, stage } = g;
  if (legend.rows.length !== n) bad.push(`legend names ${legend.rows.length} of ${n} parts`);
  legend.rows.forEach((r) => r.clipped && bad.push(`legend row "${r.text}" is clipped`));
  if (legend.pins.length !== n) bad.push(`${legend.pins.length} of ${n} pins drawn`);
  legend.pins.forEach((p, i) => {
    if (p.l < stage.l - 0.5 || p.r > stage.r + 0.5 || p.t < stage.t - 0.5 || p.b > stage.b + 0.5) bad.push(`pin ${i + 1} is outside the stage`);
    legend.pins.slice(i + 1).forEach((q, j) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b && bad.push(`pins ${i + 1} and ${i + j + 2} overlap`));
  });
  if (g.chips.length || g.leaders.length) bad.push('legend mode still draws labels or leaders');
  return bad;
}

const browser = await chromium.launch();
const results = [];
for (const motion of ['normal', 'reduced']) {
for (const part of parts) {
  for (const width of motion === 'reduced' ? [1440] : WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light', reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference' });
    await page.goto(`${APP}/#/components/${part.id ?? part.name.toLowerCase()}?tab=inspect`, { waitUntil: 'load' }); // the anatomy stage: a part opens on Accessibility (23 Nov)
    await page.waitForSelector('[data-stage-chip]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1800); // the part settles into the largest size its labels fit
    // a leader that draws in (BELLA Leader draw map 900ms, pick 250ms) is measured once it has finished
    await page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 }).catch(() => {});
    const g = await page.evaluate(measure, part.parts.map(({ key, n, title, kind, target, zone }) => ({ key, n, title, kind, target, zone })));
    const bad = !g ? ['no stage'] : g.legend ? [...judgeLegend(g, part.parts.length), ...judgeDots(g)] : g.chips.length === part.parts.length ? [...judge(g), ...judgeDots(g)] : [`${g.chips.length} of ${part.parts.length} labels drawn`];
    const mode = g?.legend ? 'legend' : 'labels';
    await page.locator('[data-bella-component="stage"]').first().screenshot({ path: join(OUT, `${part.name}-${width}${motion === 'reduced' ? '-reduced' : ''}.png`) }).catch(() => {});
    results.push({ part: part.name, width: motion === 'reduced' ? `${width} reduced` : width, mode, pins: part.parts.length, leaders: g?.leaders.length ?? 0, ok: !bad.length, bad });
    await page.close();
  }
}
}
await browser.close();
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.part.padEnd(10)} ${String(r.width).padStart(4)}  ${r.pins} pins · ${r.mode}${r.ok ? '' : `: ${[...new Set(r.bad)].join('; ')}`}`);
const failed = results.filter((r) => !r.ok).length;
// the record the guard reads: only a full run counts (every part, every width)
writeFileSync(RECORD, JSON.stringify({ at: new Date().toISOString(), hash: leaderInputsHash(), full: !ONLY, ok: !failed, clean: results.length - failed, total: results.length }, null, 1));
console.log(`stage-leader-check: ${results.length - failed} of ${results.length} part-widths clean · ${OUT}`);
process.exit(failed ? 1 : 0);
