// The real sources behind CHIP's reasons (Elleta, 23 Nov 2026: "it should show the actual article, study, whatever, and
// give an option to view it if possible"). Every entry names who said it, what it is called and when, from the repo's own
// notes and rule files; where a field is not recorded here it is null and the screen says so. Nothing is invented.
//
// What View shows, by `read`:
//   null  a standard (WCAG): CHIP shows who, what and when, and the link; it never copies another site's text (her pick B, 23 Nov)
//   note  CHIP's own saved note of a talk (a file in docs/), marked "not the original"; none saved means no View
//   file  a house rule: the heading's section of one of our own rule files
// The original is always a link, marked as leaving CHIP, because w3.org, smashingconf.com and smashingmagazine.com refuse
// to be framed (checked 23 Nov: X-Frame-Options and frame-ancestors).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './config.mjs';
import { bellaDir } from '../../scripts/lib/bella-dir.mjs';

const W3 = 'https://www.w3.org/WAI/WCAG22/Understanding/';
const wcag = (id, n, title, level, page) => ({ id: `wcag-${id}`, kind: 'standard', author: 'W3C', title: `${n} ${title}`, date: 'WCAG 2.2, Oct 2023', level, original: `${W3}${page}.html`, read: null });

export const SOURCES = [
  wcag('1-4-3', '1.4.3', 'Contrast (Minimum)', 'AA', 'contrast-minimum'),
  wcag('1-4-6', '1.4.6', 'Contrast (Enhanced)', 'AAA', 'contrast-enhanced'),
  wcag('1-4-11', '1.4.11', 'Non-text Contrast', 'AA', 'non-text-contrast'),
  wcag('2-1-1', '2.1.1', 'Keyboard', 'A', 'keyboard'),
  wcag('2-3-3', '2.3.3', 'Animation from Interactions', 'AAA', 'animation-from-interactions'),
  wcag('2-5-5', '2.5.5', 'Target Size (Enhanced)', 'AAA', 'target-size-enhanced'),
  wcag('2-5-8', '2.5.8', 'Target Size (Minimum)', 'AA', 'target-size-minimum'),
  wcag('4-1-2', '4.1.2', 'Name, Role, Value', 'A', 'name-role-value'),
  { id: 'curtis-components-as-data', kind: 'talk', author: 'Nathan Curtis', title: 'Components as Data for Humans and Machines', date: '15 Apr 2026, Smashing Conference Amsterdam', original: 'https://smashingconf.com/amsterdam-2026/speakers/nathan-curtis/', read: 'note', note: 'smashing-conf-nathan-curtis-2026-04-15.md' },
  { id: 'friedman-ai-patterns', kind: 'talk', author: 'Vitaly Friedman', title: 'Design Patterns For AI Interfaces', date: '16 Feb to 2 Mar 2026, Smashing workshop', original: 'https://smashed.by/ai-spring26', read: 'note', note: 'source-friedman-design-patterns-ai-interfaces.md' },
  { id: 'friedman-trust', kind: 'talk', author: 'Vitaly Friedman', title: 'Designing for Trust in AI', date: '2 Apr 2026, Smashing workshop', original: null, read: 'note', note: 'source-friedman-trust-in-ai.md' },
  { id: 'frost-atomic', kind: 'talk', author: 'Brad Frost', title: 'Atomic Design, and the Subatomic course on tokens', date: null, original: 'https://atomicdesign.bradfrost.com', read: 'note', note: 'source-frost-atomic-and-eddie-pipeline.md' },
  { id: 'bella-read-first', kind: 'house', author: 'BELLA', title: 'maintaining.md, READ FIRST', date: 'cut to this form 19 Nov 2026', original: null, read: 'file', file: 'bella:docs/agents/maintaining.md', heading: 'READ FIRST' },
  { id: 'bella-floors', kind: 'house', author: 'BELLA', title: 'AGENTS.md, Floors', date: null, original: null, read: 'file', file: 'bella:AGENTS.md', heading: 'Floors' },
  { id: 'chip-relay', kind: 'house', author: 'CHIP', title: 'CLAUDE.md, Checks and process', date: null, original: null, read: 'file', file: 'chip:CLAUDE.md', heading: 'Checks and process' },
  // any section of CHIP's CLAUDE.md, named by the caller (a step's "why it matters" says which section it came from)
  { id: 'chip-claude', kind: 'house', author: 'CHIP', title: 'CLAUDE.md', date: null, original: null, read: 'file', file: 'chip:CLAUDE.md', heading: null, byHeading: true },
  { id: 'chip-drawers', kind: 'house', author: 'CHIP', title: 'CLAUDE.md, how CHIP shows things', date: '23 Nov 2026', original: null, read: 'file', file: 'chip:CLAUDE.md', heading: 'READ FIRST: how CHIP shows things' },
];

