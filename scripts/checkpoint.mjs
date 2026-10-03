#!/usr/bin/env node
// npm run checkpoint: CHIP's self-check before a report. Fails (exit 1) on
// any finding.
//   1. app/src: no hex values, no px font sizes
//   2. the app builds
//   3. NDA scan: added lines of unpushed commits vs ~/.claude/nda-terms.txt
//      (prints term numbers, never terms)
//   4. in the browser (Playwright from the BELLA repo, like the app's
//      components): the checkpoint screens at 1440 and 390 in warm and dark,
//      axe on each, no sideways scroll, no console errors, nothing cut off
//      (an ellipsis that hides text, or a middle-ellipsis string like
//      "--component-b…fill-hi")
// Needs the server (npm start, :3100) and the app (npm run app, :5173).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BELLA = process.env.BELLA_DIR || join(homedir(), 'DEV', 'bella');
const APP = process.env.CHIP_APP_URL || 'http://127.0.0.1:5173';
const OUT = join(ROOT, 'docs/reference/screens/checkpoint');
const failures = [];
const log = (s) => console.log(s);

// 1. hex and px font sizes
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const src = walk(join(ROOT, 'app/src'));
const hex = [], px = [];
for (const f of src) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/#[0-9a-fA-F]{3,8}\b/.test(line.replace(/#\/[\w/-]*/g, ''))) hex.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
    if (/font-size:\s*[0-9.]+px|fontSize:\s*['"]?[0-9.]+(px)?['"]?[,} ]/.test(line)) px.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
  });
}
log(`1. hex values: ${hex.length ? hex.join(', ') : 'none'} · px font sizes: ${px.length ? px.join(', ') : 'none'}`);
if (hex.length || px.length) failures.push('hex or px font size in app/src');

// 2. build
const build = spawnSync('npm', ['run', 'app:build'], { cwd: ROOT, encoding: 'utf8' });
log(`2. build: ${build.status === 0 ? 'OK' : 'FAILED'}`);
if (build.status !== 0) failures.push('app build');

// 3. NDA scan of unpushed commits
const termsFile = join(homedir(), '.claude/nda-terms.txt');
if (!existsSync(termsFile)) {
  failures.push('nda-terms.txt missing');
  log('3. NDA scan: terms file missing');
} else {
  const terms = readFileSync(termsFile, 'utf8').split('\n').map((t) => t.trim()).filter((t) => t && !t.startsWith('#'));
  const range = 'origin/main..HEAD';
  const hasBase = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', '--quiet', 'origin/main']).status === 0;
  if (!hasBase) {
    failures.push('NDA scan could not run: no origin/main (fetch it first)');
    log('3. NDA scan: origin/main missing, not run');
  }
  const diff = !hasBase ? '' : execFileSync('git', ['-C', ROOT, 'log', '-p', '--format=COMMIT %h %s%n%b', range], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const hits = new Set();
  for (const line of diff.split('\n')) {
    if (/^(-|@@|diff |index | )/.test(line)) continue;
    terms.forEach((t, i) => {
      if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line)) hits.add(i + 1);
    });
  }
  const n = hasBase ? execFileSync('git', ['-C', ROOT, 'rev-list', '--count', range], { encoding: 'utf8' }).trim() : 0;
  if (hasBase) log(`3. NDA scan (${range}, ${n} commits, ${terms.length} terms): ${hits.size ? `HITS term#${[...hits].join(', #')}` : 'clean'}`);
  if (hits.size) failures.push('NDA term in unpushed commits');
}

