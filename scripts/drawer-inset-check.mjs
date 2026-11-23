// Drawer inset check (Elleta, 23 Nov 2026: "the padding on the drawers is still wrong"). Opens each reading drawer on
// Health at 1440, 768 and 320 and measures, in px, the left edge of the title text and of every block under it
// (chart, bars, group rows, rows, headings, notices), and the right edge of the close button against each block's
// right edge (rows sit bare by the template's rule: their own 16 puts the content on the title's edge, so rows are not measured as boxes). FAILS when any block's left or right differs from the title's by more than 1px. It prints every number,
// so it cannot pass on nothing. Usage: node scripts/drawer-inset-check.mjs [--app http://localhost:3160]
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { bellaDir } from './lib/bella-dir.mjs';

const i = process.argv.indexOf('--app');
const APP = i > 0 ? process.argv[i + 1] : 'http://localhost:3160';
const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');
const WIDTHS = [1440, 768, 320];
const DRAWERS = [
  { name: 'Drift', card: /^Drift from BELLA/ },
  { name: 'Gaps', card: /^Gaps/ },
  { name: 'Checks', card: /^Checks/ },
  { name: 'Contrast', card: /^Contrast coverage/ },
  { name: 'Audit', card: /^BELLA system/ },
];
// the drawer template (23 Nov): branch-group rows and the data table sit on the title's edge like every other block
const BLOCKS = ['bar-chart', 'progress', 'disclosure', 'branch-group', 'data-table', 'stat-card', 'section-head', 'notification', 'text-stack'];

const browser = await chromium.launch();
let bad = 0;
let measured = 0;
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const d of DRAWERS) {
    await page.goto(`${APP}/#/health`);
    await page.reload();
    await page.waitForTimeout(2500);
    const card = page.locator('button', { hasText: d.card }).first();
    await card.waitFor({ timeout: 15000 }).catch(() => {}); // the page's data can take longer than the fixed wait
    if (!(await card.count())) { console.log(`FAIL ${width} ${d.name}: card not found`); bad++; continue; }
    await card.click();
    await page.waitForTimeout(1200);
    const res = await page.evaluate((blocks) => {
      const dlg = [...document.querySelectorAll('dialog')].find((x) => x.getBoundingClientRect().width > 0);
      if (!dlg) return null;
      const r = (e) => e.getBoundingClientRect();
      const title = dlg.querySelector('h1,h2,h3');
      const close = dlg.querySelector('button');
      const L = r(title).left;
      const R = r(close).right;
      const nodes = [...dlg.querySelectorAll(blocks.map((b) => `[data-bella-component="${b}"]`).join(','))];
      // top-level blocks only: not inside another measured block (a row's text stack is the row's own padding)
      // a bulleted list's items sit in by their bullet, by design (a plan's steps), so they are not measured as blocks
      const top = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)) && !n.closest('[data-bella-component="list-row"]') && !(n.closest('li') && getComputedStyle(n.closest('li')).display === 'list-item' && getComputedStyle(n.closest('li')).listStyleType !== 'none'));
      return { L: Math.round(L * 10) / 10, R: Math.round(R * 10) / 10, rows: top.map((n) => [n.dataset.bellaComponent, Math.round(r(n).left * 10) / 10, Math.round(r(n).right * 10) / 10]) };
    }, BLOCKS);
    if (!res) { console.log(`FAIL ${width} ${d.name}: drawer did not open`); bad++; continue; }
    const off = res.rows.filter(([, l, rt]) => Math.abs(l - res.L) > 1 || Math.abs(rt - res.R) > 1);
    measured += res.rows.length;
    console.log(`${off.length ? 'FAIL' : 'ok  '} ${width} ${d.name}: title left ${res.L}, close right ${res.R}, ${res.rows.length} blocks, ${off.length} off`);
    for (const [n, l, rt] of off.slice(0, 6)) console.log(`       ${n}: left ${l} right ${rt}`);
    if (off.length) bad++;
    await page.keyboard.press('Escape');
  }
  await page.close();
}