const byId = new Map(SOURCES.map((s) => [s.id, s]));
export const sourceById = (id) => byId.get(String(id)) ?? null;

/** What the screen needs without reading anything: no file path, no fetch. `readable` says whether View has text. */
export function sourceList() {
  return SOURCES.map(({ id, kind, author, title, date, level, original, read }) => ({ id, kind, author, title, date, level: level ?? null, original, readable: read !== null && (read !== 'note' || Boolean(noteFile(byId.get(id)))) }));
}

// a worktree's talk notes (gitignored) and its newest CLAUDE.md live in the main checkout, so that is looked in first
function roots() {
  const out = [ROOT];
  try {
    const common = execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    out.unshift(resolve(ROOT, common, '..'));
  } catch {}
  return [...new Set(out)];
}
const docsDirs = () => roots().map((r) => join(r, 'docs'));
function noteFile(s) {
  if (!s?.note) return null;
  return docsDirs().map((d) => join(d, s.note)).find((f) => existsSync(f)) ?? null;
}
function ruleFile(s) {
  const [root, rel] = String(s.file).split(':');
  const bases = root === 'bella' ? [bellaDir({ quiet: true })] : roots();
  return bases.map((b) => join(b, rel)).find((f) => existsSync(f)) ?? null;
}

const CAP = 2600;
const cut = (text) => {
  const t = text.trim();
  if (t.length <= CAP) return t;
  const at = t.lastIndexOf('\n', CAP);
  return `${t.slice(0, at > 800 ? at : CAP).trim()}`;
};
/** The markdown under one heading (any level) up to the next heading of the same or higher level. */
export function sectionOf(md, heading) {
  const lines = md.split('\n');
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (at < 0) return null;
  const level = lines[at].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(at + 1, end < 0 ? undefined : end).join('\n');
}
/** A house rule without her own words: CHIP never quotes her back to her (CLAUDE.md, Say it once), so a bracket that holds a quote goes. */
export function withoutHerWords(text) {
  return text.replace(/\s*\([^()]*["“][^()]*\)/g, '').replace(/^Elleta, [^\n:]*:\s*"[^\n]*$/gm, '').replace(/ ?"[^"\n]{40,}"/g, '').replace(/\n{3,}/g, '\n\n');
}
/** The text of a saved talk note: the title block and the first sections, not the whole file. */
export function noteText(md) {
  const parts = md.split(/\n(?=## )/);
  return parts.slice(1, 3).join('\n').replace(/\*\*Notion source[\s\S]*?\n\n/g, '');
}
/** One source with its readable text: { ...meta, text, textKind, at }. text is null when nothing can be shown here. */
export async function readSource(id, { heading } = {}) {
  const s = sourceById(id);
  if (!s) return null;
  const meta = { ...sourceList().find((x) => x.id === s.id) };
  const want = s.byHeading ? String(heading ?? '').slice(0, 120) : s.heading;
  if (s.byHeading && want) meta.title = `CLAUDE.md, ${want}`;
  try {
    if (s.read === 'note') {
      const f = noteFile(s);
      return { ...meta, text: f ? cut(noteText(readFileSync(f, 'utf8'))) : null, textKind: 'note' };
    }
    if (s.read === 'file') {
      const f = ruleFile(s);
      const sec = f && want ? sectionOf(readFileSync(f, 'utf8'), want) : null;
      return { ...meta, text: sec ? cut(withoutHerWords(sec)) : null, textKind: 'rule' };
    }
  } catch (e) {
    return { ...meta, text: null, textKind: s.read, error: 'CHIP could not read it just now.' };
  }
  return { ...meta, text: null, textKind: null };
}
