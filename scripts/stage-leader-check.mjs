// Stage leader check (Elleta, 23 Nov 2026: "the leaders are crossing and a mess.. make sure this doesn't
// happen"). For every part with an anatomy, at 320, 768, 1024 and 1440, it measures what the Components stage
// actually draws and fails when
//   - two leaders cross,
//   - a leader passes through another label or through the part,
//   - two labels overlap, or a label is cut by the stage's edge.
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
const measure = () => {
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
  return { legend, stage: box(stage), part: box(live), chips: [...stage.querySelectorAll('[data-stage-chip]')].map((c) => ({ name: c.textContent.trim(), ...box(c) })), leaders };
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
    if (body.some((pt) => inside(pt, part, 3))) bad.push(`${l.label} passes through the part`);
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
for (const part of parts) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    await page.goto(`${APP}/#/components/${part.id ?? part.name.toLowerCase()}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-stage-chip]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1800); // the part settles into the largest size its labels fit
    const g = await page.evaluate(measure);
    const bad = !g ? ['no stage'] : g.legend ? judgeLegend(g, part.parts.length) : g.chips.length === part.parts.length ? judge(g) : [`${g.chips.length} of ${part.parts.length} labels drawn`];
    const mode = g?.legend ? 'legend' : 'labels';
    await page.locator('[data-bella-component="stage"]').first().screenshot({ path: join(OUT, `${part.name}-${width}.png`) }).catch(() => {});
    results.push({ part: part.name, width, mode, pins: part.parts.length, leaders: g?.leaders.length ?? 0, ok: !bad.length, bad });
    await page.close();
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
