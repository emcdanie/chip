#!/usr/bin/env node
// The ratchet behind BELLA-only: counts off-system constructs per file in app/src
// against data/on-system-baseline.json. A count going up fails; a count going
// down is allowed and tightens the baseline with UPDATE_ON_SYSTEM_BASELINE=1.
// That flag can only lower a count, never raise one. Static, no browser: for the
// pre-commit hook. The dashboard's number comes from scripts/on-system.mjs.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RECORD, WATCHED, leaderInputsHash, PROCESS_RECORD, PROCESS_WATCHED, processInputsHash, CARD_RECORD, routeWhy, scrollWhy, RESPONSIVE_RECORD, PAGE_ROUTES, fileHashes, cardWatched, STRIP_WATCHED, STRIP_RECORD, stripInputsHash, SCROLL_WATCHED, SCROLL_RECORD, scrollInputsHash, DRAWER_WATCHED, DRAWER_RECORD, drawerInputsHash } from './lib/stage-leaders.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'data/on-system-baseline.json');
const SRC = join(ROOT, 'app/src');

// Exempt only here, one line per file, with the reason. Empty on purpose:
// specimens.jsx has nothing to count, and the rest is held by the baseline.
const EXEMPT = {};

const NATIVE = { button: 'Button', table: 'DataTable', input: 'Input', select: 'Select', dialog: 'Drawer' };
const KIT = { StatusPill: 'StatusPill', DataTable: 'DataTable', Card: 'Card', PageHeader: 'PageHeader', Segmented: 'SegmentedControl', Sheet: 'Drawer', Drawer: 'Drawer', Toggle: 'Button with ariaExpanded' };

// CSS files allowed in app/src (19 Nov 2026, frozen at what exists): pages
// compose BELLA parts and the template, so a new page brings no CSS file.
// A file can leave this list, never join it without Elleta's yes.
const CSS_ALLOW = new Set([
  'app/src/Connectors.css', 'app/src/DoNext.css', 'app/src/Foundations.css', 'app/src/History.css',
  'app/src/Playground.css', 'app/src/Projects.css', 'app/src/app.css', 'app/src/atlas.css',
  'app/src/shell.css', 'app/src/kit/kit.css', 'app/src/kit/tokens.css',
]);
const FIX = {
  'styled <a>': 'Use BELLA Link instead.',
  'css overrides --component-*': 'Set the token in BELLA’s chip theme, not in CHIP.',
  'css raw colour': 'Use a BELLA colour token (var(--color-semantic-*)) instead.',
  'css raw size': 'Use a BELLA spacing or size token (var(--spacing-*)) instead.',
  'css part selector': 'Never restyle a BELLA part from outside ([data-bella-component] or [class*=] selectors). Report the part gap.',
  'css defines custom property': 'Custom properties live in BELLA tokens only. Use the BELLA token, or ask for one.',
  'css font-family literal': 'Use a BELLA typography font-family token.',
  'inline style colour': 'Use a BELLA colour token, through a part.',
  'inline style raw size': 'Use a BELLA spacing or size token.',
  'inline font-family literal': 'Use a BELLA typography token, through a part.',
  'inline radius or shadow literal': 'Corners and shadows come from BELLA parts and tokens.',
  'kit defines a BELLA duplicate': 'BELLA has this part; use it and delete the kit copy.',
  'bold sentence title': 'Pass a short title (the area or name) and put the sentence in the regular text; no whole sentence is ever bold.',
  'typed measure': 'Compute the number or status from its source when the page loads (Measured, never typed).',
};
const fixFor = (c) => {
  if (FIX[c]) return FIX[c];
  const native = c.match(/^<(\w+)>$/);
  if (native) return `Use BELLA ${NATIVE[native[1]]} instead.`;
  const kit = KIT[c.replace(/^kit /, '')];
  return kit ? `Use BELLA ${kit} instead.` : 'Use BELLA instead.';
};

function files(dir, out = []) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(jsx|js|css)$/.test(f)) out.push(p);
  }
  return out;
}
const lineAt = (s, i) => s.slice(0, i).split('\n').length;
// comments blanked, newlines kept so line numbers stay true
const blank = (m) => m.replace(/[^\n]/g, ' ');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|\s)\/\/[^\n]*/g, blank);

// the end of a JSX opening tag, stepping over {…} and quoted attributes
function tagEnd(s, from) {
  let depth = 0;
  let q = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return s.length;
}

