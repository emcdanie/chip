// The record `npm run check:leaders` leaves, and what the guard reads (23 Nov 2026: a crossing leader must not
// reach a commit). The record belongs to one version of the files that draw the stage's labels.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
export const WATCHED = ['app/src/pages/ComponentsContent.jsx', 'app/src/specimens.jsx'];
export const RECORD = join(ROOT, 'data', 'stage-leaders.json');
export const leaderInputsHash = () => {
  const h = createHash('sha1');
  for (const f of WATCHED) h.update(existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '');
  return h.digest('hex');
};
