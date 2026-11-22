// The record `npm run check:leaders` leaves, and what the guard reads (23 Nov 2026: a crossing leader must not
// reach a commit). The record belongs to one version of the files that draw the stage's labels.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
export const WATCHED = ['app/src/pages/ComponentsContent.jsx', 'app/src/specimens.jsx'];
export const RECORD = join(ROOT, 'data', 'stage-leaders.json');
export const leaderInputsHash = () => {
  const h = createHash('sha1');
  for (const f of WATCHED) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};

// the same record for the Processes board's lines (scripts/process-line-check.mjs)
export const PROCESS_WATCHED = ['app/src/pages/SystemMapContent.jsx'];
export const PROCESS_RECORD = join(ROOT, 'data', 'process-lines.json');
export const processInputsHash = () => {
  const h = createHash('sha1');
  for (const f of PROCESS_WATCHED) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};

// the same record for card alignment (scripts/card-align-check.mjs): the shared templates and every page
export const CARD_RECORD = join(ROOT, 'data', 'card-align.json');
// and for the responsive check (scripts/responsive-check.mjs): the same watched files, its own record
export const RESPONSIVE_RECORD = join(ROOT, 'data', 'responsive.json');
export const cardWatched = () => {
  const out = ['app/src/templates/Flow.jsx', 'app/src/templates/Screen.jsx', 'app/src/templates/Screen.css'];
  const pages = join(ROOT, 'app/src/pages');
  if (existsSync(pages)) for (const f of readdirSync(pages).sort()) if (/Content\.jsx$|\.css$/.test(f)) out.push(`app/src/pages/${f}`);
  return out;
};
export const cardInputsHash = () => {
  const h = createHash('sha1');
  for (const f of cardWatched()) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};

// responsive record, per page (scripts/responsive-check.mjs): a commit needs a clean run of the routes its own files draw,
// on exactly those files; a shared template draws them all
export const PAGE_ROUTES = [
  [/WorkContent|WorkDrawer|WorkPanel/, '#/work'],
  [/HealthContent/, '#/health'],
  [/ComponentsContent|componentsModel/, '#/system/components'],
  [/FoundationsContent/, '#/system/foundations'],
  [/HistoryContent/, '#/system/history'],
  [/Playground/, '#/playground'],
  [/SystemMapContent/, '#/system-map'],
  [/Connectors/, '#/connectors'],
  [/Team/, '#/team'],
  [/NotAgain/, '#/not-again'],
];
export const fileHashes = () => Object.fromEntries(cardWatched().map((f) => [f, createHash('sha1').update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '').digest('hex')]));

// A scroll box passes its scroll to the page at its end (scripts/scroll-chain-check.mjs; her bug, 22 Nov: "you scroll
// inside and get to the bottom then it just stops")
export const SCROLL_WATCHED = ['app/src/templates/Screen.css', 'app/src/templates/Flow.jsx', 'app/src/kit/kit.css', 'app/src/atlas.css'];
export const SCROLL_RECORD = join(ROOT, 'data', 'scroll-chain.json');
export const scrollInputsHash = () => {
  const h = createHash('sha1');
  for (const f of SCROLL_WATCHED) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};

// The strip under the stage shows the part's own states, never other components (scripts/states-strip-check.mjs; her
// bug, 22 Nov: "its meant to be states not take you to other components")
export const STRIP_WATCHED = ['app/src/pages/ComponentsContent.jsx', 'app/src/pages/componentsModel.js', 'app/src/specimens.jsx'];
export const STRIP_RECORD = join(ROOT, 'data', 'states-strips.json');
export const stripInputsHash = () => {
  const h = createHash('sha1');
  for (const f of STRIP_WATCHED) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};
