#!/usr/bin/env node
// The ratchet behind BELLA-only: counts off-system constructs per file in app/src
// against data/on-system-baseline.json. A count going up fails; a count going
// down is allowed and tightens the baseline with UPDATE_ON_SYSTEM_BASELINE=1.
// That flag can only lower a count, never raise one. Static, no browser: for the
// pre-commit hook. The dashboard's number comes from scripts/on-system.mjs.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
