// Do next, one component at a time (4 Nov): for each gap the Overview counts,
// what is missing, where it lives, what to add, why, what it changes and how
// to undo it. Every suggestion is read from BELLA's own files: the contract
// (tokens/contracts.json), the built tokens (tokens/bella.css), the gate
// scripts and the component sources. Where those can't suggest a fix, the
// item says so and names what is needed instead of guessing.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, ROOT } from './config.mjs';
import { BELLA, keepBellaFresh } from './bella-work.mjs';
import { BASE, readResult } from './checks.mjs';
import { lastLint } from './spec-lint.mjs';
import { bellaPairs, declaredLists } from '../../scripts/lib/bella-pairs.mjs';

const read = (rel) => readFileSync(join(BELLA, rel), 'utf8');
// A file another session is writing right now reads as half a JSON for a moment (23 Nov: Health said "CHIP's server isn't
// answering, /gaps 500" for under a minute): read it again a few times before giving up.
function readJson(file) {
  for (let i = 0; ; i += 1) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      if (i >= 4) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    }
  }
}
const lineOf = (text, re) => text.split('\n').findIndex((l) => re.test(l)) + 1;
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

// the rules each gap answers to, quoted from BELLA
const RULES = {
  story: { rule: 'Props, variants and examples live in each component’s .tsx types and Storybook stories. npm run gate renders every story (audit:visual).', source: 'AGENTS.md · package.json "gate"' },
  docs: { rule: 'Every component has a docs page people can read.', source: 'CHIP coverage rule' },
  contract: { rule: 'Agents build from the Tier 3 contract; contract-parity checks it against the exported Props.', source: 'scripts/contract-parity.mjs', sourceIds: ['curtis-components-as-data'] },
  dsds: { rule: 'Machine-readable contracts: bella.dsds.yaml. Only contracts listed in build-dsds.mjs’s IMPL map are extracted.', source: 'AGENTS.md · scripts/build-dsds.mjs', sourceIds: ['curtis-components-as-data'] },
  contrast: { rule: 'The pairs are checked, not just recorded: contrast-pairs.mjs computes every declared pair in every theme. Worst ground wins.', source: 'docs/agents/maintaining.md · scripts/contrast-pairs.mjs', sourceIds: ['wcag-1-4-6', 'bella-read-first'] },
  a11y: { rule: 'Verified ratios and behaviour are recorded per component in $extensions.bella.a11y, dated; contrast-pairs is the check that the record is still true.', source: 'docs/agents/maintaining.md · scripts/contrast-pairs.mjs', sourceIds: ['wcag-2-5-5', 'wcag-1-4-6', 'bella-floors'] },
};