// 4. the browser
let chromium, axeSrc;
try {
  const req = createRequire(join(BELLA, 'package.json'));
  ({ chromium } = req('playwright'));
  axeSrc = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  failures.push(`Playwright and axe-core not found in ${BELLA}`);
}
if (chromium) {
  const up = await fetch(`${APP}/health`).then((r) => r.ok).catch(() => false);
  if (!up) {
    failures.push(`app or server not answering at ${APP} (npm start, then npm run app)`);
  } else {
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const H = { 1440: 960, 390: 844 };
    for (const theme of ['warm', 'dark']) {
      for (const w of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: H[w] } });
        await ctx.addInitScript((t) => {
          localStorage.setItem('chip-theme', t);
          localStorage.setItem('chip-obi-open', 'closed');
          localStorage.removeItem('chip-dock-height');
        }, theme);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        const check = async (name) => {
          await page.addScriptTag({ content: axeSrc }).catch(() => {});
          const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id} x${x.nodes.length}`));
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          // truncation: text cut by an ellipsis, or a string shortened in the middle
          const cut = await page.evaluate(() => {
            const out = [];
            const shown = (e) => e.getClientRects().length && !e.closest('[hidden], details:not([open]) > :not(summary)');
            for (const e of document.querySelectorAll('body *')) {
              if (!shown(e)) continue;
              const st = getComputedStyle(e);
              if ((st.textOverflow === 'ellipsis' || st.webkitLineClamp !== 'none') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) out.push(e.textContent.trim().slice(0, 40));
            }
            // a select shows its chosen option in a box the browser cuts off without an ellipsis
            const cv = document.createElement('canvas').getContext('2d');
            for (const sel of document.querySelectorAll('select')) {
              if (!shown(sel) || !sel.options[sel.selectedIndex]) continue;
              const st = getComputedStyle(sel);
              cv.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
              const room = sel.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
              const text = sel.options[sel.selectedIndex].text;
              if (cv.measureText(text).width > room + 1) out.push(`select: ${text.slice(0, 40)}`);
            }
            const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n; (n = tw.nextNode()); ) if (/\S…\S/.test(n.textContent) && n.parentElement && shown(n.parentElement)) out.push(n.textContent.trim().slice(0, 40));
            return out;
          });
          await page.screenshot({ path: join(OUT, `${name}-${w}-${theme}.png`) });
          const bad = v.length || sw > w || cut.length;
          log(`   ${theme} ${w} ${name}: axe ${v.length ? v.join('; ') : 0} · width ${sw}${sw > w ? ' OVERFLOW' : ''} · cut off ${cut.length ? cut.map((c) => `"${c}"`).join(', ') : 0}`);
          if (bad) failures.push(`${theme} ${w} ${name}`);
        };
        // Health with the dock closed
        await page.goto(`${APP}/#/health`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await check('health');
        // Atlas · Button, anatomy with a part selected, dock closed
        await page.goto(`${APP}/#/atlas/button`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(900);
        await page.locator('.legend button', { hasText: 'Label' }).first().click();
        await page.waitForTimeout(300);
        await check('atlas-button');
        // the document scrolls: nothing lives only inside an inner scroller,
        // and a full-page capture gets the whole page
        const fit = await page.evaluate(() => {
          const main = document.querySelector('.main');
          // content inside a deliberate inner scroller (the sticky library, a
          // capped table) scrolls there, and a closed section's content is not
          // shown (Chrome still reports boxes for it); everything else must sit
          // in the document
          const scroller = (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1;
          const inScroller = (e) => {
            for (let a = e.parentElement; a && a !== main; a = a.parentElement) if (scroller(a)) return true;
            return false;
          };
          const bottom = Math.max(...[...main.querySelectorAll('*')].filter((e) => !inScroller(e) && e.getClientRects().length && !e.closest('details:not([open]) > :not(summary)')).map((e) => e.getBoundingClientRect().bottom + scrollY));
          return { doc: document.documentElement.scrollHeight, bottom: Math.round(bottom), inner: [...main.querySelectorAll('*')].filter((e) => /(auto|scroll|hidden)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 40 && e.clientHeight > innerHeight * 0.6).length };
        });
        await page.screenshot({ path: join(OUT, `atlas-button-full-${w}-${theme}.png`), fullPage: true });
        const scrolls = fit.bottom <= fit.doc + 2;
        log(`   ${theme} ${w} full page: document ${fit.doc}px, content ends ${fit.bottom}px${scrolls ? '' : ' CUT OFF'}`);
        if (!scrolls) failures.push(`${theme} ${w} page content beyond the document`);
        // Try a change: Min height under the 44px mark flips the check, back to 44 restores it
        if (w >= 720 && theme === 'warm') {
          await page.locator('#specimen').getByRole('button', { name: 'Try a change' }).click();
          await page.waitForTimeout(400);
          const minH = page.getByRole('slider', { name: 'Min height' });
          const facts = page.locator('[aria-label="Button facts"]');
          await minH.fill('40');
          await page.waitForTimeout(300);
          const count = async () => (await facts.innerText()).match(/(\d+) of (\d+) pass/)?.slice(1).map(Number) ?? [0, -1];
          const [p40, n40] = await count();
          const at40 = { summary: p40 === n40 - 1, reason: await facts.getByText(/Min height 40px is under BELLA's 44px floor/).count() };
          // the Try panel lists the same rows with the same counts
          const panel = (await page.locator('.sandbox-score').innerText()).match(/→ (\d+) of (\d+) pass/)?.slice(1).map(Number) ?? [];
          const same = panel[0] === p40 && panel[1] === n40;
          await minH.fill('44');
          await page.waitForTimeout(300);
          const [p44, n44] = await count();
          const at44 = p44 === n44;
          await page.locator('.sandbox-colour').first().scrollIntoViewIfNeeded();
          await check('atlas-try');
          const ok = at40.summary && at40.reason > 0 && at44 && same;
          log(`   ${theme} ${w} try a change: 40px -> ${p40} of ${n40}${at40.reason ? ' with the reason' : ' NO REASON'}${same ? ', Try panel agrees' : ', TRY PANEL DIFFERS'}; 44px -> ${p44} of ${n44}`);
          if (!ok) failures.push(`${theme} ${w} try a change does not flip the touch target check`);
          await page.locator('#specimen').getByRole('button', { name: 'Anatomy' }).click();
        }
        // the one input's dropdown (desktop: in the bar)
        if (w >= 720) {
          await page.locator('#one-input').click();
          await page.keyboard.type('card');
          await page.waitForTimeout(300);
          await check('jump-dropdown');
          await page.locator('#one-input').fill('');
          await page.keyboard.press('Escape');
        }
        // OBI open: the four answer states in one thread
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+j' : 'Control+j');
        await page.waitForTimeout(400);
        const send = async (q) => {
          await page.locator('#one-input').click();
          await page.locator('#one-input').fill(q);
          await page.waitForTimeout(250);
          await page.keyboard.press('Enter');
        };
        await send("what's missing here?");
        await page.waitForTimeout(400);
        await send('/status');
        await page.locator('.turn-cmd .meta-line', { hasText: /pass|fail/ }).last().waitFor({ timeout: 60000 });
        await send('What is the capital of Peru?');
        await page.locator('.turn').last().getByText("I couldn't find this").waitFor({ timeout: 60000 });
        await send('What would Vitaly say about dashboards?');
        // wait for the answer to finish (the details row gets its timings)
        await page.locator('.turn').last().getByText(/First words/).waitFor({ state: 'attached', timeout: 180000 });
        await page.waitForTimeout(300);
        await check('obi-states');
        // drag the dock taller with the keyboard (the handle is a separator) to see every state
        if (w >= 720) {
          await page.locator('.dock-handle').focus();
          for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
          await page.waitForTimeout(300);
        }
        await page.evaluate(() => document.querySelector('.obi-thread')?.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await check('obi-states-top');
        if (errors.length) {
          failures.push(`${theme} ${w} console errors`);
          log(`   ${theme} ${w} errors: ${errors.join(' | ')}`);
        }
        await ctx.close();
      }
    }
    await browser.close();
    log(`4. screens in docs/reference/screens/checkpoint/`);
  }
}

log(failures.length ? `\ncheckpoint: ${failures.length} failing\n  - ${failures.join('\n  - ')}` : '\ncheckpoint: green');
process.exit(failures.length ? 1 : 0);
