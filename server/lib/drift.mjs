// Drift from Figma without a Figma key (her note, 22 Nov: "it's always empty, but we are running so many
// audits"). BELLA's specs (specs/components/<Name>.spec.yaml) are built by the parts session from a Figma
// read and the code; each lists its own `mismatch:` entries, field by field. Drift is read from there:
// a part drifts when it has a mismatch that is not only a token name with the same value in Chip
// (`sameValueInChip: true`). A spec with no `figma:` block was never read from Figma: not compared.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BELLA } from './bella-work.mjs';
import { DATA_DIR } from './config.mjs';

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

/** A spec's prop names (its `props:` list). */
export function specProps(text) {
  const out = [];
  let inProps = false;
  for (const l of String(text).split('\n')) {
    if (/^\S/.test(l)) inProps = l.startsWith('props:');
    const m = inProps && l.match(/^  - name:\s*(\S+)/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** A code part's prop names (its exported <Name>Props interface, as BELLA's contract-parity reads it). */
export function codeProps(src, name) {
  const m = String(src).match(new RegExp(`export interface ${name}Props(?:<[^{]*>)?\\s*(?:extends[^{]*)?\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return null;
  return [...m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\s{2}(\w+)\??:/gm)].map((x) => x[1]);
}

/** GET /drift: every code part (all of src/components), with what differs between Figma, its spec and its
 *  code. figma: the spec's own Figma-vs-code mismatches (when the spec holds a Figma read); spec: props the code
 *  has that the spec doesn't, or the spec still lists that the code dropped (the spec is behind the code);
 *  noSpec: the part has no spec at all. Most differences first. */
export function readDrift(bella = BELLA) {
  const dir = join(bella, 'specs/components');
  const src = join(bella, 'src/components');
  if (!existsSync(src)) return { at: null, parts: [], total: 0, compared: 0, drifting: 0, note: `No parts at ${src}` };
  const parts = [];
  let at = 0;
  for (const name of readdirSync(src).filter((d) => existsSync(join(src, d, `${d}.tsx`))).sort()) {
    const file = join(dir, `${name}.spec.yaml`);
    const code = codeProps(readFileSync(join(src, name, `${name}.tsx`), 'utf8'), name);
    if (!existsSync(file)) {
      parts.push({ name, spec: false, compared: false, differ: 0, fields: [], specBehind: [], noSpec: true });
      continue;
    }
    at = Math.max(at, statSync(file).mtimeMs);
    const text = readFileSync(file, 'utf8');
    const { compared, fields } = mismatchOf(text);
    const real = fields.filter((x) => !x.sameValue);
    const sp = specProps(text);
    const specBehind = code ? [...code.filter((p) => !sp.includes(p)).map((p) => `${p} (in code, not in the spec)`), ...sp.filter((p) => !code.includes(p)).map((p) => `${p} (in the spec, not in code)`)] : [];
    parts.push({ name, spec: true, compared, differ: real.length, fields: real.map((x) => x.field), sameValueOnly: fields.length - real.length, specBehind, noSpec: false });
  }
  const score = (p) => p.differ + p.specBehind.length + (p.noSpec ? 1 : 0);
  parts.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const compared = parts.filter((p) => p.compared);
  return {
    at: at ? new Date(at).toISOString() : null,
    total: parts.length,
    compared: compared.length,
    drifting: compared.filter((p) => p.differ).length,
    specBehind: parts.filter((p) => p.specBehind.length).length,
    noSpec: parts.filter((p) => p.noSpec).length,
    differing: parts.filter((p) => score(p)).length,
    parts,
  };
}

/* Gaps: what BELLA can't do yet (CHIP rules, 22 Nov: "Gaps lists what BELLA can't do yet"), measured:
   - parts with a spec (drawn and specified) but no code part yet: no src/components file exports them;
   - the parts BELLA's AGENTS.md lists as "Not in BELLA yet". */
export function readGaps(bella = BELLA) {
  const dir = join(bella, 'specs/components');
  const src = join(bella, 'src/components');
  const exported = new Set();
  if (existsSync(src))
    for (const d of readdirSync(src)) {
      const f = join(src, d, `${d}.tsx`);
      if (!existsSync(f)) continue;
      exported.add(d);
      for (const m of readFileSync(f, 'utf8').matchAll(/export (?:default )?(?:function|const) ([A-Z]\w+)/g)) exported.add(m[1]);
    }
  const notInCode = existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.spec.yaml')).map((x) => x.replace(/\.spec\.yaml$/, '')).filter((n) => !exported.has(n)).sort() : [];
  const agents = existsSync(join(bella, 'AGENTS.md')) ? readFileSync(join(bella, 'AGENTS.md'), 'utf8') : '';
  const line = agents.match(/Not in BELLA yet[^:]*:\s*([^.]+)\./)?.[1] ?? '';
  const notInBella = line.split(',').map((s) => s.trim()).filter(Boolean);
  return { notInCode, notInBella };
}

/* Drift over time (approved 22 Nov, "Health: what changes", pin 1): one snapshot each time BELLA's HEAD or the count
   moves, kept in data/drift-history.json (gitignored), so the trend is measured since the last check, never typed.
   A snapshot is only ever added by a /drift read; with one point there is no trend yet and the page says so. */
const HIST = join(DATA_DIR, 'drift-history.json');
export function driftHistory(d, head, file = HIST, now = new Date()) {
  let h = [];
  try {
    h = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  const last = h.at(-1);
  if (d?.total && (!last || last.head !== head || last.differing !== d.differing)) {
    h = [...h, { at: now.toISOString(), head, differing: d.differing, drifting: d.drifting, specBehind: d.specBehind, noSpec: d.noSpec }].slice(-60);
    try {
      writeFileSync(file, JSON.stringify(h));
    } catch {}
  }
  return h;
}
export const bellaHead = () => {
  try {
    return execFileSync('git', ['-C', BELLA, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
