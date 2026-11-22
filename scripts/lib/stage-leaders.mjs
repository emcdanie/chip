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
