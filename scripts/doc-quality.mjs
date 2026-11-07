#!/usr/bin/env node
// Doc quality check (concept, afternoon 7 Nov): the method of Elleta's earlier
// doc audit, run on CHIP's own data. No content from that audit comes over.
//   Coverage: which of the component page's sections each component fills.
//   Orphans: components with no docs page, and docs with no component.
//   Drift: what the page says against the contract and the render.
//   Consistency: across pages, then the top fixes, which Today shows as rows.
// Reads data/bella.json and CHIP's own page source; writes data/doc-quality.json.
// Where nothing measures a section, it says "Not measured", never a guess.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BELLA = process.env.BELLA_DIR || join(homedir(), 'DEV', 'bella-chip-theme');
const bella = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8'));
const atlas = readFileSync(join(ROOT, 'app/src/Atlas.jsx'), 'utf8');
const specimens = readFileSync(join(ROOT, 'app/src/specimens.jsx'), 'utf8');

// the page's live parts come from CHIP's own source: a composition in SCENES, a render in SPECIMENS
const block = (src, start) => {
  const i = src.indexOf(start);
  if (i < 0) return '';
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  return '';
};
const keysOf = (b) => new Set([...b.matchAll(/^ {2}([A-Z][A-Za-z]+):/gm)].map((m) => m[1]));
const scened = keysOf(block(atlas, 'const SCENES = {'));
const rendered = keysOf(block(specimens, 'export const SPECIMENS = {'));

const SECTIONS = [
  ['In use', (c) => scened.has(c.name), 'a composition in SCENES (app/src/Atlas.jsx)'],
  ['Specimens', (c) => rendered.has(c.name), 'a render in SPECIMENS (app/src/specimens.jsx)'],
  ['Copy me', (c) => rendered.has(c.name), 'the same render'],
  ['Usage', (c) => (c.usage ?? []).length > 0 && (c.dont ?? []).length > 0, 'usage and dont in the contract'],
  ['Anatomy', (c) => (c.parts ?? []).length > 0, 'parts in the contract'],
  ['Accessibility', (c) => !!c.hasA11yNotes, 'a11y notes in the contract'],
  ['Properties', (c) => (c.props ?? []).length > 0, 'props in the contract'],
  ['Source', (c) => !!c.storyUrl && !!c.hasContract, 'a story and a contract'],
];

const comps = bella.components ?? [];
const coverage = comps.map((c) => {
  const missing = SECTIONS.filter(([, has]) => !has(c)).map(([s]) => s);
  return { id: c.id, name: c.name, filled: SECTIONS.length - missing.length, of: SECTIONS.length, missing };
});

// orphans: a component with no docs page; a docs page that names no component
const docsDir = join(BELLA, 'docs');
const names = new Set(comps.map((c) => c.name.toLowerCase()));
const docFiles = existsSync(docsDir) ? readdirSync(docsDir).filter((f) => /\.mdx?$/.test(f)) : null;
const orphans = {
  componentsWithoutDocs: comps.filter((c) => !c.hasDocs).map((c) => c.name),
  docsWithoutComponent: docFiles ? docFiles.filter((f) => /^components?-|component/i.test(f) && !names.has(f.replace(/^components?-|\.mdx?$/gi, '').toLowerCase())) : 'Not measured',
};

// drift: the contract against the code, and the render's contrast
const drift = comps
  .map((c) => ({
    name: c.name,
    contract: c.health?.contract?.status ?? 'Not measured',
    contrast: c.health?.contrast?.status ?? 'Not measured',
    issues: [...(c.health?.contract?.issues ?? []), ...(c.health?.contrast?.failing ?? [])],
  }))
  .filter((d) => d.contract === 'fail' || d.contrast === 'fail');

// consistency: how many pages miss each section, biggest first; the top fixes are Today's rows
const bySection = SECTIONS.map(([s, , source]) => {
  const gaps = coverage.filter((x) => x.missing.includes(s));
  return { section: s, source, missing: gaps.map((x) => x.name), ids: gaps.map((x) => x.id) };
}).filter((x) => x.missing.length);
bySection.sort((a, b) => b.missing.length - a.missing.length);
const topFixes = bySection.slice(0, 3).map((x) => ({
  title: `${x.missing.length} component page${x.missing.length === 1 ? ' has' : 's have'} no ${x.section}`,
  why: `The page fills ${x.section} from ${x.source}.`,
  rule: 'docs/plans/chip-concept.md · component page template',
  components: x.missing,
  ids: x.ids,
}));

const out = {
  at: new Date().toISOString(),
  bellaVersion: bella.source?.version,
  components: comps.length,
  complete: coverage.filter((x) => !x.missing.length).length,
  coverage,
  orphans,
  drift,
  consistency: bySection.map(({ section, missing }) => ({ section, missing: missing.length })),
  topFixes,
};
writeFileSync(join(ROOT, 'data/doc-quality.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`doc quality: ${out.complete} of ${out.components} pages complete; top fixes: ${topFixes.map((f) => f.title).join('; ') || 'none'}`);