/* ---------- colour: the same maths and theme blocks as contrast-pairs.mjs ---------- */
function themes() {
  const css = read('tokens/bella.css');
  const block = (re) => {
    const m = css.match(re);
    if (!m) return {};
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (depth && i < css.length) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const vars = {};
    for (const d of css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    return vars;
  };
  const light = block(/:root\s*\{/);
  const t = (name) => ({ ...light, ...block(new RegExp(`\\[data-theme=["']?${name}["']?\\]\\s*\\{`)) });
  return { light, dark: t('dark'), warm: t('warm'), 'wee-dote': t('wee-dote') };
}
function resolve(vars, name, seen = new Set()) {
  if (seen.has(name) || vars[name] === undefined) return null;
  seen.add(name);
  const ref = vars[name].match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], seen) : vars[name];
}
const isHex = (v) => /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v ?? '');
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
// an 8-digit foreground or background is composited over the page, as the eye sees it
function over(top, base) {
  if (top.length === 7) return top;
  const a = parseInt(top.slice(7, 9), 16) / 255;
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * a + parseInt(base.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
}
function measure(T, fg, bg) {
  const out = [];
  for (const [theme, vars] of Object.entries(T)) {
    const page = resolve(vars, '--color-semantic-background');
    const b = resolve(vars, bg);
    const f = resolve(vars, fg);
    if (!isHex(b) || !isHex(f) || !isHex(page)) return null;
    const B = over(b, page.slice(0, 7));
    const F = over(f, B);
    const [x, y] = [lum(F), lum(B)];
    out.push({ theme, ratio: Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 });
  }
  return out;
}

/* ---------- shared reads ---------- */
function load() {
  // a moved BELLA HEAD re-syncs the snapshot in the background (data check, 22 Nov)
  keepBellaFresh();
  const bella = readJson(join(ROOT, 'data/bella.json'));
  const contracts = readJson(join(BELLA, 'tokens/contracts.json')).component;
  const pairSrc = read('scripts/contrast-pairs.mjs');
  // BELLA builds its pairs in code: evaluated, never scraped (scripts/lib/bella-pairs.mjs)
  const { pairs } = declaredLists(BELLA);
  const dsdsSrc = read('scripts/build-dsds.mjs');
  const implStart = lineOf(dsdsSrc, /^const IMPL = \{/);
  const implBody = dsdsSrc.slice(dsdsSrc.indexOf('const IMPL = {'), dsdsSrc.indexOf('};', dsdsSrc.indexOf('const IMPL = {')));
  const impl = Object.fromEntries([...implBody.matchAll(/'?([\w-]+)'?:\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
  const implEnd = implStart + implBody.split('\n').length - 1;
  return { bella, contracts, pairs, pairSrc, dsdsSrc, impl, implEnd, T: themes() };
}
const srcOf = (name) => {
  const dir = join(BELLA, 'src/components', name);
  if (!existsSync(dir)) return '';
  return readdirSync(dir).filter((f) => /\.(tsx|css)$/.test(f) && !f.includes('.stories.')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
};
// the most similar components: shared props weigh most, then category and composition
function similar(c, comps, keep) {
  const P = new Set(c.props);
  return comps
    .filter((o) => o.name !== c.name && keep(o))
    .map((o) => {
      const shared = o.props.filter((p) => P.has(p) && p !== 'className' && p !== 'children');
      const score = shared.length * 2 + (o.category && o.category === c.category ? 3 : 0) + (c.composedFrom.includes(o.name) || o.composedFrom.includes(c.name) ? 2 : 0);
      return { o, shared, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.o.name.localeCompare(b.o.name));
}

/* ---------- one suggester per gap ---------- */
function contrastGap(c, ctx) {
  const where = [{ file: 'scripts/contrast-pairs.mjs', field: 'PAIRS' }];
  const base = { why: RULES.contrast, where };
  const failingNow = c.health.contrast.status === 'fail';
  if (failingNow) {
    // the live check's failure line naming a token this component reads, as the Overview counts it
    const live = (readResult('contrast')?.failures ?? []).find((f) => c.tokens.list.includes(f.match(/--[\w-]+/)?.[0]));
    const what = c.health.contrast.failing.length ? c.health.contrast.failing.join('; ') : live ?? 'a token it reads fails the live Colour contrast check';
    return {
      ...base,
      missing: `A declared pair on its tokens fails: ${what}.`,
      suggest: { text: 'The Colour contrast check already has a review card with a measured fix. Open it from the check.' },
      change: 'Accepting the card changes one token and re-runs the gate.',
      undo: 'The review card’s Undo reverts the commit.',
      brief: `${c.name}: fix the failing contrast pair (${what}) with the Colour contrast review card's fix.`,
    };
  }
  const key = kebab(c.name);
  const colourTokens = c.tokens.list.filter((t) => ['light', 'dark'].some((th) => isHex(resolve(ctx.T[th], t))));
  if (!colourTokens.length) {
    const own = c.tokens.list.filter((t) => t !== '--icon-');
    const current = /currentColor/.test(srcOf(c.name));
    return {
      ...base,
      missing: `No pair in scripts/contrast-pairs.mjs reads ${c.name}’s tokens, so its contrast is unchecked.`,
      suggest: null,
      noSuggest: {
        why: `${c.name} has no colour tokens of its own${own.length ? ` (it reads ${own.join(', ')})` : ''}${current ? ' and draws in currentColor, so it takes the colour of the text around it' : ''}. There is nothing to pair.`,
        needed: 'BELLA has no way to record “no colours of its own”, so this gap stays open. Needed: a contract field saying so, which CHIP’s Contrast column would read. That is a contract change, so it is yours to decide.',
      },
      change: 'Nothing until that field exists.',
      undo: '—',
      brief: `${c.name}: has no colour tokens (${own.join(', ') || 'none'}), so no contrast pair applies. Propose a way to record that in its contract; don't add a pair.`,
    };
  }
  // roles by the token's last word, as BELLA names them
  const role = (t) => (/-(foreground|text)$/.test(t) ? 'text' : /-(background|fill|surface)$/.test(t) ? 'bg' : /-(border|stroke|divider-color|dot-color|indicator|edge|ring)$/.test(t) ? 'mark' : null);
  const group = (t) => t.replace(/-(foreground|text|background|fill|surface|border|stroke|divider-color|dot-color|indicator|edge|ring)$/, '');
  const own = colourTokens.filter((t) => t.startsWith('--component-'));
  const bgs = own.filter((t) => role(t) === 'bg');
  const semanticFill = colourTokens.find((t) => /^--color-semantic-(surface|background|raised|ground)/.test(t));
  const rootBg = semanticFill ?? bgs.find((t) => group(t) === `--component-${key}`) ?? (bgs.length === 1 ? bgs[0] : null);
  const words = (t) => t.replace(`--component-${key}-`, '').replace(/(^|-)(foreground|text)$/, ' label').replace(/-color$/, '').replace(/-/g, ' ').replace(/^default /, '').trim();
  const sugg = [];
  for (const t of own) {
    const r = role(t);
    if (r !== 'text' && r !== 'mark') continue;
    const sameBg = bgs.find((b) => group(b) === group(t));
    const isBorder = /-border$/.test(t);
    // a border marks the edge against what is around it, as BELLA's control and chip borders do
    const grounds = isBorder ? [['--color-semantic-surface-card', 'panel']] : sameBg ? [[sameBg, 'its fill']] : rootBg ? [[rootBg, semanticFill ? 'the surface' : 'its fill']] : [['--color-semantic-background', 'the page'], ['--color-semantic-surface-card', 'panel']];
    for (const [bg, on] of grounds) {
      const min = r === 'text' ? 'AAA' : 'NON_TEXT';
      const bar = r === 'text' ? 7 : 3;
      const m = measure(ctx.T, t, bg);
      if (!m) continue;
      const label = `${c.name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${words(t).replace(c.name.toLowerCase(), '').trim()} on ${on}`.replace(/\s+/g, ' ');
      const dup = ctx.pairs.find((p) => p.fg === t && p.bg === bg);
      if (dup) continue;
      // same colours as a pair BELLA already checks, through the semantic token the contract points at
      const sem = (tok) => {
        const pre = `--component-${key}-`;
        if (!tok.startsWith(pre)) return tok;
        const segs = tok.slice(pre.length).split('-');
        let o = ctx.contracts[key];
        let i = 0;
        while (o && i < segs.length) {
          let j = segs.length;
          while (j > i && o[segs.slice(i, j).join('-')] === undefined) j--;
          if (j === i) return tok;
          o = o[segs.slice(i, j).join('-')];
          i = j;
        }
        const v = o?.$value?.match(/^\{color\.semantic\.([\w-]+)\}$/);
        return v ? `--color-semantic-${v[1]}` : tok;
      };
      const twin = ctx.pairs.find((p) => p.fg === sem(t) && p.bg === sem(bg));
      sugg.push({ label, fg: t, bg, min, bar, measured: m, worst: Math.min(...m.map((x) => x.ratio)), fails: m.filter((x) => x.ratio < bar).map((x) => x.theme), twin: twin?.label ?? null, surfaceGuess: !sameBg && !rootBg });
    }
  }
  if (!sugg.length) {
    return {
      ...base,
      missing: `No pair in scripts/contrast-pairs.mjs reads ${c.name}’s tokens.`,
      suggest: null,
      noSuggest: { why: `${c.name}’s colour tokens (${colourTokens.join(', ')}) carry no foreground, border or fill role CHIP can pair by name.`, needed: 'Name the foreground and the surface it sits on in the contract, then a pair can be measured.' },
      change: '—',
      undo: '—',
      brief: `${c.name}: decide which of ${colourTokens.join(', ')} is text on which surface, then add those pairs to scripts/contrast-pairs.mjs.`,
    };
  }
  const endLine = lineOf(ctx.pairSrc, /^\s*\['body text on chat received surface'/) || lineOf(ctx.pairSrc, /^const PAIRS = \[/);
  const fails = sugg.filter((s) => s.fails.length);
  // BELLA's inset rule may already say the component is identified by its text, not its edge
  const exempt = [...ctx.pairSrc.matchAll(new RegExp(`'src/components/${c.name}/[^']+':\\s*'([^']+)'`, 'g'))].map((m) => m[1]);
  const model = ctx.pairs.find((p) => p.fg.startsWith('--component-') && p.bg.startsWith('--component-') && p.fg.split('-')[3] === p.bg.split('-')[3]);
  return {
    ...base,
    where: [{ file: 'scripts/contrast-pairs.mjs', field: `PAIRS (add after line ${endLine})` }],
    missing: `${c.name} reads ${colourTokens.length} colour token${colourTokens.length === 1 ? '' : 's'}, and no declared pair checks any of them.`,
    suggest: {
      text: `${sugg.length} pair${sugg.length === 1 ? '' : 's'} from its own tokens, measured in all four themes with contrast-pairs’ maths.${model ? ` Same shape as BELLA’s “${model.label}”.` : ''}`,
      pairs: sugg,
      code: sugg.map((s) => `  ['${s.label}', '${s.fg}', '${s.bg}', ${s.min}],`).join('\n'),
      caveat: fails.length ? `${fails.length} of these would fail the gate as written (${fails.map((s) => `${s.label}: ${s.worst}:1 in ${s.fails.join(', ')}`).join('; ')}). Fix the token first, or leave that pair out.${exempt.length && fails.some((s) => /-border$/.test(s.fg)) ? ` BELLA’s inset rule already says ${c.name} is “${exempt[0]}”, which argues for leaving the border pair out.` : ''}` : sugg.some((s) => s.surfaceGuess) ? `${c.name} has no fill of its own, so its text is paired with the page and panel, as BELLA does for Eyebrow-like labels. Check it never sits on a darker surface.` : null,
    },
    change: `contrast-pairs.mjs checks ${sugg.length} more pair${sugg.length === 1 ? '' : 's'} in every theme on each gate; the Contrast column counts ${c.name} once the sync re-reads BELLA.${fails.length ? ' A failing pair blocks the gate.' : ''}`,
    undo: `Delete the added line${sugg.length === 1 ? '' : 's'} from PAIRS.`,
    brief: `${c.name}: add to PAIRS in scripts/contrast-pairs.mjs:\n${sugg.map((s) => `  ['${s.label}', '${s.fg}', '${s.bg}', ${s.min}], // worst ${s.worst}:1${s.fails.length ? ` FAILS in ${s.fails.join(', ')}` : ''}`).join('\n')}${fails.length ? '\nLeave out a pair marked FAILS unless you fix its token first; ask before changing a token.' : ''}`,
  };
}

function dsdsGap(c, ctx) {
  const key = kebab(c.name);
  const k = ctx.contracts[key]?.$extensions?.bella;
  const base = { why: RULES.dsds, where: [{ file: 'scripts/build-dsds.mjs', field: `IMPL (line ${ctx.implEnd})` }, { file: 'bella.dsds.yaml', field: 'entries (generated)' }] };
  if (!k) {
    return { ...base, missing: `${c.name} has no contract, so build-dsds.mjs has nothing to extract.`, suggest: null, noSuggest: { why: 'DSDS entries are extracted from the contract.', needed: `A contract for ${c.name} in tokens/contracts.json first.` }, change: '—', undo: '—', brief: `${c.name}: write its contract in tokens/contracts.json first; then add it to IMPL in scripts/build-dsds.mjs.` };
  }
  const fields = ['description', 'variants', 'states', 'props', 'usage', 'dont', 'a11y'].filter((f) => (Array.isArray(k[f]) ? k[f].length : k[f]));
  const sib = similar(c, ctx.bella.components, (o) => ctx.impl[kebab(o.name)])[0]?.o;
  return {
    ...base,
    missing: `${c.name} has a contract, but '${key}' is not in the IMPL map, so bella.dsds.yaml has no entry for it.`,
    suggest: {
      text: `Add one line to IMPL, then run npm run build:dsds. The entry is extracted from the contract fields it already has: ${fields.join(', ')}.${sib ? ` ${sib.name} is extracted the same way.` : ''}`,
      code: `  '${key}': '${c.name}',`,
    },
    change: `bella.dsds.yaml gains a component entry for ${c.name}. The gate diffs bella.dsds.yaml, so commit the regenerated file with the line.`,
    undo: 'Remove the line from IMPL and run npm run build:dsds again.',
    brief: `${c.name}: add '${key}': '${c.name}', to IMPL in scripts/build-dsds.mjs, run npm run build:dsds, commit both.`,
  };
}

function storyGap(c, ctx) {
  const key = kebab(c.name);
  const k = ctx.contracts[key]?.$extensions?.bella ?? {};
  const file = `src/components/${c.name}/${c.name}.stories.tsx`;
  // of the three closest with a story, the shortest file is the easiest to copy
  const storyLen = (o) => read(`src/components/${o.name}/${o.name}.stories.tsx`).length;
  const sib = similar(c, ctx.bella.components, (o) => o.hasStory).slice(0, 3).sort((a, b) => storyLen(a.o) - storyLen(b.o))[0];
  const base = { why: RULES.story, where: [{ file, field: 'new file' }] };
  const variants = (k.variants ?? []).map((v) => (typeof v === 'string' ? v : v.name)).filter(Boolean);
  const states = (k.states ?? []).filter((s) => s !== 'default');
  if (!sib && !variants.length) {
    return { ...base, missing: `${c.name} has no story.`, suggest: null, noSuggest: { why: 'Its contract lists no variants and no component with a story shares its props.', needed: 'Variants in the contract, or a story to copy.' }, change: '—', undo: '—', brief: `${c.name}: write ${file}.` };
  }
  let model = null;
  if (sib) {
    const s = read(`src/components/${sib.o.name}/${sib.o.name}.stories.tsx`);
    model = { name: sib.o.name, file: `src/components/${sib.o.name}/${sib.o.name}.stories.tsx`, title: s.match(/title:\s*'([^']+)'/)?.[1], stories: [...s.matchAll(/^export const (\w+)/gm)].map((m) => m[1]) };
  }
  const brand = /data-bella-brand/.test(srcOf(c.name));
  return {
    ...base,
    missing: `${c.name} has no story, so Storybook can’t show it and the gate’s visual audit never renders it.`,
    suggest: {
      text: `${variants.length ? `One story per contract variant: ${variants.join(', ')}.` : 'One story for its default.'}${states.length ? ` States to show: ${states.join(', ')}.` : ''}${model ? ` Copy the shape of ${model.file} (title '${model.title?.replace(sib.o.name, c.name)}'; it has ${model.stories.join(', ')}).` : ''}${brand ? ' It is brand art (data-bella-brand): show it both as a labelled image and as aria-hidden decoration, per AGENTS.md.' : ''}`,
      code: `title: 'Components/${c.name}'\n${(variants.length ? variants : ['Default']).map((v) => `export const ${v[0].toUpperCase()}${v.slice(1).replace(/-(\w)/g, (_, x) => x.toUpperCase())}: Story = ${variants.length ? `{ args: { variant: '${v}' } }` : '{}'};`).join('\n')}`,
    },
    change: `A new file. Storybook lists ${c.name}; npm run gate renders it in audit:visual (test-storybook and audit-quality-docs).`,
    undo: `Delete ${file}.`,
    brief: `${c.name}: write ${file}${variants.length ? ` with one story per variant (${variants.join(', ')})` : ''}${model ? `, modelled on ${model.file}` : ''}.${brand ? ' Brand art: one labelled (role="img") and one decorative (aria-hidden) story.' : ''}`,
  };
}

function a11yGap(c, ctx) {
  const key = kebab(c.name);
  const where = [{ file: 'tokens/contracts.json', field: `component.${key}.$extensions.bella.a11y` }];
  const base = { why: RULES.a11y, where };
  if (!ctx.contracts[key]) {
    return { ...base, missing: `${c.name} has no contract to hold a11y notes.`, suggest: null, noSuggest: { why: 'The notes live in the contract.', needed: `A contract for ${c.name} first.` }, change: '—', undo: '—', brief: `${c.name}: write its contract first.` };
  }
  // what the source does for assistive tech, read from the component itself
  const src = srcOf(c.name);
  const facts = [
    ...new Set([
      ...[...src.matchAll(/\b(aria-[\w-]+|role)=/g)].map((m) => m[1]),
      ...[...src.matchAll(/<(h[1-6]|iframe|button|a|nav|section|header|figure|img)\b/g)].map((m) => `<${m[1]}>`),
      ...(/\binert\b/.test(src) ? ['inert'] : []),
      ...(/tabIndex/.test(src) ? ['tabIndex'] : []),
    ]),
  ];
  const props = c.props.filter((p) => /^(as|title|aria\w*|label|interactive|id|role)$/i.test(p));
  const sib = similar(c, ctx.bella.components, (o) => o.a11y).find((x) => x.shared.length >= 2 || (c.category && x.o.category === c.category));
  if (!sib && !facts.length) {
    return { ...base, missing: `${c.name}’s contract has no a11y field.`, suggest: null, noSuggest: { why: 'No similar component has a note to follow and its source sets no roles, ARIA or semantic elements CHIP can read.', needed: 'A screen reader and keyboard pass on the component, written down by you.' }, change: '—', undo: '—', brief: `${c.name}: run a screen reader and keyboard pass, then write $extensions.bella.a11y.` };
  }
  const note = sib ? (Array.isArray(sib.o.a11y) ? sib.o.a11y.join(' ') : String(sib.o.a11y)) : null;
  return {
    ...base,
    missing: `${c.name}’s contract has no a11y field, so nothing records how it behaves for a screen reader or keyboard.`,
    suggest: {
      text: `Record what its source already does${facts.length ? `: ${facts.join(', ')}` : ''}${props.length ? `, and what the ${props.join(', ')} prop${props.length === 1 ? '' : 's'} change${props.length === 1 ? 's' : ''}` : ''}. Date it, as BELLA’s notes are dated.${sib ? ` Follow ${sib.o.name}’s note${sib.shared.length ? ` (shares ${sib.shared.join(', ')})` : ''}.` : ''}`,
      model: note ? { name: sib.o.name, text: note.length > 260 ? `${note.slice(0, 257).replace(/\s+\S*$/, '')}…` : note } : null,
      caveat: 'The facts come from the source; the note itself needs a real screen-reader check before it says “Verified”.',
    },
    change: `${c.name}’s contract gains an a11y note; on npm run build, bella.dsds.yaml records it as reviewed, so commit the regenerated file.`,
    undo: 'Remove the a11y field and run npm run build again.',
    brief: `${c.name}: add $extensions.bella.a11y to component.${key} in tokens/contracts.json. Source facts: ${facts.join(', ') || 'none found'}${props.length ? `; props ${props.join(', ')}` : ''}.${sib ? ` Follow ${sib.o.name}'s note.` : ''} Check with a screen reader before writing "Verified".`,
  };
}

function noSuggester(gap, c) {
  return {
    why: RULES[gap],
    where: gap === 'contract' ? [{ file: 'tokens/contracts.json', field: `component.${kebab(c.name)}` }] : [{ file: `src/components/${c.name}/`, field: 'docs' }],
    missing: gap === 'contract' ? `${c.name} has no Tier 3 contract.` : `${c.name} has no docs page.`,
    suggest: null,
    noSuggest: { why: 'CHIP has no suggester for this gap yet.', needed: gap === 'contract' ? 'Its props from the .tsx and a description from you.' : 'A docs page written from its contract.' },
    change: '—',
    undo: '—',
    brief: gap === 'contract' ? `${c.name}: write its Tier 3 contract in tokens/contracts.json from the exported Props.` : `${c.name}: write its docs page from the contract.`,
  };
}

/* ---------- who can fix it: CHIP on its own, Claude, or you ---------- */
// Said on every item, so nothing is handed to a terminal without saying so.
const CAN = {
  chip: { who: 'chip', label: 'CHIP can fix this', how: 'CHIP makes the change on a local BELLA branch and commits it through BELLA’s gate. You keep it or undo it.' },
  claude: { who: 'claude', label: 'Needs Claude', how: 'It needs new code or prose written. CHIP writes the brief; a Claude session writes the change.' },
  you: { who: 'you', label: 'Needs you', how: 'It needs a decision or a check only you can make.' },
};
function canFor(gap, item) {
  if (gap === 'dsds') return item.suggest ? CAN.chip : CAN.you;
  if (gap === 'contrast') return item.suggest?.pairs?.some((p) => !p.fails.length) ? CAN.chip : CAN.you;
  if (gap === 'a11y') return item.suggest ? { ...CAN.you, how: 'The facts come from the source, but the note says how it behaves for a screen reader: that needs a real check by you before it is written.' } : CAN.you;
  return CAN.claude; // story, docs, contract: new code or prose
}

// the other ways to close it, each with who does it
function alternativesFor(gap, c, item) {
  const s = item.suggest;
  if (gap === 'contrast' && s?.pairs) {
    const fails = s.pairs.filter((p) => p.fails.length);
    return [
      ...(fails.length ? [{ text: `Add all ${s.pairs.length} pairs, the failing ${fails.length === 1 ? 'one' : fails.length} too. The gate then blocks every commit until the token is fixed.`, can: CAN.you }] : []),
      ...(fails.length ? [{ text: `Fix the failing token${fails.length === 1 ? '' : 's'} first (${fails.map((p) => p.fg).join(', ')}), then add every pair. A token change moves every component that reads it.`, can: CAN.you }] : []),
      { text: `Mark ${c.name} as checked another way and leave PAIRS alone. BELLA has no field for that yet, so it is a contract change.`, can: CAN.you },
    ];
  }
  if (gap === 'contrast') return [{ text: 'Add a contract field saying it has no colours of its own, which the Contrast column would read.', can: CAN.you }, { text: 'Leave it unchecked and Skip it here.', can: CAN.you }];
  if (gap === 'dsds') return [{ text: 'Leave it out of the spec on purpose (an internal or experimental component) and Skip it here.', can: CAN.you }];
  if (gap === 'story') return [{ text: 'Copy the model story by hand in Storybook.', can: CAN.you }, { text: 'Skip it: a component without a story is never rendered by the gate’s visual audit.', can: CAN.you }];
  if (gap === 'a11y') return [{ text: 'Let a Claude session draft the note from the source facts; you check it with a screen reader before it says “Verified”.', can: CAN.claude }];
  return [{ text: 'Skip it for now.', can: CAN.you }];
}

/* ---------- Skip: kept across restarts; Not now is only the page's ---------- */
const DECISIONS = join(DATA_DIR, 'gap-decisions.json');
const readDecisions = () => {
  try {
    return JSON.parse(readFileSync(DECISIONS, 'utf8'));
  } catch {
    return {};
  }
};
export function decideGap({ gap, name, decision }) {
  if (!/^[a-z0-9]+$/.test(gap ?? '') || !/^[A-Za-z0-9]+$/.test(name ?? '')) throw new Error('gap and name are required');
  const d = readDecisions();
  if (decision === 'skip') d[`${gap}:${name}`] = { decision: 'skip', at: new Date().toISOString() };
  else delete d[`${gap}:${name}`];
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DECISIONS, JSON.stringify(d, null, 2));
  return { decisions: d };
}

/* ---------- the changes CHIP makes itself, for the review card path ---------- */
// insert lines just before the close of the block that opens at `opener`
function insertBefore(text, opener, close, lines) {
  const at = text.indexOf(opener);
  if (at < 0) throw new Error(`No "${opener}" in the file`);
  const end = text.indexOf(close, at);
  return `${text.slice(0, end)}${lines}\n${text.slice(end)}`;
}
const reviewId = (gap, name) => `gap-${gap}-${kebab(name)}`;

/** The change for one gap, in review.mjs's fix shape; null when CHIP can't make it. */
export function gapFix(gap, key) {
  const ctx = load();
  const c = ctx.bella.components.find((x) => kebab(x.name) === key);
  if (!c) return null;
  const item = gap === 'dsds' ? (!c.inDsds ? dsdsGap(c, ctx) : null) : gap === 'contrast' ? contrastGap(c, ctx) : null;
  if (!item || canFor(gap, item).who !== 'chip') return null;
  const base = { kind: `gap-${gap}`, withStaged: false, at: new Date().toISOString(), missing: item.missing, slug: reviewId(gap, c.name), token: null };
  const blast = (sentence) => ({ sentence, components: [c.name], composedInto: [], sourceFiles: [], apps: [] });
  if (gap === 'dsds') {
    const line = item.suggest.code;
    return {
      ...base,
      title: `Add ${c.name} to the DSDS spec`,
      why: `${item.missing} ${RULES.dsds.rule} (${RULES.dsds.source})`,
      change: { sentence: `Add ${line.trim()} to IMPL in scripts/build-dsds.mjs and rebuild, so bella.dsds.yaml gains ${c.name}’s entry from its contract.`, files: ['scripts/build-dsds.mjs', 'bella.dsds.yaml (generated)'], preview: line },
      wontTouch: [`${c.name}’s code, story and contract stay as they are.`, 'No token, no other component’s entry.', `${BASE} and your checkout in ~/DEV/bella, including the uncommitted files there: the change sits on its own branch from ${BASE}’s last commit.`],
      blast: blast(`Nothing renders differently. Agents reading bella.dsds.yaml find ${c.name}.`),
      thisWillDo: 'add one line to IMPL, run npm run build',
      after: [['Rebuilding the generated files (npm run build)', 'npm', ['run', 'build']]],
      apply(dir) {
        const f = join(dir, 'scripts/build-dsds.mjs');
        const text = readFileSync(f, 'utf8');
        if (new RegExp(`'?${kebab(c.name)}'?:\\s*'${c.name}'`).test(text)) throw new Error(`${c.name} is already in IMPL on ${BASE}`);
        writeFileSync(f, insertBefore(text, 'const IMPL = {', '\n};', line.replace(/\n$/, '')));
        return ['scripts/build-dsds.mjs', 'bella.dsds.yaml'];
      },
      commitMessage: `feat(dsds): extract ${c.name} into bella.dsds.yaml\n\n${item.missing}\nAdds ${line.trim()} to IMPL. Accepted from a CHIP gap report.`,
    };
  }
  const keep = item.suggest.pairs.filter((p) => !p.fails.length);
  const left = item.suggest.pairs.filter((p) => p.fails.length);
  const code = keep.map((p) => `  ['${p.label}', '${p.fg}', '${p.bg}', ${p.min}],`).join('\n');
  return {
    ...base,
    title: `Check ${c.name}’s contrast`,
    why: `${item.missing} ${RULES.contrast.rule} (${RULES.contrast.source})`,
    change: {
      sentence: `Add ${keep.length} pair${keep.length === 1 ? '' : 's'} to PAIRS in scripts/contrast-pairs.mjs, each measured in all four themes and passing.${left.length ? ` ${left.length} failing pair${left.length === 1 ? ' stays' : 's stay'} out: ${left.map((p) => `${p.label} (${p.worst}:1 in ${p.fails.join(', ')})`).join('; ')}.` : ''}`,
      files: ['scripts/contrast-pairs.mjs'],
      preview: code,
    },
    wontTouch: ['No token changes colour.', `${c.name}’s code, story and contract stay as they are.`, `${BASE} and your checkout in ~/DEV/bella, including the uncommitted files there: the change sits on its own branch from ${BASE}’s last commit.`],
    blast: blast(`Nothing renders differently. The gate checks ${keep.length} more pair${keep.length === 1 ? '' : 's'} on every commit; a token change that breaks one is refused.`),
    thisWillDo: `add ${keep.length} line${keep.length === 1 ? '' : 's'} to PAIRS, run contrast-pairs.mjs`,
    after: [['Checking the pairs (contrast-pairs.mjs)', 'node', ['scripts/contrast-pairs.mjs']]],
    apply(dir) {
      const f = join(dir, 'scripts/contrast-pairs.mjs');
      writeFileSync(f, insertBefore(readFileSync(f, 'utf8'), 'const PAIRS = [', '\n];', code));
      return ['scripts/contrast-pairs.mjs'];
    },
    commitMessage: `feat(contrast): check ${c.name}’s pairs\n\n${item.missing}\n${keep.map((p) => `${p.label}: worst ${p.worst}:1`).join('\n')}\nAccepted from a CHIP gap report.`,
  };
}

/* ---------- the report behind "Review the fix" ---------- */
const GAP_TITLE = { story: 'Story', docs: 'Docs page', contract: 'Token contract', dsds: 'DSDS entry', contrast: 'Contrast pairs', a11y: 'A11y note' };
/** pairs: [[gap, Name], …] -> one item per pair, with evidence, the fix and who can make it. */
export function gapReport(pairs) {
  const all = gapFixes();
  const ctx = { bella: readJson(join(ROOT, 'data/bella.json')) };
  const decisions = readDecisions();
  const items = pairs.slice(0, 60).map(([gap, name]) => {
    const item = all.gaps[gap]?.[name];
    const c = ctx.bella.components.find((x) => x.name === name);
    if (!item || !c) return { gap, name, gone: true };
    const lint = lastLint(c);
    const can = canFor(gap, item);
    return {
      gap,
      gapTitle: GAP_TITLE[gap] ?? gap,
      name,
      id: can.who === 'chip' ? reviewId(gap, name) : null,
      missing: item.missing,
      evidence: {
        where: item.where,
        pairs: item.suggest?.pairs ?? null,
        model: item.suggest?.model ?? null,
        figma: lint
          ? lint.found
            ? { via: lint.via, at: lint.at, where: lint.where, score: lint.score, variants: lint.variants, failing: (lint.findings ?? []).filter((f) => f.ok === false).map((f) => `${f.check}: ${f.what}`) }
            : { via: lint.via ?? null, at: lint.at, missing: lint.reason ?? 'Not found in Figma.' }
          : null,
      },
      recommend: item.suggest
        ? { text: item.suggest.text, code: item.suggest.code ?? null, caveat: item.suggest.caveat ?? null }
        : { text: item.noSuggest.why, needed: item.noSuggest.needed },
      why: item.why,
      alternatives: alternativesFor(gap, c, item),
      change: item.change,
      undo: item.undo,
      can,
      brief: item.brief,
      decision: decisions[`${gap}:${name}`] ?? null,
    };
  });
  return { at: all.at, bellaVersion: all.bellaVersion, base: BASE, items };
}

// { story: { Name: item }, dsds: {…}, contrast: {…}, a11y: {…}, docs, contract }
/** Every pair contrast-pairs.mjs declares, measured as the gate measures it:
 * PAIRS (with its highlight-wash pairs, '<wash> over <surface>') at their bar,
 * and DISTINCT (fills kept apart) at APART, in all four themes, worst shown. */
/* BELLA's pairs cost about 2 s to measure; they only change when BELLA does, so they are measured once per BELLA
   commit (and once at server start), not on every Health load. */
let pairsCache = { head: null, value: null };
const bellaHead = () => {
  try {
    return execFileSync('git', ['-C', BELLA, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
export function declaredPairs() {
  const head = bellaHead();
  if (head && pairsCache.head === head) return pairsCache.value;
  const value = measurePairs();
  pairsCache = { head, value };
  return value;
}
function measurePairs() {
  // BELLA's own list and its own ratios in its four themes (contrast-pairs.mjs --verbose)
  const r = bellaPairs(BELLA);
  const pairs = [...r.pairs, ...r.distinct].filter((p) => p.measured.length).map((p) => ({ ...p, bg: p.bg.split(' over ')[0] }));
  // declared: how many pairs BELLA lists; checked: how many measurements its script made (pairs × themes)
  return { pairs, declared: r.pairs.length, checked: r.checked, ok: r.ok, summary: r.summary };
}

export function gapFixes() {
  const ctx = load();
  const out = { story: {}, docs: {}, contract: {}, dsds: {}, contrast: {}, a11y: {} };
  for (const c of ctx.bella.components) {
    if (!c.hasStory) out.story[c.name] = storyGap(c, ctx);
    if (!c.hasDocs) out.docs[c.name] = noSuggester('docs', c);
    if (!c.hasContract) out.contract[c.name] = noSuggester('contract', c);
    if (!c.inDsds) out.dsds[c.name] = dsdsGap(c, ctx);
    // a part is a contrast gap when no declared pair reads its tokens, or one of them fails
    if (c.health.contrast.status !== 'pass') out.contrast[c.name] = contrastGap(c, ctx);
    if (!c.hasA11yNotes) out.a11y[c.name] = a11yGap(c, ctx);
  }
  // who can fix each one, said on the card before anything opens; and a
  // brief that carries everything CHIP knows, so Claude needs no questions
  for (const [gap, byName] of Object.entries(out))
    for (const [name, it] of Object.entries(byName)) {
      it.can = canFor(gap, it);
      it.brief = [
        `${name} in BELLA: ${GAP_TITLE[gap] ?? gap}.`,
        `Missing: ${it.missing}`,
        `Where: ${it.where.map((w) => `${w.file} (${w.field})`).join('; ')}`,
        `Do: ${it.brief}`,
        it.suggest ? `CHIP's suggestion: ${it.suggest.text}` : `CHIP has no suggestion: ${it.noSuggest.why} Needed: ${it.noSuggest.needed}`,
        it.suggest?.code ? `Start from:\n${it.suggest.code}` : null,
        it.suggest?.caveat ? `Careful: ${it.suggest.caveat}` : null,
        `Rule: ${it.why.rule} (${it.why.source})`,
        'Leave every other component alone.',
      ].filter(Boolean).join('\n');
    }
  return { at: new Date().toISOString(), bellaVersion: ctx.bella.source?.version, gaps: out, decisions: readDecisions() };
}