// Every group opened and read to the end (23 Nov, her drawers: after opening "Green" only a sliver of its first item showed,
// cut at the top edge, with white space below, and texts ended in "..." with no way to read on). For every drawer with
// groups, at each width, each group is opened in turn and the drawer's body is scrolled to the end. FAILS when
//   (a) an opened group's header is not in view after it opens (the old scroll position cut its first item),
//   (b) more than 160px (the phone sheet's own bottom padding is about 150) of empty body sits under the last content at the end, or content is cut off at the bottom,
//   (c) any text ends in an ellipsis or is clipped by a line clamp or overflow, so a sentence cannot be read.
// groups are BELLA BranchGroup rows (the drawer template, 23 Nov): a head button with aria-expanded, its items rendered
// only while open. Drift opens on its summary; its groups are the table one click behind (See all), measured below.
const GROUPED = [
  { name: 'Gaps', card: /^Gaps/ },
  { name: 'Checks', card: /^Checks/ },
  { name: 'Contrast', card: /^Contrast coverage/ },
  { name: 'CHIP app audit', card: /^CHIP app/ },
  { name: 'BELLA system audit', card: /^BELLA system/ },
  { name: 'Figma screens audit', card: /^CHIP Figma screens/ },
  { name: 'BELLA tokens audit', card: /^BELLA tokens/ },
];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const d of GROUPED) {
    await page.goto(`${APP}/#/health`);
    await page.reload();
    await page.waitForTimeout(2500);
    const card = page.locator('button', { hasText: d.card }).first();
    await card.waitFor({ timeout: 15000 }).catch(() => {}); // the page's data can take longer than the fixed wait
    if (!(await card.count())) { console.log(`FAIL ${width} ${d.name} groups: card not found`); bad++; continue; }
    await card.click();
    await page.waitForTimeout(1200);
    const HEAD = 'dialog [data-bella-component="branch-group"] > button';
    const groups = await page.evaluate((h) => [...document.querySelectorAll(h)].map((x) => x.textContent.trim().slice(0, 24)), HEAD);
    if (!groups.length) { console.log(`FAIL ${width} ${d.name} groups: no groups found, nothing measured`); bad++; continue; }
    const problems = [];
    for (let i = 0; i < groups.length; i++) {
      const sum = page.locator(HEAD).nth(i);
      const wasOpen = await sum.evaluate((x) => x.getAttribute('aria-expanded') === 'true');
      if (!wasOpen) await sum.click();
      await page.waitForTimeout(700);
      const res = await page.evaluate((idx) => {
        const dlg = [...document.querySelectorAll('dialog')].find((x) => x.getBoundingClientRect().width > 0);
        const det = dlg.querySelectorAll('[data-bella-component="branch-group"]')[idx];
        let sc = det;
        for (; sc && sc !== dlg; sc = sc.parentElement) { const s = getComputedStyle(sc); if (/auto|scroll/.test(s.overflowY) && sc.scrollHeight > sc.clientHeight) break; }
        const out = { header: null, empty: null, cut: [], clipped: [] };
        const box = (sc && sc !== dlg ? sc : dlg).getBoundingClientRect();
        const hs = det.querySelector(':scope > button').getBoundingClientRect();
        out.header = hs.top >= box.top - 1 && hs.bottom <= box.bottom + 1;
        if (sc && sc !== dlg) sc.scrollTop = sc.scrollHeight;
        // text a reader can see: not the inside of a closed <details>, not visually hidden (1px) text
        const leaves = [...dlg.querySelectorAll('*')].filter((k) => k.children.length === 0 && k.textContent.trim() && k.getBoundingClientRect().height > 2 && k.getBoundingClientRect().width > 2 && !k.closest('button, footer, [class*="footer"]') && ![...(function* () { for (let e = k.closest('details'); e; e = e.parentElement?.closest('details')) yield e; })()].some((e) => !e.open && !k.closest('summary')));
        const last = Math.max(...leaves.map((k) => k.getBoundingClientRect().bottom));
        out.empty = Math.round(box.bottom - last);
        // a body whose content fits has room below it by nature; only a body that scrolls must end on its content
        out.scrolls = !!(sc && sc !== dlg);
        out.cut = leaves.filter((k) => /(…|\.\.\.)$/.test(k.textContent.trim())).map((k) => k.textContent.trim().slice(-30));
        out.clipped = leaves.filter((k) => { const s = getComputedStyle(k); return (s.webkitLineClamp && s.webkitLineClamp !== 'none') || (k.scrollHeight > k.clientHeight + 2 && /hidden|clip/.test(s.overflowY) && !k.closest('summary,button')); }).map((k) => k.textContent.trim().slice(0, 30));
        return out;
      }, i);
      if (!wasOpen && !res.header) problems.push(`${groups[i]}: its header is out of view after opening`);
      if ((res.scrolls && res.empty > 160) || res.empty < -2) problems.push(`${groups[i]}: ${res.empty}px between the last content and the body's end`);
      for (const c of res.cut.slice(0, 2)) problems.push(`${groups[i]}: text ends in an ellipsis ("${c}")`);
      for (const c of res.clipped.slice(0, 2)) problems.push(`${groups[i]}: text is clipped ("${c}")`);
    }
    measured += groups.length;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${width} ${d.name}: ${groups.length} groups opened and scrolled to the end, ${problems.length} problems`);
    for (const m of [...new Set(problems)].slice(0, 6)) console.log(`       ${m}`);
    if (problems.length) bad++;
    await page.keyboard.press('Escape');
  }
  await page.close();
}

// Drift's table, one click behind its summary (the drawer template, her pick C, 23 Nov): See all opens the table; it sits
// on the title's edge, never scrolls sideways (at 320 it stacks), and a row opens that part's detail with Back.
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${APP}/#/health`);
  await page.reload();
  await page.waitForTimeout(2500);
  const card = page.locator('button', { hasText: /^Drift from BELLA/ }).first();
  await card.waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await card.count())) { console.log(`FAIL ${width} Drift table: card not found`); bad++; await page.close(); continue; }
  await card.click();
  await page.waitForTimeout(1000);
  const all = page.locator('dialog button', { hasText: /See all \d+ parts/ }).first();
  if (!(await all.count())) { console.log(`FAIL ${width} Drift table: no See all on the summary`); bad++; await page.close(); continue; }
  await all.click();
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('dialog')].find((x) => x.getBoundingClientRect().width > 0);
    const tb = dlg?.querySelector('[data-bella-component="data-table"]');
    if (!tb) return null;
    const r = (e) => e.getBoundingClientRect();
    const wrap = tb.querySelector('[data-bella-scroll-edge] > *');
    return { L: Math.round(r(dlg.querySelector('button[aria-label="Back"], h1, h2, h3')).left), tl: Math.round(r(tb).left), tr: Math.round(r(tb).right), R: Math.round(r(dlg.querySelector('button[aria-label="Close"], button:last-of-type')).right), sideways: wrap ? wrap.scrollWidth - wrap.clientWidth : 0, rows: tb.querySelectorAll('tbody tr').length };
  });
  if (!t) { console.log(`FAIL ${width} Drift table: no table after See all`); bad++; await page.close(); continue; }
  const probs = [];
  if (t.sideways > 1) probs.push(`the table scrolls sideways by ${t.sideways}px`);
  if (!t.rows) probs.push('the table has no rows');
  await page.locator('dialog [data-bella-component="data-table"] tbody tr button').first().click();
  await page.waitForTimeout(600);
  const back = await page.locator('dialog button', { hasText: /^Back/ }).count() + (await page.locator('dialog button[aria-label^="Back"]').count());
  if (!back) probs.push('a row opened no detail with Back');
  measured += 1;
  console.log(`${probs.length ? 'FAIL' : 'ok  '} ${width} Drift table: ${t.rows} rows, left ${t.tl}, right ${t.tr}, sideways ${t.sideways}px, row opens detail ${back ? 'with Back' : 'without Back'}`);
  for (const m of probs) console.log(`       ${m}`);
  if (probs.length) bad++;
  await page.close();
}

