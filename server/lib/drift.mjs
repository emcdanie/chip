// Drift from Figma without a Figma key (her note, 22 Nov: "it's always empty, but we are running so many
// audits"). BELLA's specs (specs/components/<Name>.spec.yaml) are built by the parts session from a Figma
// read and the code; each lists its own `mismatch:` entries, field by field. Drift is read from there:
// a part drifts when it has a mismatch that is not only a token name with the same value in Chip
// (`sameValueInChip: true`). A spec with no `figma:` block was never read from Figma: not compared.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BELLA } from './bella-work.mjs';

/** One spec's text → { compared, fields: [{ field, sameValue }] } (only the lines this needs). */
export function mismatchOf(text) {
  const lines = String(text).split('\n');
  const compared = lines.some((l, i) => l === 'figma:' && /^\s+nodeId:/.test(lines[i + 1] ?? ''));
  const fields = [];
  let inBlock = false;
  for (const l of lines) {
    if (/^\S/.test(l)) inBlock = l.startsWith('mismatch:') && !/\[\]\s*$/.test(l);
    if (!inBlock) continue;
    const f = l.match(/^  - field:\s*(.+)$/);
    if (f) fields.push({ field: f[1].trim(), sameValue: false });
    else if (/^\s+sameValueInChip:\s*true/.test(l) && fields.length) fields[fields.length - 1].sameValue = true;
  }
  return { compared, fields };
}

/** GET /drift: every part's spec, the ones that drift first (most differences first). */
export function readDrift(dir = join(BELLA, 'specs/components')) {
  if (!existsSync(dir)) return { at: null, parts: [], compared: 0, total: 0, note: `No specs at ${dir}` };
  const parts = [];
  let at = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.spec.yaml'))) {
    const file = join(dir, f);
    at = Math.max(at, statSync(file).mtimeMs);
    const { compared, fields } = mismatchOf(readFileSync(file, 'utf8'));
    const real = fields.filter((x) => !x.sameValue);
    parts.push({ name: f.replace(/\.spec\.yaml$/, ''), compared, differ: real.length, fields: real.map((x) => x.field), sameValueOnly: fields.length - real.length });
  }
  parts.sort((a, b) => b.differ - a.differ || a.name.localeCompare(b.name));
  const compared = parts.filter((p) => p.compared);
  return { at: at ? new Date(at).toISOString() : null, total: parts.length, compared: compared.length, drifting: compared.filter((p) => p.differ).length, parts };
}
