#!/usr/bin/env node
// sync-foundations: reads the real BELLA repo (read-only) and writes
// data/foundations.json for the Foundations page: the type, radius, spacing
// and motion scales from tokens/primitive.json, each semantic colour role's
// primitive reference from tokens/semantic/{light,dark}.json, the font
// contract from bella.dsds.yaml, and a count of every declaration in
// src/components/*/*.module.css by property (Tokenized?).
//
// Colour values, contrast and usage come from data/bella.json (sync-bella);
// this file adds only what that one doesn't carry. Never invents a number.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bellaDir } from './lib/bella-dir.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BELLA = bellaDir();
const read = (p) => readFileSync(join(BELLA, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

// tokens live in tokens/ (BELLA main) or tokens/figma/ (chip/parts-dev, from the published library)
const TOK = existsSync(join(BELLA, 'tokens/figma/primitive.json')) ? 'tokens/figma' : 'tokens';
if (!existsSync(join(BELLA, `${TOK}/primitive.json`))) {
  console.error(`sync-foundations: BELLA not found at ${BELLA} (set BELLA_DIR)`);
  process.exit(1);
}

const prim = readJson(`${TOK}/primitive.json`);
const git = (...a) => execFileSync('git', ['-C', BELLA, ...a], { encoding: 'utf8' }).trim();

// a DTCG group as [{ name, value, description }], in file order
const steps = (group) =>
  Object.entries(group)
    .filter(([k, v]) => !k.startsWith('$') && v && typeof v === 'object' && '$value' in v)
    .map(([name, v]) => ({ name, value: v.$value, description: v.$description ?? null }));

// ---- colour: each role's primitive reference, per theme ------------------
const ref = (v) => (typeof v === 'string' && /^\{.+\}$/.test(v) ? v.slice(1, -1).replace(/^color\./, '') : null);
const refs = {};
for (const theme of TOK === 'tokens' ? ['light', 'dark'] : []) {
  for (const [role, v] of Object.entries(readJson(`tokens/semantic/${theme}.json`).color.semantic)) {
    if (!v || !('$value' in v)) continue;
    (refs[`--color-semantic-${role}`] ??= {})[theme] = ref(v.$value);
  }
}

// ---- type -----------------------------------------------------------------
const T = prim.typography;
const dsds = read('bella.dsds.yaml');
// the contract's description of a token: the first `description:` line of its entry
const contract = (id) => dsds.match(new RegExp(`id: ${id.replace(/\./g, '\\.')}\\n(?: {4}(?!description).*\\n)*? {4}description: "?(.+?)"?\\n`))?.[1] ?? null;
const face = (v) => v.split(',')[0].replace(/['"]/g, '').trim();
const ROLE = { display: 'Headings', body: 'Body and controls', mono: 'Code, tokens, hashes' };
const families = steps(T['font-family']).map((f) => {
  const said = contract(`typography.font-family.${f.name}`);
  const named = said?.match(/\b(Newsreader|DM Sans|Geist Mono|Figtree|Unique|Inter|Georgia)\b/)?.[1] ?? null;
  // the weights the token's own description names: "DM Sans 400 and 600"
  const w = f.description?.match(new RegExp(`${face(f.value)} ([1-9]00(?:(?: and |, | · )[1-9]00)*)`))?.[1].split(/ and |, | · /) ?? [];
  return { token: `font-family.${f.name}`, name: f.name, role: ROLE[f.name] ?? f.name, face: face(f.value), weights: w, value: f.value, contract: said, contractFace: named, matches: named ? named === face(f.value) : null };
});
// a fluid size keeps its clamp's ends: clamp(48px, …, 82px) → 48 and 82
const px = (v) => {
  const c = /^clamp\(\s*([\d.]+)px.*,\s*([\d.]+)px\s*\)$/.exec(v);
  if (c) return { min: +c[1], max: +c[2], fluid: true };
  const m = /^([\d.]+)px$/.exec(v);
  return m ? { min: +m[1], max: +m[1], fluid: false } : null;
};
const sizes = steps(T['font-size']).map((s) => ({ token: `font-size.${s.name}`, name: s.name, value: s.value, ...px(s.value), description: s.description }));
const lineHeights = steps(T['line-height']).map((s) => ({ token: `line-height.${s.name}`, name: s.name, value: s.value }));
const weights = steps(T['font-weight']).map((s) => ({ token: `font-weight.${s.name}`, name: s.name, value: String(s.value) }));

// ---- shape, space, motion -------------------------------------------------
const toPx = (v) => (/^[\d.]+rem$/.test(v) ? parseFloat(v) * 16 : /^[\d.]+px$/.test(v) ? parseFloat(v) : null);
const RADIUS = prim.radius ?? prim.border?.radius ?? {};
const radius = steps(RADIUS).map((s) => ({ token: `radius.${s.name}`, name: s.name, value: s.value, px: toPx(s.value) }));
const spacing = steps(prim.spacing).map((s) => ({ token: `spacing.${s.name}`, name: s.name, value: s.value, px: toPx(s.value) }));
const durations = steps(prim.motion.duration).map((s) => ({ token: `duration.${s.name}`, name: s.name, value: s.value, ms: parseFloat(s.value), description: s.description }));
const easings = steps(prim.motion.easing).map((s) => ({
  token: `easing.${s.name}`,
  name: s.name,
  value: s.value,
  points: s.value.match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number) ?? null,
  description: s.description,
}));

// ---- tokenized? -----------------------------------------------------------
// every declaration in each component's own CSS, by property. A value that
// carries a var() reads a token; a bare keyword (0, none, auto, inherit…) is
// not a value and isn't counted; anything else is hard-coded.
const PROPS = [
  ['Border', /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(width|style|color))?|outline(-(width|style|color))?)$/],
  ['Radius', /^border(-[a-z]+)*-radius$/],
  ['Padding', /^padding(-[a-z-]+)?$/],
  ['Gap', /^(gap|row-gap|column-gap)$/],
  ['Font size', /^font-size$/],
  ['Line height', /^line-height$/],
  ['Shadow', /^(box-shadow|text-shadow)$/],
  ['Motion', /^(transition|animation)(-[a-z-]+)?$/],
];
const KEYWORD = /^(0|none|auto|inherit|initial|unset|revert|revert-layer|normal|transparent|currentcolor|0 0|0 auto)$/i;
const count = (o) => Object.values(o ?? {}).reduce((n, v) => n + (v && typeof v === 'object' ? ('$value' in v ? 1 : count(v)) : 0), 0);
const TOKENS = {
  Border: `${count(prim.border)} widths + colour roles`,
  Radius: count(RADIUS),
  Padding: count(prim.spacing),
  Gap: count(prim.spacing),
  'Font size': count(T['font-size']),
  'Line height': count(T['line-height']),
  Shadow: count(prim.shadow),
  Motion: count(prim.motion),
};
const rows = PROPS.map(([p]) => ({ p, tokens: TOKENS[p], decl: 0, ok: 0, not: [] }));
let files = 0;
for (const dir of readdirSync(join(BELLA, 'src/components'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const f of readdirSync(join(BELLA, 'src/components', dir.name)).filter((n) => n.endsWith('.module.css'))) {
    files++;
    const path = `src/components/${dir.name}/${f}`;
    const src = read(path).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    // declarations: prop: value; inside a block, values may run over lines
    for (const m of src.matchAll(/(?<=[{;]\s*)([a-z-]+)\s*:\s*([^;{}]+?)\s*(?=;|})/g)) {
      const [, prop, raw] = m;
      const value = raw.replace(/\s+/g, ' ').trim();
      const i = PROPS.findIndex(([, re]) => re.test(prop));
      if (i < 0 || KEYWORD.test(value)) continue;
      const r = rows[i];
      r.decl++;
      if (/var\(--/.test(value)) r.ok++;
      else r.not.push({ component: dir.name, file: path, line: src.slice(0, m.index).split('\n').length, decl: `${prop}: ${value}` });
    }
  }
}

const out = {
  source: { repo: 'bella', commit: git('rev-parse', '--short', 'HEAD'), committedAt: git('log', '-1', '--format=%cI') },
  refs,
  type: { families, sizes, lineHeights, weights },
  radius,
  spacing,
  motion: { durations, easings },
  tokenized: { files, rows },
  // the three tiers (Subatomic): definitions, theme (Chip light), component; counted from the token files
  tiers: TOK === 'tokens' ? null : {
    definitions: count(prim),
    theme: count(readJson(`${TOK}/semantic/chip-light.json`)),
    component: count(readJson(`${TOK}/component/chip-light.json`)),
  },
};
writeFileSync(join(ROOT, 'data/foundations.json'), JSON.stringify(out, null, 2) + '\n');
const not = rows.reduce((n, r) => n + r.not.length, 0);
console.log(`sync-foundations: BELLA @ ${out.source.commit}: ${Object.keys(refs).length} colour refs, ${sizes.length} type sizes, ${radius.length} radii, ${spacing.length} spaces, ${durations.length + easings.length} motion, ${files} CSS files, ${not} declarations not a token`);
