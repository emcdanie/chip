// Rules check (Elleta, 23 Nov 2026: the ledger's "Rules that nothing checks"). One pass over every page at 1440, 768 and
// 320 that measures the running app (:3160) and the source against the CLAUDE.md rules nothing else checks:
//   edge     actions end on the right edge: in a card or banner the last button group's right edge is the content's
//            right edge, and the space above it is bigger than the space between lines of text (14 Nov)
//   notices  a notice is a one-line bar: message left, action right, one line of text at 768 and wider (16 Nov)
//   bold     no whole sentence is bold: a bold element holds a short title, never 9 words or more (22 Nov)
//   state    state words, never Red, Yellow or Green, in visible text and in source strings (22 Nov)
//   menus    every menu closes on an outside click and on Esc (23 Nov)
//   tabs     nothing opens a new tab or a raw file: source (target _blank, window.open) and live links (23 Nov)
//   branches no branch names, slugs, PR numbers or branch pickers shown to her (23 Nov)
//   drawers  drawer actions sit in BELLA Drawer's footer only, in one row (23 Nov evening): opens every drawer it can reach
//            without starting anything and FAILS on a primary or secondary Button in a drawer's body, on footer text under
//            the buttons, on a primary that is not the last button, and at 1440 on a footer helper not on the buttons'
//            row, on table text cut or touching its neighbour, on a paragraph over 40 words, and on a drawer that
//            explains in sentences with no key word marked (BELLA Marker). --shots <dir> [--tag before] also saves a
//            picture of each open drawer, for the audit page.
// Every failure prints rule, page, width and element. Usage:
//   node scripts/rules-check.mjs [--app http://localhost:3160] [--rule edge,notices] [--route '#/work'] [--width 1440]
// Needs a CHIP server and Playwright in BELLA_DIR. Exit 1 on any failure. Static rules (source) run once, not per width.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { bellaDir } from './lib/bella-dir.mjs';
import { DRAWER_RECORD, drawerInputsHash } from './lib/stage-leaders.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg('app', 'http://localhost:3160');
const ALL = ['edge', 'notices', 'bold', 'state', 'menus', 'tabs', 'branches', 'drawers'];
const RULES = (arg('rule', ALL.join(',')) ?? '').split(',').filter((r) => ALL.includes(r));
const ROUTES = arg('route', null)
  ? [arg('route')]
  : ['#/work', '#/health', '#/system/components', '#/system/foundations', '#/system/history', '#/playground', '#/system-map', '#/connectors', '#/team', '#/not-again'];
const WIDTHS = arg('width', null) ? [Number(arg('width'))] : [1440, 768, 320];

/* ---------- source rules (once) ---------- */
const findings = [];
const add = (rule, page, width, element, detail) => findings.push({ rule, page, width, element, detail });
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const SRC_FILES = walk(join(ROOT, 'app/src')).filter((f) => /\.(jsx?|mjs)$/.test(f) && !/\.stories\./.test(f));
const lines = (f) => readFileSync(f, 'utf8').split('\n').map((t, i) => [i + 1, t]);
const isComment = (t) => /^\s*(\/\/|\*|\/\*)/.test(t);

