// A page of a running project as a picture, at a chosen width, for the Playground's Pages tab (Elleta, 23 Nov:
// "i still want to be able to mark up the site in chip"). The picture goes into the same PicturePins as Your picks,
// so a note's x and y are the page's own pixels. Reads only: it opens the page in a headless browser and never
// writes to the project. One at a time, kept 60 seconds per page and width.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bellaDir } from '../../scripts/lib/bella-dir.mjs';

const DIR = join(tmpdir(), 'chip-play-shots');
const KEEP_MS = 60_000;
let queue = Promise.resolve();

/** The address to open: the project's own origin plus the route; a route is a path or a #/hash, nothing else. */
export function shotUrl(runUrl, route) {
  const r = String(route ?? '');
  if (r && !/^(#\/|\/(?!\/))[\w\-./%?=&#~]*$/.test(r)) throw new Error('That is not a page route');
  const origin = new URL(runUrl).origin;
  return r.startsWith('#') ? `${origin}/${r}` : `${origin}${r || '/'}`;
}

export function shotWidth(w) {
  return Math.min(1920, Math.max(320, Math.round(Number(w)) || 1440));
}

async function take(url, width) {
  const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForTimeout(2500);
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await browser.close();
  }
}

export function playShot(url, width) {
  const file = join(DIR, `${createHash('sha1').update(`${url}|${width}`).digest('hex')}.png`);
  const run = async () => {
    try {
      if (Date.now() - statSync(file).mtimeMs < KEEP_MS) return readFileSync(file);
    } catch {}
    const png = await take(url, width);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, png);
    return png;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