// New (23 Nov): its steps measured the same way. A step with a Back button starts its header at the Back button, so the
// edge to match is the header's left edge, not the title's. Nothing is started or written: the file is a synthetic drop
// and the check closes at the plan.
const NEW_BLOCKS = ['card', 'branch-group', 'section-head', 'notification', 'input'];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${APP}/#/work`);
  await page.reload();
  await page.waitForTimeout(2500);
  const measure = (name) =>
    page.evaluate(([blocks, step]) => {
      const dlg = [...document.querySelectorAll('dialog[open]')].pop();
      if (!dlg) return null;
      const r = (e) => e.getBoundingClientRect();
      const back = dlg.querySelector('button[aria-label="Back"]');
      const L = back ? r(back).left : r(dlg.querySelector('h1,h2,h3')).left;
      const R = r(dlg.querySelector('button[aria-label="Close"]')).right;
      const nodes = [...dlg.querySelectorAll(blocks.map((b) => `[data-bella-component="${b}"]`).join(','))].filter((n) => r(n).width > 0);
      const top = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)) && !n.closest('[data-bella-component="list-row"]') && !n.closest('[data-bella-component="branch-group"]'));
      return { step, L: Math.round(L * 10) / 10, R: Math.round(R * 10) / 10, rows: top.map((n) => [n.dataset.bellaComponent, Math.round(r(n).left * 10) / 10, Math.round(r(n).right * 10) / 10]) };
    }, [NEW_BLOCKS, name]);
  const report = async (name) => {
    await page.waitForTimeout(700);
    const res = await measure(name);
    if (!res) { console.log(`FAIL ${width} New ${name}: drawer did not open`); bad++; return; }
    const off = res.rows.filter(([, l, rt]) => Math.abs(l - res.L) > 1 || Math.abs(rt - res.R) > 1);
    measured += res.rows.length;
    console.log(`${off.length ? 'FAIL' : 'ok  '} ${width} New ${name}: header left ${res.L}, close right ${res.R}, ${res.rows.length} blocks, ${off.length} off`);
    for (const [n, l, rt] of off.slice(0, 6)) console.log(`       ${n}: left ${l} right ${rt}`);
    if (off.length) bad++;
  };
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await report('pick');
  await page.getByRole('button', { name: /^Task:/ }).click();
  await page.waitForSelector('[data-bella-component="branch-group"]', { timeout: 15000 });
  await report('task');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /^Project:/ }).click();
  await report('project');
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['# Harbour\n\nA ferry timetable.\n'], 'h.md')); return d; });
  await page.getByRole('button', { name: /^Drop an MD file/ }).locator('..').dispatchEvent('drop', { dataTransfer: dt });
  await page.waitForSelector('text=What CHIP understood');
  await report('understood');
  await page.getByRole('button', { name: 'Set up' }).click();
  await page.waitForSelector('text=things CHIP will make');
  await report('plan');
  await page.keyboard.press('Escape');
  await page.close();
}
await browser.close();
console.log(`drawer-inset-check: ${measured} blocks measured, ${bad} drawers failed`);
process.exit(bad ? 1 : 0);
