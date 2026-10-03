// OBI Docs: plain markdown files with front matter (title, tags, date,
// status, kind) in NOTES_DIR, outside the repo. Plus the relay's inbox
// (next.md, report.md), shown read-only under "Loop".
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOTES_DIR, INBOX_DIR } from './config.mjs';

export const STATUSES = ['draft', 'active', 'done'];
const LOOP = { 'loop-next': ['next.md', 'Next task (inbox)'], 'loop-report': ['report.md', 'Last report (inbox)'] };
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** "---\ntitle: ...\ntags: a, b\n---\nbody" -> { meta, body } */
export function parse(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  meta.tags = (meta.tags ?? '').replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
  return { meta, body: md.slice(m[0].length) };
}

const oneLine = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
// local: only marks a note that holds local-only text (an answer built on
// Cowork sources): it never goes to the cloud, even with the yes for private
function serialize({ title, tags, date, status, kind, localOnly }, body) {
  return `---\ntitle: ${oneLine(title)}\ntags: ${tags.map(oneLine).join(', ')}\ndate: ${date}\nstatus: ${status}\nkind: ${oneLine(kind)}\n${localOnly ? 'local: only\n' : ''}---\n\n${body.trim()}\n`;
}

const firstHeading = (md) => md.match(/^#\s+(.+)$/m)?.[1]?.trim();
const excerpt = (body) => body.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 140);

function noteEntry(file) {
  const path = join(NOTES_DIR, file);
  const { meta, body } = parse(readFileSync(path, 'utf8'));
  return {
    id: file.replace(/\.md$/, ''),
    group: 'Notes',
    title: meta.title || firstHeading(body) || file,
    tags: meta.tags,
    date: meta.date || null,
    status: STATUSES.includes(meta.status) ? meta.status : 'draft',
    kind: meta.kind || 'note',
    localOnly: meta.local === 'only',
    editable: true,
    updated: statSync(path).mtime.toISOString(),
    excerpt: excerpt(body),
    body,
  };
}

function loopEntry(id) {
  const [file, title] = LOOP[id];
  const path = join(INBOX_DIR, file);
  if (!existsSync(path)) return null;
  const body = readFileSync(path, 'utf8');
  return { id, group: 'Loop', title: firstHeading(body) || title, tags: ['loop'], date: null, status: 'active', kind: 'loop', editable: false, updated: statSync(path).mtime.toISOString(), excerpt: excerpt(body), body };
}

// newest change first
const noteFiles = () =>
  existsSync(NOTES_DIR)
    ? readdirSync(NOTES_DIR)
        .filter((f) => f.endsWith('.md') && ID.test(f.slice(0, -3)))
        .map((f) => [f, statSync(join(NOTES_DIR, f)).mtimeMs])
        .sort((a, b) => b[1] - a[1])
        .map(([f]) => f)
    : [];

/** Every doc without its body, Loop first, then notes newest first. */
export function listDocs() {
  const all = [...Object.keys(LOOP).map(loopEntry).filter(Boolean), ...noteFiles().map(noteEntry)];
  return all.map(({ body, ...d }) => d);
}

export function readDoc(id) {
  if (LOOP[id]) return loopEntry(id);
  if (!ID.test(id) || !existsSync(join(NOTES_DIR, `${id}.md`))) return null;
  return noteEntry(`${id}.md`);
}

const slug = (s) => oneLine(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'note';

/** Creates (no id) or updates a note. Returns the saved doc. */
export function saveDoc({ id, title, tags = [], status = 'draft', kind = 'note', body = '', localOnly = false }) {
  if (id && (LOOP[id] || !ID.test(id))) throw new Error('That doc cannot be edited here.');
  if (!oneLine(title)) throw new Error('A doc needs a title.');
  mkdirSync(NOTES_DIR, { recursive: true });
  const prev = id ? readDoc(id) : null;
  if (id && !prev) throw new Error('No doc with that id.');
  const date = prev?.date ?? new Date().toISOString().slice(0, 10);
  let file = id ? `${id}.md` : `${date}-${slug(title)}.md`;
  for (let n = 2; !id && existsSync(join(NOTES_DIR, file)); n++) file = `${date}-${slug(title)}-${n}.md`;
  const meta = { title, tags: (Array.isArray(tags) ? tags : String(tags).split(',')).map(oneLine).filter(Boolean).slice(0, 12), date, status: STATUSES.includes(status) ? status : 'draft', kind: prev?.kind ?? kind, localOnly: Boolean(prev?.localOnly || localOnly) }; // once local only, always
  writeFileSync(join(NOTES_DIR, file), serialize(meta, String(body).slice(0, 200000)));
  return noteEntry(file);
}

/** For the search index: notes as sources, "Docs · title", path obi-notes/<file>. */
export function docSources() {
  return noteFiles().map((f) => {
    const d = noteEntry(f);
    return { title: `Docs · ${d.title}`, url: null, path: `obi-notes/${f}`, text: `${d.title}\n\n${d.body}`, localOnly: d.localOnly };
  });
}
