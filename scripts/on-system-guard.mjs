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
const FIX = {
  'styled <a>': 'Use BELLA Link instead.',
  'css overrides --component-*': 'Set the token in BELLA’s chip theme, not in CHIP.',
  'css raw colour': 'Use a BELLA colour token (var(--color-semantic-*)) instead.',
  'css raw size': 'Use a BELLA spacing or size token (var(--spacing-*)) instead.',
};
const fixFor = (c) => {
  if (FIX[c]) return FIX[c];
  const native = c.match(/^<(\w+)>$/);
  if (native) return `Use BELLA ${NATIVE[native[1]]} instead.`;
  return `Use BELLA ${KIT[c.replace(/^kit /, '')]} instead.`;
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

function scanJs(raw) {
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
    if (COLOUR.test(value)) hits.push(['css raw colour', m.index]);
    if (SIZE.test(value.replace(/^\s*0(px|rem|em)?\s*$/, ''))) hits.push(['css raw size', m.index]);
  }
  return hits;
}

function count() {
  const out = {};
  for (const f of files(SRC)) {
    const rel = relative(ROOT, f);
    if (EXEMPT[rel]) continue;
    const raw = readFileSync(f, 'utf8');
    const hits = f.endsWith('.css') ? scanCss(raw) : scanJs(raw);
    if (!hits.length) continue;
    const row = (out[rel] = {});
    for (const [c, i] of hits) (row[c] ??= { n: 0, lines: [] }), row[c].n++, row[c].lines.push(lineAt(raw, i));
  }
  return out;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const save = (files) => writeFileSync(BASELINE, `${JSON.stringify({ about: 'Off-system constructs per file in app/src. scripts/on-system-guard.mjs fails when a count goes up.', files: sorted(files) }, null, 1)}\n`);

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
