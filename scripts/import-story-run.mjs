// Records a story run made outside CHIP as CHIP's Stories check result: its counts, time and commit, logged with
// the gate's runs (coordinator, 22 Nov: "CHIP's sync has no reader for it yet: add one"). A parts session writes
// story-run-<date>.json after running audit:visual's steps; this reads it, so CHIP never guesses or re-runs.
// Usage: node scripts/import-story-run.mjs <story-run.json>
import { readFileSync } from 'node:fs';
import { recordStoryRun } from '../server/lib/checks.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/import-story-run.mjs <story-run.json>');
  process.exit(2);
}
const r = recordStoryRun(JSON.parse(readFileSync(file, 'utf8')), file.split('/').pop());
console.log(`import-story-run: ${r.summary} · ${r.commit} · ${r.ranAt}`);
