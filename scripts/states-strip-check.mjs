// States strip check (Elleta, 22 Nov 2026: "this is a bug its meant to be states not take you to other components").
// Opens every BELLA part on the Components page at 1440 and 320 and reads the strip under the stage. FAILS when its
// title lacks "· states", or any card in it carries the name of a component. Prints one line per part and width, so it
// cannot pass on nothing. A full run leaves data/states-strips.json, which on-system-guard.mjs reads before a commit
// that touches the files building the strip. Usage: node scripts/states-strip-check.mjs [--app http://localhost:3160] [--part Button]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bellaDir } from './lib/bella-dir.mjs';
import { STRIP_RECORD, stripInputsHash } from './lib/stage-leaders.mjs';

const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f; };
const APP = arg('app', 'http://localhost:3160');
const ONLY = arg('part', null);
const names = JSON.parse(readFileSync(new URL('../data/bella.json', import.meta.url), 'utf8')).components.map((c) => c.name);
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
const browser = await chromium.launch();
const rows = [];
for (const width of [1440, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('chip-work', JSON.stringify({ open: false, chosen: true })); } catch {} });
  const page = await ctx.newPage();
  for (const name of names.filter((n) => !ONLY || n === ONLY)) {
    await page.goto(`${APP}/#/system/components/${name}?tab=inspect`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForFunction((n) => document.querySelector('h2')?.textContent?.trim() === n, name, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('[role="group"][aria-label*="arrow keys"], [data-states-empty]', { timeout: 8000 }).catch(() => {});
    const strip = await page.evaluate(() => {
      // a part with no states of its own shows BELLA's empty state in the strip's place (24 Nov): a strip, with no cards
      const none = document.querySelector('[data-states-empty]');
      if (none) return none.querySelector('[data-bella-component="empty-state"]') ? { title: none.getAttribute('aria-label').replace(/: none of its own$/, ''), labels: [], empty: true } : null;
      const g = document.querySelector('[role="group"][aria-label*="arrow keys"]');
      if (!g) return null;
      const title = g.getAttribute('aria-label').replace(/: arrow keys.*$/, '');
      // a card's label is the text of its tile that is not the drawn part: its name sits last
      const labels = [...g.children].map((c) => (c.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)).map((l) => l.filter((x) => x !== 'States not drawn yet' && x !== 'No states in its contract'));
      return { title, labels };
    });
    const bad = [];
    if (!strip) bad.push('no strip under the stage');
    else {
      if (!/ · states$/.test(strip.title)) bad.push(`title "${strip.title}" lacks "· states"`);
      const others = strip.labels.flat().filter((l) => names.includes(l) && l !== 'Default');
      if (others.length) bad.push(`cards name components: ${others.join(', ')}`);
      if (!strip.title.startsWith(name)) bad.push(`title "${strip.title}" is not ${name}'s`);
    }
    rows.push({ name, width, bad, title: strip?.title, cards: strip?.labels.length ?? 0 });
    if (bad.length || ONLY) console.log(`${bad.length ? 'FAIL' : 'ok  '} ${String(width).padStart(4)} ${name.padEnd(18)} ${strip?.title ?? '-'} · ${strip?.labels.map((l) => l.join(' ')).join(' | ') ?? ''}${bad.length ? ` :: ${bad.join('; ')}` : ''}`);
  }
  await ctx.close();
}
await browser.close();
const failed = rows.filter((r) => r.bad.length);
console.log(`states-strip-check: ${rows.length - failed.length} of ${rows.length} part-widths show their own states · ${rows.filter((r) => r.cards).length} strips read`);
if (!ONLY) writeFileSync(STRIP_RECORD, JSON.stringify({ at: new Date().toISOString(), hash: stripInputsHash(), ok: !failed.length, bad: failed.length, total: rows.length }, null, 1));
process.exit(failed.length ? 1 : 0);
