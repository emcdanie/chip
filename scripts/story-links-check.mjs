// Story link check (Elleta, 22 Nov 2026: "when i click it opens storybook and it doesnt work"). For every BELLA part in
// data/bella.json it resolves the part's first story from BELLA's own Storybook index (storybook-static/index.json in the
// BELLA checkout), then proves the id CHIP would open exists there and that CHIP's server serves it at /storybook/ and
// lists the same id at /stories. A part with no story is reported as "No story yet" (the page says so and offers Add a
// story); that is a result, not a failure. FAILS when an id CHIP would open is not in the index, when the server lists a
// different id, or when the index itself cannot be read. It also proves every part has a live sample on the Components stage
// (23 Nov): a hand specimen (SPECIMENS or PLAY in app/src/specimens.jsx), else its first story drawn in the stage
// (StorySample), else the "No story yet" state with Add a story; it FAILS when a part has none of the three, or when the
// stage code has lost the story fallback or the "No story yet" state. Usage: node scripts/story-links-check.mjs [--app http://localhost:3160]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bellaDir } from './lib/bella-dir.mjs';

const i = process.argv.indexOf('--app');
const APP = i > 0 ? process.argv[i + 1] : 'http://localhost:3160';
const names = JSON.parse(readFileSync(new URL('../data/bella.json', import.meta.url), 'utf8')).components.map((c) => c.name);
let entries;
try {
  entries = JSON.parse(readFileSync(join(bellaDir(), 'storybook-static/index.json'), 'utf8')).entries;
} catch (e) {
  console.log(`story-links-check: cannot read BELLA's Storybook index (${e.message}). Build it in BELLA first.`);
  process.exit(1);
}
const byPart = {};
for (const e of Object.values(entries)) {
  const n = String(e.title ?? '').split('/').pop();
  const p = (byPart[n] ??= { docs: null, first: null });
  if (e.type === 'docs' && !p.docs) p.docs = e.id;
  if (e.type === 'story' && !p.first) p.first = e.id;
}
const bad = [];
const none = [];
// hand specimens: the keys of SPECIMENS and PLAY in specimens.jsx
const spec = readFileSync(new URL('../app/src/specimens.jsx', import.meta.url), 'utf8');
const block = (start) => {
  const from = spec.indexOf(start);
  const to = spec.indexOf('\n};', from);
  return [...spec.slice(from, to).matchAll(/^ {2}([A-Za-z]+):/gm)].map((m) => m[1]);
};
const hand = new Set([...block('export const SPECIMENS = {'), ...block('export const PLAY = {')]);
const stage = readFileSync(new URL('../app/src/pages/ComponentsContent.jsx', import.meta.url), 'utf8');
const reader = readFileSync(new URL('../app/src/pages/DocReader.jsx', import.meta.url), 'utf8');
if (!/<StorySample name=\{part\.name\}/.test(stage)) bad.push('the stage no longer falls back to StorySample for a part without a hand specimen');
if (!/title="No story yet"/.test(reader) || !/Add a story/.test(reader)) bad.push('StorySample has lost its "No story yet" state with Add a story');
if (/No live sample yet/.test(stage)) bad.push('the stage still has a "No live sample yet" empty state');
let live = null;
try {
  const r = await fetch(`${APP}/stories`, { signal: AbortSignal.timeout(8000) });
  live = r.ok ? await r.json() : null;
  const idx = await fetch(`${APP}/storybook/index.json`, { signal: AbortSignal.timeout(8000) });
  if (!idx.ok) bad.push(`${APP}/storybook/index.json answers ${idx.status}: CHIP is not serving BELLA's Storybook (restart the server)`);
} catch (e) {
  bad.push(`${APP} not reachable (${e.message}): the link check needs the running server`);
}
let ok = 0;
let withSample = 0;
const noSample = [];
for (const n of names) {
  const p = byPart[n];
  const id = p?.first ?? null;
  if (hand.has(n) || id) withSample += 1;
  else noSample.push(n);
  if (!id) { none.push(n); continue; }
  if (!entries[id]) { bad.push(`${n}: ${id} is not in the index`); continue; }
  if (live && live.parts?.[n]?.first !== id) { bad.push(`${n}: CHIP opens ${live.parts?.[n]?.first ?? 'nothing'}, the index says ${id}`); continue; }
  ok += 1;
}
console.log(`story-links-check: ${ok} of ${names.length} parts open a real story · ${none.length} have no story yet${none.length ? ` (${none.join(', ')})` : ''}`);
console.log(`live samples on the stage: ${withSample} of ${names.length} (${[...names].filter((n) => hand.has(n)).length} hand specimens, ${names.filter((n) => !hand.has(n) && byPart[n]?.first).length} drawn from a story) · ${noSample.length} show "No story yet"${noSample.length ? ` (${noSample.join(', ')})` : ''}`);
bad.forEach((b) => console.log(`FAIL ${b}`));
process.exit(bad.length ? 1 : 0);
