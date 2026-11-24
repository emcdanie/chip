// New › Project: what CHIP understands from a dropped MD text or a folder's own notes, and the project store.
// Read only on what is given. Dropped text is scanned against ~/.claude/nda-terms.txt first and refused on a
// match, without echoing the term (CHIP is public). Folders are listed and read only under the home folder,
// by allow-listed file names, with realpath checks so a link or ".." cannot leave it.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { DATA_DIR } from './config.mjs';

export const MAX_TEXT = 200_000;
// CHIP_PROJECTS_DIR: a test keeps its records in a temp folder
const DATA = () => process.env.CHIP_PROJECTS_DIR || DATA_DIR;
const STORE = () => join(DATA(), 'projects.json');
const MADE = () => join(DATA(), 'projects');
const NOTES = ['CLAUDE.md', 'AGENTS.md', 'README.md'];
const HOME = () => process.env.CHIP_HOME || homedir();

/* ---------- the NDA scan ---------- */
function terms() {
  try {
    return readFileSync(process.env.CHIP_NDA_TERMS || join(homedir(), '.claude', 'nda-terms.txt'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** True when the text names a forbidden term (word boundary, any case). Never says which. */
export const touchesNda = (text, list = terms()) => list.some((t) => new RegExp(`\\b${esc(t)}\\b`, 'i').test(text));
const privateHeading = (text) => /^#{1,3}\s.*\b(NDA|private|confidential)\b/im.test(text) || /Public \/ Private:\s*private/i.test(text);

/* ---------- reading the text ---------- */
const guess = (value, source, sure = false) => (value ? { value, source, sure } : null);
const FIGMA = /https:\/\/(?:www\.)?figma\.com\/(?:design|file|board)\/[\w-]+[^\s)>"']*/i;
const REPO = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+/i;
const CHIP_HOME_REF = /(?:~|\/Users\/[\w.-]+)\/[\w./-]+/;

/** What the text says, field by field. A field is null when the text does not say; sure is false for a guess. */
export function understand(text, fileName = '') {
  const lines = text.split('\n');
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  const base = String(fileName).replace(/\.(md|markdown|txt)$/i, '').replace(/^CLAUDE$|^README$|^AGENTS$/i, '');
  const name = h1 ? guess(h1.replace(/^#\s+/, '').replace(/^(CLAUDE\.md|README)\s*[:\-–—]\s*/i, '').trim().slice(0, 60), 'First heading', true) : guess(base.slice(0, 60), 'File name');
  // what it is for: a "What / Purpose / About" section's first line, else the first prose line after the heading
  const at = lines.findIndex((l) => /^#{2,3}\s*(what( it is| is it)?|purpose|about|overview|goal|what it's for)\b/i.test(l));
  const prose = (from) => lines.slice(from).find((l) => l.trim() && !/^[#>|`\-*\d]/.test(l.trim()));
  const forLine = at >= 0 ? prose(at + 1) : prose(h1 ? lines.indexOf(h1) + 1 : 0);
  const purpose = forLine ? guess(forLine.trim().slice(0, 200), at >= 0 ? 'The “what” section' : 'First paragraph', at >= 0) : null;
  const gh = text.match(REPO)?.[0];
  const local = text.match(CHIP_HOME_REF)?.[0];
  const repo = gh ? guess(gh, 'A GitHub link in the text', true) : local ? guess(local.replace(/[).,;]+$/, ''), 'A folder path in the text') : null;
  const branches = [...new Set([...text.matchAll(/\b(?:branch(?:es)?\s*[:`]*\s*)?`?((?:chip|feat|fix|chore|release)\/[\w.-]*\w)`?/gi)].map((m) => m[1]))].slice(0, 8);
  const rules = NOTES.filter((n) => new RegExp(`\\b${esc(n)}\\b`, 'i').test(text) || (n === 'CLAUDE.md' && /READ FIRST|^#{1,3}\s*Rules\b/im.test(text)));
  const figma = text.match(FIGMA)?.[0];
  const who = lines.find((l) => /^\W*(who (it is|it's) for|audience|for whom|users?)\b/i.test(l.replace(/^#+\s*/, '')));
  const whoText = who ? who.replace(/^#+\s*/, '').replace(/^[^:]*:\s*/, '').trim() : prose(lines.findIndex((l) => /^#{2,3}\s*(who|audience|users?)\b/i.test(l)) + 1);
  const forWhom = who && whoText && whoText !== who.trim() ? guess(whoText.slice(0, 160), 'The “who” line', true) : (text.match(/\bfor ((?:the )?[A-Z][\w ]{2,40}?(?:team|designers?|developers?|engineers?|users?|clients?))\b/)?.[1] ? guess(text.match(/\bfor ((?:the )?[A-Z][\w ]{2,40}?(?:team|designers?|developers?|engineers?|users?|clients?))\b/)[1], 'A “for …” phrase') : null);
  return { name, purpose, repo, branches: branches.length ? guess(branches.join(', '), 'Branch names in the text', true) : null, rules: rules.length ? guess(rules.join(', '), 'Rule files named in the text', true) : null, figma: figma ? guess(figma, 'A Figma link in the text', true) : null, forWhom };
}

/** { ok, refused?, fields } for dropped text. Refuses an NDA term or a private heading without naming it. */
export function readDropped(text, fileName = '') {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, refused: 'empty', message: 'There is nothing to read in that.' };
  if (text.length > MAX_TEXT) return { ok: false, refused: 'size', message: 'That is too long to read here (200 KB at most).' };
  if (touchesNda(text) || privateHeading(text)) return { ok: false, refused: 'private', message: 'This looks like private work. CHIP is public, so it will not read it.' };
  return { ok: true, fields: understand(text, fileName) };
}

/* ---------- Connect a folder: list and read under the home folder only ---------- */
function underHome(p) {
  if (typeof p !== 'string' || p.includes('\0')) throw new Error('Not a folder');
  const want = p.replace(/^~(?=\/|$)/, HOME());
  if (!want.startsWith(sep)) throw new Error('Not a folder');
  const real = realpathSync(want);
  const home = realpathSync(HOME());
  if (real !== home && !real.startsWith(home + sep)) throw new Error('Only folders under your home folder');
  if (!statSync(real).isDirectory()) throw new Error('Not a folder');
  return real;
}
const hidden = (n) => n.startsWith('.') || n === 'node_modules' || n === 'Library';

/** The folders directly inside dir (the home folder by default), no hidden ones. */
export function listFolders(dir) {
  const real = underHome(dir || '~');
  return { dir: real, up: real === realpathSync(HOME()) ? null : join(real, '..'), folders: readdirSync(real, { withFileTypes: true }).filter((e) => e.isDirectory() && !hidden(e.name)).map((e) => e.name).sort((a, b) => a.localeCompare(b)).slice(0, 200) };
}

/** What a folder says about itself: its CLAUDE.md, AGENTS.md or README.md, read by name only. */
export function readFolder(dir) {
  const real = underHome(dir);
  const found = NOTES.filter((n) => existsSync(join(real, n)) && statSync(join(real, n)).isFile());
  const first = found.find((n) => n !== 'AGENTS.md') ?? found[0];
  const folderName = real.split(sep).pop();
  if (!first) return { ok: true, folder: real, fields: { ...understand('', folderName), repo: guess(real, 'The folder you picked', true), rules: null }, found: [] };
  const text = readFileSync(join(real, first), 'utf8').slice(0, MAX_TEXT);
  if (touchesNda(text) || privateHeading(text)) return { ok: false, refused: 'private', message: 'This looks like private work. CHIP is public, so it will not read it.' };
  const f = understand(text, folderName);
  return { ok: true, folder: real, found, fields: { ...f, name: f.name ?? guess(folderName, 'Folder name'), repo: guess(real, 'The folder you picked', true), rules: found.length ? guess(found.join(', '), 'Files in the folder', true) : null } };
}

/* ---------- the store: data/projects.json (gitignored) ---------- */
export function readStore() {
  try {
    const d = JSON.parse(readFileSync(STORE(), 'utf8'));
    return Array.isArray(d.projects) ? d.projects : [];
  } catch {
    return [];
  }
}
const write = (projects) => (mkdirSync(DATA(), { recursive: true }), writeFileSync(STORE(), JSON.stringify({ projects }, null, 2) + '\n'));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/** What Set up will create, for the plan sheet: nothing is written. */
export function setupPlan(fields) {
  const id = slug(fields?.name);
  if (!id) throw new Error('A name is needed');
  return { id, creates: [`A “${String(fields.name).slice(0, 60)}” entry under Projects in the side menu`, `A board scope, so the Work board can filter to ${String(fields.name).slice(0, 60)}`, `A notes folder at data/projects/${id}/notes`, `A handoff file at data/projects/${id}/handoff.md`] };
}

/** Writes the record, the notes folder and the handoff file. Returns the record. Undo is removeProject. */
export function createProject(fields, reserved = []) {
  const id = slug(fields?.name);
  const name = String(fields?.name ?? '').trim().slice(0, 60);
  if (!id || !name) throw new Error('A name is needed');
  if (reserved.includes(id) || readStore().some((p) => p.id === id)) throw new Error(`There is already a project called ${name}`);
  const pick = (k, n = 200) => (typeof fields[k] === 'string' ? fields[k].trim().slice(0, n) : '');
  const repoRaw = pick('repo', 300);
  let repo = null;
  if (repoRaw.startsWith('/') || repoRaw.startsWith('~')) repo = underHome(repoRaw); // only a real folder under home is kept as a path
  const rec = { id, name, short: name, description: pick('purpose'), repo, url: /^https:\/\//.test(repoRaw) ? repoRaw : null, branches: pick('branches', 400), rules: pick('rules', 120), figma: /^https:\/\/(www\.)?figma\.com\//.test(pick('figma', 400)) ? pick('figma', 400) : null, forWhom: pick('forWhom', 160), createdAt: new Date().toISOString() };
  const dir = join(MADE(), id);
  mkdirSync(join(dir, 'notes'), { recursive: true });
  writeFileSync(join(dir, 'handoff.md'), `# ${name}\n\n- done: \n- next: \n- blockers: \n- files: \n- branch: \n`);
  write([...readStore(), rec]);
  return rec;
}

/** Undo: the record, its notes folder and its handoff file, only what CHIP made. */
export function removeProject(id) {
  if (!/^[a-z0-9-]{1,30}$/.test(String(id))) throw new Error('No such project');
  const all = readStore();
  if (!all.some((p) => p.id === id)) throw new Error('CHIP did not make that project');
  write(all.filter((p) => p.id !== id));
  rmSync(join(MADE(), id), { recursive: true, force: true });
  return { removed: id };
}

/** Where a project made here keeps its notes and handoff. */
export const madeDir = (id) => join(MADE(), id);