if (RULES.includes('tabs')) {
  for (const f of SRC_FILES) {
    for (const [n, t] of lines(f)) {
      if (isComment(t)) continue;
      if (/target\s*=\s*["'{]+\s*_blank|window\.open\s*\(|target:\s*['"]_blank/.test(t)) add('tabs', 'source', '-', `${relative(ROOT, f)}:${n}`, t.trim().slice(0, 110));
    }
  }
}
if (RULES.includes('state')) {
  // a quoted string or JSX text that holds Red, Yellow or Green as a word (tone="red" in lower case is a colour prop, not text)
  const re = /(['"`>])[^'"`<>]*\b(Red|Yellow|Green)\b[^'"`<>]*(['"`<])/;
  for (const f of SRC_FILES) {
    for (const [n, t] of lines(f)) {
      if (isComment(t) || /import |className|tone=|fill=|stroke=|color:|^\s*\/\//.test(t)) continue;
      const m = re.exec(t);
      if (m) add('state', 'source', '-', `${relative(ROOT, f)}:${n}`, `${m[2]}: ${t.trim().slice(0, 100)}`);
    }
  }
}
if (RULES.includes('branches')) {
  for (const f of SRC_FILES) {
    for (const [n, t] of lines(f)) {
      if (isComment(t)) continue;
      if (/aria-label=["'][^"']*branch|label:\s*['"]Branch|>\s*Branch(es)?\s*</i.test(t)) add('branches', 'source', '-', `${relative(ROOT, f)}:${n}`, `branch label: ${t.trim().slice(0, 100)}`);
    }
  }
}

/* ---------- live measurement, run in the page ---------- */
const measure = ({ rules, width }) => {
  const out = [];
  const px = (v) => parseFloat(v) || 0;
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const desc = (e) => {
    const cls = (e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const label = (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${label}"`;
  };
  const bad = (rule, e, detail) => out.push({ rule, element: desc(e), detail });
  const isCard = (el) => {
    const s = getComputedStyle(el);
    if (s.position === 'fixed' || el.matches('[role="dialog"], dialog')) return false;
    const r = el.getBoundingClientRect();
    return s.boxShadow !== 'none' && px(s.borderTopLeftRadius) >= 12 && r.width > 120 && r.height > 56 && vis(el);
  };
  const isNotice = (el) => {
    if (/toast/i.test(el.getAttribute('class') ?? '')) return false;
    return (el.matches('[role="status"], [role="alert"]') || /(^|[\s_-])(notice|banner|callout)([\s_-]|$)/i.test(el.getAttribute('class') ?? '')) && vis(el) && el.getBoundingClientRect().width > 160;
  };
  // a button that is a whole card (several text parts inside, or most of the card's width) is the card's target, not an action
  const wholeCard = (b, c) => b.querySelectorAll('h1,h2,h3,h4,p,[class*="title" i],[class*="meta" i]').length > 1 || b.getBoundingClientRect().width > 0.6 * c.getBoundingClientRect().width && b.getBoundingClientRect().height > 0.5 * c.getBoundingClientRect().height;
  const buttonLike = (b, c) => vis(b) && (b.textContent ?? '').trim().length > 0 && !wholeCard(b, c);
  const own = (c, sel) => [...c.querySelectorAll(sel)].filter((b) => b.closest('[role="dialog"], dialog') === c.closest('[role="dialog"], dialog'));

  if (rules.includes('edge') || rules.includes('notices')) {
    const boxes = [...document.querySelectorAll('body *')].filter((e) => isCard(e) || isNotice(e));
    for (const c of boxes) {
      const notice = isNotice(c);
      const cs = getComputedStyle(c);
      const cr = c.getBoundingClientRect();
      // buttons whose nearest card or notice is this one
      const near = (b) => { for (let p = b.parentElement; p; p = p.parentElement) if (boxes.includes(p)) return p; return null; };
      const buttons = [...c.querySelectorAll('button[class*="button" i], a[role="button"], a[class*="button" i]')].filter((b) => near(b) === c && buttonLike(b, c) && !b.hasAttribute('aria-expanded') && !b.matches('[role="tab"], [role="switch"], [aria-pressed]'));
      if (rules.includes('notices') && notice && width >= 768) {
        const text = [...c.querySelectorAll('*')].filter((e) => vis(e) && ![...e.children].length && !e.closest('button, a[role="button"]') && (e.textContent ?? '').trim());
        const lineCount = new Set(text.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top / 8); })).size;
        const tall = cr.height > px(cs.lineHeight) * 2 + px(cs.paddingTop) + px(cs.paddingBottom) + 4;
        if (lineCount > 1 || tall) bad('notices', c, `not one line: ${Math.round(cr.height)}px tall, ${lineCount} text rows (a notice is a one-line bar)`);
      }
      if (rules.includes('edge') && buttons.length) {
        const groups = new Map();
        for (const b of buttons) groups.set(b.parentElement, [...(groups.get(b.parentElement) ?? []), b]);
        // an action group: a parent that holds nothing but its buttons; the last one down the card is its action row
        const acts = [...groups.entries()].filter(([p, bs]) => (p.textContent ?? '').replace(/\s+/g, '') === bs.map((b) => b.textContent ?? '').join('').replace(/\s+/g, '')).map(([p, bs]) => {
          const rs = bs.map((b) => b.getBoundingClientRect());
          return { p, bs, l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top)), b: Math.max(...rs.map((r) => r.bottom)) };
        });
        if (!acts.length) continue;
        const a = acts.sort((x, y) => y.b - x.b)[0];
        // a bar's action sits at the right too; a card's row may fill the whole width
        const contentRight = cr.right - px(cs.paddingRight) - px(cs.borderRightWidth);
        const contentLeft = cr.left + px(cs.paddingLeft) + px(cs.borderLeftWidth);
        const slack = Math.abs(a.r - contentRight);
        if (slack > 2.5 && !(a.l <= contentLeft + 2 && a.r >= contentRight - 2)) bad('edge', a.bs[a.bs.length - 1], `last button ends ${Math.round(slack)}px ${a.r < contentRight ? 'short of' : 'past'} the ${notice ? 'banner' : 'card'}'s right content edge (${Math.round(a.r)} vs ${Math.round(contentRight)})`);
        // space above the actions is bigger than the space between lines of text (cards, where the actions are below the text)
        if (!notice) {
          const above = [...c.querySelectorAll('*')].filter((e) => vis(e) && ![...e.children].length && (e.textContent ?? '').trim() && !a.p.contains(e) && e.getBoundingClientRect().bottom <= a.t + 1);
          if (above.length) {
            const prev = above.sort((x, y) => y.getBoundingClientRect().bottom - x.getBoundingClientRect().bottom)[0];
            const ps = getComputedStyle(prev);
            const lineGap = Math.max(0, (px(ps.lineHeight) || px(ps.fontSize) * 1.5) - px(ps.fontSize));
            const gap = a.t - prev.getBoundingClientRect().bottom;
            if (gap <= lineGap + 0.5 && a.t > prev.getBoundingClientRect().bottom - 1) bad('edge', a.bs[0], `space above the actions is ${Math.round(gap)}px, not bigger than the ${Math.round(lineGap)}px between lines of text`);
          }
        }
      }
    }
  }

  if (rules.includes('bold')) {
    const seen = new Set();
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e) || e.closest('h1,h2,h3,h4,h5,h6,button,[role="tab"],[role="heading"],th,label,legend,code,pre,script,style,[class*="tag" i],[class*="pill" i],[class*="chip" i],[class*="badge" i]')) continue;
      const s = getComputedStyle(e);
      if (Number(s.fontWeight) < 600) continue;
      const mine = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const words = mine.split(' ').filter(Boolean).length;
      if (words >= 9 && !seen.has(mine)) {
        seen.add(mine);
        bad('bold', e, `${words} words in bold (a sentence): "${mine.slice(0, 70)}"`);
      }
    }
  }

  if (rules.includes('state') && !location.hash.startsWith('#/system/foundations')) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const e = n.parentElement;
      if (!e || !vis(e) || e.closest('script,style,code,pre,svg,[aria-hidden="true"]')) continue;
      const m = /(?<![-\w])(red|yellow|green)(?![-\w])/i.exec(n.textContent);
      if (m && !seen.has(n.textContent.trim())) {
        seen.add(n.textContent.trim());
        bad('state', e, `"${m[0]}" in: ${n.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
      }
    }
  }

  if (rules.includes('tabs')) {
    for (const a of document.querySelectorAll('a[href]')) {
      if (!vis(a)) continue;
      const href = a.getAttribute('href') ?? '';
      const marked = /new tab|external|opens/i.test(`${a.getAttribute('aria-label') ?? ''} ${a.getAttribute('title') ?? ''} ${a.textContent ?? ''}`);
      if (a.target === '_blank' && !marked) bad('tabs', a, `opens a new tab, unmarked: ${href.slice(0, 80)}`);
      if (/\.(json|jsonl|md|mjs|txt|log|yaml|yml)(\?|#|$)/i.test(href) || /^file:/i.test(href)) bad('tabs', a, `links to a raw file: ${href.slice(0, 80)}`);
      if (/^https?:\/\/(localhost|127\.0\.0\.1):(?!3160\b)\d+/.test(href) && a.target === '_blank') bad('tabs', a, `sends her to another local server: ${href.slice(0, 80)}`);
    }
  }

  if (rules.includes('branches')) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const patterns = [
      [/\b(chip|feat|fix|chore|docs|refactor|bella)\/[a-z0-9][\w./-]+/, 'branch name'],
      [/\brefs\/(heads|tags)\//, 'git ref'],
      [/\b(origin|upstream)\/[\w.-]+/, 'remote branch'],
      ...(location.hash.startsWith('#/system/foundations') ? [] : [[/\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/, 'slug']]),
      [/(^|\s)(PR\s?#?\d+|#\d{2,5})\b/, 'PR number'],
    ];
    const seen = new Set();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const e = n.parentElement;
      if (!e || !vis(e) || e.closest('script,style,code,pre,svg,kbd,[aria-hidden="true"],input,textarea')) continue;
      const t = n.textContent;
      for (const [re, kind] of patterns) {
        const m = re.exec(t);
        if (m && !seen.has(`${kind}${m[0]}`)) {
          seen.add(`${kind}${m[0]}`);
          bad('branches', e, `${kind} "${m[0].trim()}" in: ${t.replace(/\s+/g, ' ').trim().slice(0, 70)}`);
        }
      }
    }
    for (const e of document.querySelectorAll('button, select, [role="combobox"], [role="listbox"]')) {
      const label = `${e.getAttribute('aria-label') ?? ''} ${e.tagName === 'SELECT' ? [...e.options].map((o) => o.text).join(' ') : e.textContent}`;
      if (vis(e) && /\bbranch(es)?\b/i.test(label)) bad('branches', e, 'a branch picker or branch label');
    }
  }
  return out;
};

/* menus: open each trigger, close by outside click, then (fresh page) by Esc; counts the menus on screen before and after */
const triggersJs = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  // the side menu's own toggle is a drawer with its own scrim, not a menu to test with a corner click
  return [...document.querySelectorAll('button[aria-haspopup]:not([aria-haspopup="false"]), button[aria-expanded]')].filter((e) => vis(e) && !/\b(show|hide) menu\b/i.test(e.getAttribute('aria-label') ?? '')).filter(vis).map((e, i) => { e.setAttribute('data-rc-trigger', String(i)); return i; });
};
const stateJs = (i) => {
  const e = document.querySelector(`[data-rc-trigger="${i}"]`);
  const popups = [...document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [data-menu], [class*="popover" i], [class*="dropdown" i]')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; }).length;
  return { expanded: e?.getAttribute('aria-expanded') === 'true', popups };
};
const describeTrigger = (i) => {
  const e = document.querySelector(`[data-rc-trigger="${i}"]`);
  return e ? `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` : '?';
};

const { chromium } = createRequire(join(bellaDir(), 'package.json'))('playwright');

/* ---------- drawers: every drawer CHIP can open without starting anything ---------- */
// open(page) opens it; nothing here presses Approve, Start, Send, Accept, Undo, Stop or a Save. Health's cards wait for
// the page's data (about 10s on a cold server).
const card = (re) => async (page) => {
  const b = page.locator('button', { hasText: re }).first();
  await b.waitFor({ timeout: 60000 });
  await b.click();
};
const click = (role, name) => async (page) => {
  const b = page.getByRole(role, { name }).first();
  await b.waitFor({ timeout: 30000 });
  await b.click();
};
const DRAWERS = [
  { id: 'gaps', name: 'Gaps', file: 'pages/HealthContent.jsx', route: '#/health', open: card(/^Gaps/) },
  { id: 'checks', name: 'Checks', file: 'pages/HealthContent.jsx', route: '#/health', open: card(/^Checks/) },
  { id: 'drift', name: 'Drift from BELLA', file: 'pages/HealthContent.jsx', route: '#/health', open: card(/^Drift from BELLA/) },
  { id: 'drift-part', name: 'Drift: one part', file: 'pages/HealthContent.jsx', route: '#/health', open: async (p) => { await card(/^Drift from BELLA/)(p); await click('button', /^See all \d+ parts/)(p); await p.waitForTimeout(600); await p.locator('dialog[open] tbody tr').first().click(); } },
  { id: 'check-fixes', name: 'A check and its fixes', file: 'pages/HealthContent.jsx', route: '#/health', open: async (p) => { const r = p.locator('[aria-label="Component checks"] button').last(); await r.waitFor({ timeout: 60000 }); await r.click(); } },
  { id: 'contrast', name: 'Contrast coverage', file: 'pages/HealthContent.jsx', route: '#/health', open: card(/^Contrast coverage/) },
  { id: 'how', name: 'How was this measured?', file: 'pages/HealthContent.jsx', route: '#/health?drawer=how-all', open: async (p) => { await p.waitForSelector('dialog[open]', { timeout: 60000 }); } },
  { id: 'audit-ds', name: 'BELLA system audit', file: 'pages/AuditReading.jsx', route: '#/health', open: card(/^BELLA system/) },
  { id: 'audit-product', name: 'CHIP app audit', file: 'pages/AuditReading.jsx', route: '#/health', open: card(/^CHIP app/) },
  { id: 'audit-all', name: 'Every work order', file: 'pages/AuditReading.jsx', route: '#/health', open: async (p) => { await card(/^BELLA system/)(p); await click('button', /^See all \d+ work orders/)(p); } },
  { id: 'plan', name: 'A plan (Plan the build)', file: 'templates/RunPlan.jsx', route: '#/health', open: async (p) => { await card(/^Gaps/)(p); await click('button', 'Plan the build')(p); await p.waitForTimeout(800); } },
  // the running light opens the Sessions panel; the bell opens only the notifications (23 Nov)
  { id: 'sessions', name: 'Sessions panel', file: 'templates/WorkDock.jsx', route: '#/work', open: click('button', /^(Nothing running|Running|\d+ (runs )?running|Done|Did not land)/) },
  { id: 'notifications', name: 'Notifications', file: 'templates/WorkDock.jsx', route: '#/work', open: click('button', /^Notifications/) },
  { id: 'new', name: 'New', file: 'templates/NewStart.jsx', route: '#/work', open: click('button', /^\+?\s*New$/) },
  { id: 'new-task', name: 'New task', file: 'templates/NewStart.jsx', route: '#/work', open: async (p) => { await click('button', /^\+?\s*New$/)(p); await p.waitForTimeout(500); await p.locator('dialog[open] button', { hasText: /^Task/ }).first().click(); } },
  { id: 'work-card', name: 'A Work card', file: 'pages/WorkDrawer.jsx', route: '#/work', open: async (p) => { const b = p.locator('[data-bella-component="task-card"] button[aria-label^="Open"]').first(); await b.waitFor({ timeout: 30000 }); await b.click(); } },
  { id: 'history-filters', name: 'History filters', file: 'pages/HistoryContent.jsx', route: '#/system/history', open: click('button', /^Filters/) },
  { id: 'story', name: 'A part: story', file: 'pages/DocReader.jsx', route: '#/system/components/button', open: click('button', /^Story$/) },
  { id: 'file', name: 'A step: its file', file: 'pages/StepPanel.jsx', route: '#/system-map?map=pipeline&step=contrast', open: click('button', /^Open the (skill|script)/) },
  { id: 'connector', name: 'Connector setup', file: 'pages/ConnectorsContent.jsx', route: '#/connectors', open: click('button', /^Set up/) },
];
// the drawer that is open now, measured: buttons in its body, its footer's text and buttons, its rows
const drawerJs = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const dlg = [...document.querySelectorAll('dialog[open][data-bella-component="drawer"]')].filter(vis).at(-1);
  if (!dlg) return null;
  const body = dlg.querySelector(':scope > [role="region"]');
  const foot = body?.nextElementSibling ?? null;
  const name = (b) => (b.getAttribute('aria-label') || b.querySelector('[data-bella-roll="label"]')?.textContent || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const acts = (root) => [...(root?.querySelectorAll('[data-bella-component="button"]') ?? [])].filter((b) => vis(b) && ['primary', 'secondary'].includes(b.dataset.bellaVariant));
  // a numbered setup step keeps its own control (the Set up template, 23 Nov: each step has the button that opens the
  // page, the field to paste into, and Test it), so a button inside a step row with its number Pin is not counted
  const step = (b) => b.closest('[data-bella-component="list-row"]')?.querySelector('[data-bella-component="pin"]');
  // a one-line notice carries its own action at its right edge (rule "Notices are one-line bars", 16 Nov): not a
  // drawer action, so not counted (24 Nov: a plan's "Last run changed nothing · See the run")
  const notice = (b) => b.closest('[data-bella-component="notification"]');
  const inBody = acts(body).filter((b) => !step(b) && !notice(b)).map((b) => `${b.dataset.bellaVariant} "${name(b)}"`);
  const fbs = acts(foot);
  const out = { title: dlg.querySelector('h2')?.textContent?.trim() ?? '', inBody, footer: fbs.map((b) => `${b.dataset.bellaVariant} "${name(b)}"`), note: null, under: [], row: null, primaryLast: true, rows: 0, twoLine: 0 };
  // a composer footer (the Work panel's ask box, a form's field) holds fields, not an action row: its labels are not helpers
  out.composer = Boolean(foot?.querySelector('input, textarea, select, [role="combobox"]'));
  if (foot && fbs.length && !out.composer) {
    const top = Math.min(...fbs.map((b) => b.getBoundingClientRect().top));
    const bottom = Math.max(...fbs.map((b) => b.getBoundingClientRect().bottom));
    const texts = [...foot.querySelectorAll('p, span, div')].filter((e) => vis(e) && ![...e.children].length && (e.textContent ?? '').trim() && !e.closest('[data-bella-component="button"]'));
    out.under = texts.filter((e) => e.getBoundingClientRect().top >= bottom - 1).map((e) => e.textContent.trim().slice(0, 60));
    const note = texts.find((e) => e.getBoundingClientRect().bottom <= top + 1 || e.getBoundingClientRect().right <= Math.min(...fbs.map((b) => b.getBoundingClientRect().left)) + 1);
    if (note) {
      const n = note.getBoundingClientRect();
      const b = fbs[0].getBoundingClientRect();
      out.note = note.textContent.trim().slice(0, 70);
      out.row = n.right <= b.left + 1 && Math.abs((n.top + n.bottom) / 2 - (b.top + b.bottom) / 2) < b.height / 2;
    }
    const prim = fbs.findIndex((b) => b.dataset.bellaVariant === 'primary');
    out.primaryLast = prim < 0 || prim === fbs.length - 1;
  }
  // a table cell whose text is cut or runs into its neighbour (23 Nov evening, Gaps at 320: "CommentThreaSpec, no code")
  out.clipped = [...(body?.querySelectorAll('td, th') ?? [])].filter(vis).filter((c) => {
    if (c.scrollWidth > c.clientWidth + 1) return true;
    const n = c.nextElementSibling;
    if (!n || !vis(n)) return false;
    // the text of the two cells, where it is drawn: on one line they need 8 between them
    const ink = (el) => [...el.querySelectorAll('*'), el].filter((e) => vis(e) && getComputedStyle(e).clipPath === 'none' && [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())).map((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); });
    const ta = ink(c), tb = ink(n);
    if (!ta.length || !tb.length) return false;
    return ta.some((x) => tb.some((y) => x.top < y.bottom - 1 && y.top < x.bottom - 1 && y.left - x.right < 8));
  }).map((c) => (c.textContent ?? '').trim().slice(0, 30));
  // explain-scannable (23 Nov evening, her Drift drawer: "super text heavy", nothing marked): a block of text is short,
  // and a drawer that explains marks the few key words with BELLA's Marker
  const blocks = [...(body?.querySelectorAll('p, li') ?? [])].filter((e) => vis(e) && !e.querySelector('p, li') && !e.closest('table, [data-bella-component="list-row"], [data-bella-component="button"]'));
  const words = (e) => (e.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  out.longText = blocks.filter((e) => words(e) > 40).map((e) => `${words(e)} words: "${e.textContent.trim().slice(0, 50)}"`);
  out.explains = blocks.some((e) => words(e) >= 12);
  out.marked = Boolean(body?.querySelector('[data-bella-component="marker"]'));
  out.words = blocks.reduce((n, e) => n + words(e), 0);
  // words a reader sees without scrolling: every text in the body's visible box, tables and rows included
  const B = body?.getBoundingClientRect();
  const leaves = [...(body?.querySelectorAll('*') ?? [])].filter((e) => vis(e) && [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) && getComputedStyle(e).clipPath === 'none');
  out.wordsInView = B ? leaves.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= B.top && r.bottom <= B.bottom; }).reduce((n, e) => n + [...e.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join(' ').trim().split(/\s+/).filter(Boolean).length, 0) : 0;
  const rows = [...(body?.querySelectorAll('[data-bella-component="list-row"]') ?? [])].filter(vis);
  out.rows = rows.length;
  out.twoLine = rows.filter((r) => r.getBoundingClientRect().height > 72).length;
  return out;
};
const drawerReport = [];
if (RULES.includes('drawers')) {
  const shots = arg('shots', null);
  const tag = arg('tag', 'now');
  const only = arg('drawer', null);
  const b = await chromium.launch();
  for (const width of WIDTHS) {
    for (const d of DRAWERS.filter((x) => !only || only.split(',').includes(x.id))) {
      const page = await b.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${APP}/${d.route}`);
      let m = null;
      try {
        await d.open(page);
        await page.waitForSelector('dialog[open][data-bella-component="drawer"]', { timeout: 20000 });
        await page.waitForTimeout(900);
        m = await page.evaluate(drawerJs);
      } catch (e) {
        m = null;
      }
      if (!m) {
        drawerReport.push({ id: d.id, width, opened: false });
        console.log(`  drawers ${d.id} @${width}: could not open (no such item on this server)`);
        await page.close();
        continue;
      }
      if (shots) await page.screenshot({ path: join(shots, `${d.id}-${tag}-${width}.png`) });
      drawerReport.push({ id: d.id, name: d.name, file: d.file, width, opened: true, ...m });
      const where = `${d.name} (${d.file})`;
      for (const x of m.inBody) add('drawers', d.route, width, where, `${x} sits in the drawer's body; actions go in the footer`);
      for (const x of m.under) add('drawers', d.route, width, where, `footer text under the buttons: "${x}"; it goes at the left of the buttons' row (footerNote)`);
      for (const x of m.longText ?? []) add('drawers', d.route, width, where, `a paragraph over 40 words (${x}); say it in short bullets`);
      if (m.explains && !m.marked) add('drawers', d.route, width, where, 'explains in sentences but marks no key word (BELLA Marker)');
      for (const x of m.clipped ?? []) add('drawers', d.route, width, where, `table text cut or touching its neighbour: "${x}"`);
      if (!m.primaryLast) add('drawers', d.route, width, where, 'the primary is not the last button in the footer');
      if (width >= 1440 && m.row === false) add('drawers', d.route, width, where, `footer helper "${m.note}" is not on the buttons' row`);
      await page.close();
    }
  }
  await b.close();
  if (shots) writeFileSync(join(shots, `drawers-${tag}-${WIDTHS.join('-')}${only ? `-${only}` : ''}.json`), JSON.stringify(drawerReport, null, 1));
  // a full run (every drawer, 1440 among the widths) is the record the commit guard reads
  if (!only && WIDTHS.includes(1440)) {
    const bad = findings.filter((f) => f.rule === 'drawers').length;
    writeFileSync(DRAWER_RECORD, JSON.stringify({ at: new Date().toISOString(), hash: drawerInputsHash(), ok: !bad, bad, opened: drawerReport.filter((x) => x.opened).length, of: drawerReport.length }, null, 1));
  }
}
const live = RULES.filter((r) => ['edge', 'notices', 'bold', 'state', 'tabs', 'branches', 'menus'].includes(r));
const pageRules = live.length;
const browser = await chromium.launch();
let loads = 0;
const matrix = [];
for (const width of pageRules ? WIDTHS : []) {
  for (const hash of ROUTES) {
    loads += 1;
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 80)));
    await page.goto(`${APP}/${hash}`);
    await page.waitForTimeout(3000);
    const before = findings.length;
    const found = await page.evaluate(measure, { rules: live.filter((r) => r !== 'menus'), width });
    for (const f of found) add(f.rule, hash, width, f.element, f.detail);
    let menus = 0;
    if (live.includes('menus') && (width === WIDTHS[0] || width === WIDTHS[WIDTHS.length - 1])) {
      const ids = await page.evaluate(triggersJs);
      for (const i of ids.slice(0, 10)) {
        for (const how of ['outside click', 'Esc']) {
          try {
            if (menus || i || how === 'Esc') {
              await page.reload();
              await page.waitForTimeout(1500);
              await page.evaluate(triggersJs);
            }
            const trig = page.locator(`[data-rc-trigger="${i}"]`);
            const was = await page.evaluate(stateJs, i);
            await trig.scrollIntoViewIfNeeded({ timeout: 1500 });
            await trig.click({ timeout: 1500 });
            await page.waitForTimeout(400);
            const open = await page.evaluate(stateJs, i);
            const hasPopup = await trig.evaluate((e) => !!e.getAttribute('aria-haspopup') && e.getAttribute('aria-haspopup') !== 'false');
            if (!(open.popups > was.popups) && !(hasPopup && open.expanded && !was.expanded)) break; // it did not open a menu: not one
            menus += 1;
            if (how === 'Esc') await page.keyboard.press('Escape');
            else await page.mouse.click(width - 3, 897);
            await page.waitForTimeout(400);
            const after = await page.evaluate(stateJs, i);
            if (after.expanded || after.popups > was.popups) add('menus', hash, width, await page.evaluate(describeTrigger, i), `stays open after ${how}`);
          } catch (e) {
            if (process.env.RC_DEBUG) console.log('menu error', hash, i, how, String(e).slice(0, 120));
            break;
          }
        }
      }
    }
    matrix.push(`${hash} @${width}: ${findings.length - before} failure(s)${live.includes('menus') ? `, ${menus} menu open(s) tried` : ''}${errs.length ? `, page error: ${errs[0]}` : ''}`);
    await page.close();
  }
}
await browser.close();

/* ---------- report ---------- */
const uniq = new Map();
for (const f of findings) uniq.set(`${f.rule}|${f.page}|${f.width}|${f.element}|${f.detail}`, f);
const list = [...uniq.values()];
for (const r of RULES) {
  const fs = list.filter((f) => f.rule === r);
  console.log(`\n${fs.length ? 'FAIL' : 'PASS'}  ${r}  (${fs.length})`);
  for (const f of fs) console.log(`  ${f.page} @${f.width}  ${f.element}  ${f.detail}`);
}
if (RULES.includes('drawers')) console.log(`\nOpened ${drawerReport.filter((x) => x.opened).length} of ${drawerReport.length} drawer-widths (${DRAWERS.length} drawers)`);
console.log(`\nMeasured ${loads} page loads (${ROUTES.length} pages x ${WIDTHS.length} widths), rules: ${RULES.join(', ')}`);
for (const m of matrix) console.log(`  ${m}`);
const out = join(tmpdir(), 'chip-rules-check.json');
writeFileSync(out, JSON.stringify(list, null, 1));
console.log(`Report: ${out}`);
process.exit(list.length ? 1 : 0);