function scanJs(raw, isFixture = false) {
  const s = noComments(raw);
  const hits = [];
  for (const m of s.matchAll(/<(button|table|input|select|dialog)(?=[\s/>])/g)) hits.push([`<${m[1]}>`, m.index]);
  for (const m of s.matchAll(/<a(?=[\s>])/g)) {
    const tag = s.slice(m.index, tagEnd(s, m.index));
    if (/\s(className|style)=/.test(tag)) hits.push(['styled <a>', m.index]);
  }
  for (const m of s.matchAll(/import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*\/kit(?:\/index(?:\.jsx)?)?['"]/g))
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (KIT[name]) hits.push([`kit ${name}`, m.index]);
    }
  // inline styles: a page carries no colour, size, font, corner or shadow of its own
  for (const m of s.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) {
    const body = m[1];
    if (COLOUR.test(body)) hits.push(['inline style colour', m.index]);
    // a length typed in: a unit literal, or a box property given a bare non-zero number (React reads it as px)
    if (/(?<![\w#.-])\d*\.?\d+(?:px|rem|em|vh|vw)\b/.test(body) ||
        /\b(?:(?:min|max)?(?:[Ww]idth|[Hh]eight|InlineSize|BlockSize)|inlineSize|blockSize|padding\w*|margin\w*|gap|rowGap|columnGap|top|left|right|bottom|inset\w*|fontSize)\s*:\s*[1-9]/.test(body))
      hits.push(['inline style raw size', m.index]);
    if (/fontFamily\s*:\s*['"`]/.test(body)) hits.push(['inline font-family literal', m.index]);
    if (/(?:borderRadius|boxShadow)\s*:\s*(?!['"`]var\()['"`\d]/.test(body)) hits.push(['inline radius or shadow literal', m.index]);
  }
  // a whole sentence as a bold title (her repeat, 22 Nov: "why is the font all bold?"): Step, ListRow and TaskCard
  // set their title bold, so a typed title is a short name (an area, a part), never a sentence or over 40 characters
  for (const m of s.matchAll(/<(Step|ListRow|TaskCard)\b/g)) {
    const tag = s.slice(m.index, tagEnd(s, m.index));
    const t = tag.match(/\btitle=(?:"([^"]*)"|'([^']*)'|\{\s*['"`]([^'"`$]*)['"`]\s*\})/);
    const words = t ? (t[1] ?? t[2] ?? t[3] ?? '') : '';
    if (words.length > 40 || /[.!?]\s+\S/.test(words)) hits.push(['bold sentence title', m.index]);
  }
  // a measure typed in (her rule "Measured, never typed", 22 Nov: 19 of 45 numbers were wrong): a count of
  // parts, checks, runs… or a status like "gate green" written as text, where the data sweep has a source
  // fixtures (*Fixture.js) are Figma's sample data for stories, so they may type numbers
  if (!isFixture) for (const m of s.matchAll(/(["'>])([^"'<>{}`\n]*?(?:\b\d+(?: of \d+)? (?:parts|checks|components|pairs|tests|runs|tasks|commits|stories)\b|(?<!make the )\bgate (?:is )?green\b|\bon main\b)[^"'<>{}`\n]*)\1?/gi))
    hits.push(['typed measure', m.index]);
  // the kit's own copies of parts BELLA has (frozen: may only go away)
  for (const m of s.matchAll(/export\s+(?:default\s+)?function\s+(StatusPill|DataTable|Card|PageHeader|Segmented|Sheet|Drawer)\b/g))
    hits.push(['kit defines a BELLA duplicate', m.index]);
  return hits;
}
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;
const SIZE = /(?<![\w#.-])\d*\.?\d+(?:px|rem|em|vh|vw|vmin|vmax|ch|pt)\b/;
function scanCss(raw) {
  const s = noComments(raw);
  const hits = [];
  for (const m of s.matchAll(/([-\w]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const [, prop, value] = m;
    if (prop.startsWith('--component-')) hits.push(['css overrides --component-*', m.index]);
    else if (prop.startsWith('--')) hits.push(['css defines custom property', m.index]);
    // a family written out (not a BELLA font-family token): font-family not a
    // var/inherit, or a font shorthand that does not end in the family token
    if ((prop === 'font-family' && !/^\s*(?:var\(|inherit\b|unset\b)/.test(value)) ||
        (prop === 'font' && !/^\s*inherit\s*$/.test(value) && !/var\(--[\w-]*font-family[\w-]*\)\s*$/.test(value)))
      hits.push(['css font-family literal', m.index]);
    if (COLOUR.test(value)) hits.push(['css raw colour', m.index]);
    if (SIZE.test(value.replace(/^\s*0(px|rem|em)?\s*$/, ''))) hits.push(['css raw size', m.index]);
  }
  for (const m of s.matchAll(/\[(?:data-bella-component|class\*=)[^\]]*\]/g)) hits.push(['css part selector', m.index]);
  return hits;
}

function count() {
  const out = {};
  for (const f of files(SRC)) {
    const rel = relative(ROOT, f);
    if (EXEMPT[rel]) continue;
    const raw = readFileSync(f, 'utf8');
    const hits = f.endsWith('.css') ? scanCss(raw) : scanJs(raw, /Fixture\.js$/.test(f));
    if (!hits.length) continue;
    const row = (out[rel] = {});
    for (const [c, i] of hits) (row[c] ??= { n: 0, lines: [] }), row[c].n++, row[c].lines.push(lineAt(raw, i));
  }
  return out;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const save = (files) => writeFileSync(BASELINE, `${JSON.stringify({ about: 'Off-system constructs per file in app/src. scripts/on-system-guard.mjs fails when a count goes up.', files: sorted(files) }, null, 1)}\n`);

// Templates own their grid (coordinator, 19 Nov 2026: "one template CSS file
// for its grid only"): CSS under app/src/templates/ is allowed, and the counts
// below hold it to token values (no raw colour, size or font, no part selector).
const TEMPLATES = 'app/src/templates/';
const strayCss = files(SRC).map((f) => relative(ROOT, f)).filter((f) => f.endsWith('.css') && !CSS_ALLOW.has(f) && !f.startsWith(TEMPLATES));
if (strayCss.length) {
  console.error(`on-system-guard: new CSS file(s) in app/src. Pages compose BELLA parts and the template; no CSS file per page.\n  ${strayCss.join('\n  ')}`);
  process.exit(1);
}

// No sparkles, anywhere (Elleta, 22 Nov, a repeat: "NO sparkles"; CHIP CLAUDE.md): no ✨ and no Sparks, Stars or
// Sparkle icon in app/src. Not a ratchet: one is enough to fail the commit.
const SPARKLE = /✨|🌟|💫|['"](?:Sparks|Stars|Sparkle|Sparkles)['"]|\b(?:icon|mark|name)=["'{]?["']?(?:Sparks|Stars|Sparkle|Sparkles)\b/;
const sparkles = files(SRC)
  .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [relative(ROOT, f), i + 1, l]))
  .filter(([, , l]) => SPARKLE.test(l));
if (sparkles.length) {
  console.log(`on-system-guard: a sparkle in app/src. Commit blocked (no ✨, Sparks, Stars or Sparkle anywhere).`);
  for (const [f, n, l] of sparkles) console.log(`  ${f}:${n}  ${l.trim().slice(0, 100)}`);
  process.exit(1);
}

// Person emoji are the woman variant (Elleta, 22 Nov: "can we use female emojis"; CHIP CLAUDE.md): a person emoji in app/src
// carries the female sign (base + U+200D + U+2640 + U+FE0F), and a man or a person is a woman (👩). Not a ratchet.
const PERSON = '🙅🙆💁🙋🙇🤦🤷💆💇🚶🏃🧍🧎🧏🙍🙎🤵👰🤱🧖🧗🧘🏌🏄🚣🏊⛹🏋🚴🚵🤸🤼🤽🤾🤹👮🕵💂🥷👷🤴👸👳👲🧕🦸🦹🧙🧚🧛🧜🧝🧞🧟🧔👨🧑';
const MAN = /[👨🧑]/u;
const BARE = new RegExp(`[${PERSON}]\\uFE0F?[\\u{1F3FB}-\\u{1F3FF}]?(?!\\u200D)`, 'u');
const persons = files(SRC)
  .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [relative(ROOT, f), i + 1, l]))
  .filter(([, , l]) => BARE.test(l) || MAN.test(l));
if (persons.length) {
  console.log('on-system-guard: a person emoji without the female sign in app/src. Commit blocked (use the woman variant: 🙅\u200D♀️, 🤷\u200D♀️, 👩).');
  for (const [f, n, l] of persons) console.log(`  ${f}:${n}  ${l.trim().slice(0, 100)}`);
  process.exit(1);
}

// Nothing sends her out of CHIP (Elleta, 23 Nov, CHIP CLAUDE.md "READ FIRST"): a report, plan, audit or log opens in the
// drawer on the page, never as a link or new tab to /audits/*, a docs/ path or a raw .md file. fetch() of the report is fine.
// Not a ratchet: one is enough to fail the commit.
const LEAVES = /(?:\bhref=|\bwindow\.open\()\s*\{?\s*[`'"]\/?(?:audits\/|docs\/)|\bhref=\{?\s*[`'"][^`'"]*\.md[`'"]/;
const leaving = files(SRC)
  .flatMap((f) => noComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [relative(ROOT, f), i + 1, l]))
  .filter(([, , l]) => LEAVES.test(l));
if (leaving.length) {
  console.log('on-system-guard: a link that leaves CHIP for a report, audit or raw file. Commit blocked (open it in the drawer on the page).');
  for (const [f, n, l] of leaving) console.log(`  ${f}:${n}  ${l.trim().slice(0, 100)}`);
  process.exit(1);
}

// Nor does a page or template open another tab or address (23 Nov): window.open, target="_blank" and a literal
// http(s) href in app/src/pages and app/src/templates fail the commit. A link out that is deliberate or still waiting
// for its page's owner goes on this list with its reason; anything else opens in the drawer or an in-app route.
const OUT = /\bwindow\.open\(|\btarget=\{?[`'"]_blank|\bhref=\{?\s*[`'"]https?:\/\/|\bhref:\s*[`'"]https?:\/\//;
const OUT_ALLOWED = [
  ['pages/WorkContent.jsx', "kind === 'link'", 'a pull request card opens the pull request on GitHub'],
  ['pages/ComponentsContent.jsx', 'part.storyUrl', 'the part\'s Storybook story, a design tool; for the coordinator to confirm it stays external'],
  // set up steps (23 Nov, Set up drawers use one setup template): the button opens the third-party page where the step
  // happens (Notion, Figma, Ollama, Claude Code). Those sites need her own sign-in and refuse framing, and the button's words say "(opens the site)"
  ['templates/SetupSteps.jsx', 'window.open(href', 'set up: opens the tool where the step happens'],
  ['templates/ConnectorSetup.jsx', '<OpenPage', 'set up: opens the tool where the step happens'],
  ['templates/FigmaSetup.jsx', '<OpenPage', 'set up: opens Figma settings to make the token'],
  ['pages/ComponentsContent.jsx', 'github.com', 'the commit on GitHub; to open in CHIP once Components is free to edit'],
  // Sources are the real thing (23 Nov): no in-CHIP reader for articles yet, so a clearly marked link
  ['pages/AuditReportsContent.jsx', 'learn.thedesignsystem.guide/p/', 'the source article of two Benchmark tiles, marked "opens the site"'],
];
const out = files(join(SRC, 'pages'))
  .concat(files(join(SRC, 'templates')))
  .flatMap((f) => noComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [relative(ROOT, f), i + 1, l]))
  .filter(([f, , l]) => OUT.test(l) && !OUT_ALLOWED.some(([file, text]) => f.endsWith(file) && l.includes(text)));
if (out.length) {
  console.log('on-system-guard: a link that opens a new tab or leaves CHIP in a page or template. Commit blocked (open it inside CHIP, or list it in OUT_ALLOWED with its reason).');
  for (const [f, n, l] of out) console.log(`  ${f}:${n}  ${l.trim().slice(0, 100)}`);
  process.exit(1);
}

// A commit names its paths (CHIP CLAUDE.md "Shared checkouts", 22 Nov: two commits swept in another session's
// staged files): in scripts, server code and package.json a `git commit` must give `-- <paths>`, or run in its own
// temporary worktree (`git -C <dir> commit`). Not a ratchet.
const COMMIT_DIRS = ['scripts', 'server', 'bin'].map((d) => join(ROOT, d));
const codeFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'test') continue;
    if (statSync(p).isDirectory()) codeFiles(p, out);
    else if (/\.(mjs|js|sh)$/.test(f)) out.push(p);
  }
  return out;
};
const bareCommits = [...COMMIT_DIRS.flatMap((d) => codeFiles(d)), join(ROOT, 'package.json')]
  .filter((f) => existsSync(f) && f !== fileURLToPath(import.meta.url))
  .flatMap((f) => noComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [relative(ROOT, f), i + 1, l]))
  .filter(([, , l]) => (/\bgit\s+(?:-\S+\s+)*commit\b/.test(l) && !/\scommit\b[^\n]*\s--\s/.test(l) && !/git\s+-C\s/.test(l)) || (/['"]commit['"]/.test(l) && /['"]git['"]|\bsh\(|\bgit\(/.test(l) && !/['"]-C['"]/.test(l) && !/['"]--['"]/.test(l)));
if (bareCommits.length) {
  console.log('on-system-guard: a git commit without paths. Commit blocked (use git commit -- <paths>, or git -C <its own worktree>).');
  for (const [f, n, l] of bareCommits) console.log(`  ${f}:${n}  ${l.trim().slice(0, 100)}`);
  process.exit(1);
}

// Routes (Elleta, 23 Nov evening: a menu item opened an old page design): every side-menu item, tab, Find page,
// breadcrumb, redirect and server link must open a current page, and main.jsx must never render the retired app.
// Static and quick, so it runs on every guard run, not only when main.jsx, Screen.jsx or routes.js are staged.
if (existsSync(join(ROOT, 'scripts/route-check.mjs'))) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/route-check.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stdout.write(r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + '\n');
    console.log('on-system-guard: a menu item, link or redirect opens a retired page (npm run check:routes). Commit blocked.');
    process.exit(1);
  }
}

// The stage's labels and leaders: a commit that changes the files drawing them needs a clean full run of
// `npm run check:leaders` on exactly these files (23 Nov: leaders crossing, a label through another).
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (WATCHED.some((f) => staged.includes(f))) {
    const rec = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null;
    const why = !rec ? 'it has not been run' : rec.hash !== leaderInputsHash() ? 'it ran on other files than these' : !rec.full ? 'its last run was one part only' : !rec.ok ? `it found ${rec.total - rec.clean} of ${rec.total} part-widths not clean` : null;
    if (why) {
      console.log(`on-system-guard: the stage's labels changed and the leader check is not clean (${why}). Run npm run check:leaders. Commit blocked.`);
      process.exit(1);
    }
  }
}

// Scroll chaining: a commit that changes how a box scrolls needs a clean full run of `npm run check:scroll` on
// exactly these files (22 Nov: a card scrolled to its end and the page would not move).
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (SCROLL_WATCHED.some((f) => staged.includes(f))) {
    const rec = existsSync(SCROLL_RECORD) ? JSON.parse(readFileSync(SCROLL_RECORD, 'utf8')) : null;
    const why = scrollWhy(rec, scrollInputsHash());
    if (why) {
      console.log(`on-system-guard: scrolling changed and the scroll check is not clean (${why}). Run npm run check:scroll. Commit blocked.`);
      process.exit(1);
    }
  }
}

// The strip under the stage: a commit that changes the files building it needs a clean full run of
// `npm run check:states` (all 98 parts, 1440 and 320) on exactly these files.
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (STRIP_WATCHED.some((f) => staged.includes(f))) {
    const rec = existsSync(STRIP_RECORD) ? JSON.parse(readFileSync(STRIP_RECORD, 'utf8')) : null;
    const why = !rec ? 'it has not been run' : rec.hash !== stripInputsHash() ? 'it ran on other files than these' : !rec.ok ? `it found ${rec.bad} strips that are not the part's own states` : null;
    if (why) {
      console.log(`on-system-guard: the states strip changed and its check is not clean (${why}). Run npm run check:states. Commit blocked.`);
      process.exit(1);
    }
  }
}

// Drawers: a commit that changes a file holding a drawer needs a clean full run of `npm run check:drawers` on exactly
// these files (23 Nov evening: actions in the footer only, the helper on the buttons' row).
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (DRAWER_WATCHED.some((f) => staged.includes(f))) {
    const rec = existsSync(DRAWER_RECORD) ? JSON.parse(readFileSync(DRAWER_RECORD, 'utf8')) : null;
    const why = !rec ? 'it has not been run' : rec.hash !== drawerInputsHash() ? 'it ran on other files than these' : !rec.ok ? `it found ${rec.bad} drawer actions out of place` : null;
    if (why) {
      console.log(`on-system-guard: a drawer changed and the drawer check is not clean (${why}). Run npm run check:drawers. Commit blocked.`);
      process.exit(1);
    }
  }
}

// Processes' lines: a commit that changes the board needs a clean full run of `npm run check:process-lines` on
// exactly this file (23 Nov: lines through a step or its text).
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (PROCESS_WATCHED.some((f) => staged.includes(f))) {
    const rec = existsSync(PROCESS_RECORD) ? JSON.parse(readFileSync(PROCESS_RECORD, 'utf8')) : null;
    const why = !rec ? 'it has not been run' : rec.hash !== processInputsHash() ? 'it ran on another version of the file' : !rec.ok ? `it found ${rec.total - rec.clean} of ${rec.total} map-widths not clean` : null;
    if (why) {
      console.log(`on-system-guard: the Processes board changed and the line check is not clean (${why}). Run npm run check:process-lines. Commit blocked.`);
      process.exit(1);
    }
  }
}

// Cards: a commit that changes a page needs a clean full run of `npm run check:cards` for the routes that page draws, on
// exactly its files; a shared template needs every route clean (per page, 23 Nov evening) (23 Nov: cards that do not line up and leave white space).
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  if (cardWatched().some((f) => staged.includes(f))) {
    const rec = existsSync(CARD_RECORD) ? JSON.parse(readFileSync(CARD_RECORD, 'utf8')) : null;
    const why = routeWhy(rec, staged, fileHashes());
    if (why) {
      console.log(`on-system-guard: a page or the templates changed and the card check is not clean (${why}). Run npm run check:cards. Commit blocked.`);
      process.exit(1);
    }
  }
}

// Responsive: a commit that changes a page needs a clean full run of `npm run check:responsive` for that page, on
// exactly its file; a shared template needs every page clean (23 Nov: "you didnt check it in responsive screen..
// you should just do that every time"): 1440, 1024, 768 and 320, light and dark.
{
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
  const mine = cardWatched().filter((f) => staged.includes(f));
  if (mine.length) {
    const rec = existsSync(RESPONSIVE_RECORD) ? JSON.parse(readFileSync(RESPONSIVE_RECORD, 'utf8')) : null;
    const now = fileHashes();
    let why = !rec ? 'it has not been run' : null;
    for (const f of mine) {
      if (why) break;
      if (rec.files?.[f] !== now[f]) { why = `it ran on another version of ${f}`; break; }
      const routes = f.includes('/templates/') ? Object.keys(rec.routes ?? {}) : PAGE_ROUTES.filter(([re]) => re.test(f)).map(([, r]) => r);
      const bad = (routes.length ? routes : Object.keys(rec.routes ?? {})).filter((r) => rec.routes?.[r] !== true);
      if (bad.length) why = `${f} is not clean on ${bad.join(', ')}`;
    }
    if (why) {
      console.log(`on-system-guard: a page or the templates changed and the responsive check is not clean (${why}). Run npm run check:responsive. Commit blocked.`);
      process.exit(1);
    }
  }
}

const now = count();
const update = process.env.UPDATE_ON_SYSTEM_BASELINE === '1';
const flat = (o) => Object.fromEntries(Object.entries(o).map(([f, r]) => [f, sorted(Object.fromEntries(Object.entries(r).map(([c, v]) => [c, v.n])))]));

if (!existsSync(BASELINE)) {
  if (!update) {
    console.error('on-system-guard: no data/on-system-baseline.json. Create it once with UPDATE_ON_SYSTEM_BASELINE=1.');
    process.exit(1);
  }
  save(flat(now));
  console.log('on-system-guard: baseline written.');
  process.exit(0);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
const up = [];
const down = [];
for (const f of new Set([...Object.keys(now), ...Object.keys(base)])) {
  for (const c of new Set([...Object.keys(now[f] ?? {}), ...Object.keys(base[f] ?? {})])) {
    const was = base[f]?.[c] ?? 0;
    const is = now[f]?.[c]?.n ?? 0;
    if (is > was) up.push(`${f}: ${c} went from ${was} to ${is} (lines ${now[f][c].lines.join(', ')}). ${fixFor(c)}`);
    else if (is < was) down.push(`${f}: ${c} ${was} to ${is}`);
  }
}
if (up.length) {
  console.error(`on-system-guard: new off-system code. Commit blocked.\n  ${up.join('\n  ')}`);
  process.exit(1);
}
if (down.length && update) {
  const tightened = flat(now);
  save(tightened);
  console.log(`on-system-guard: baseline tightened.\n  ${down.join('\n  ')}`);
} else if (down.length) {
  console.log(`on-system-guard: fewer off-system constructs in ${down.length} place(s). Lock it in with UPDATE_ON_SYSTEM_BASELINE=1.`);
} else {
  console.log('on-system-guard: no new off-system code.');
}
