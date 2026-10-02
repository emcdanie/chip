// Local search: chunk markdown (~150 words, small overlap; small chunks keep the prompt short), embed with the
// local model, store in data/index/chunks.json, cosine top-k.
// Re-embeds only chunks whose text changed (keyed by hash), so a re-index
// with nothing new is fast.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, BELLA_DIR, NOTION_DIR, INDEX_FILE, BELLA_JSON, CHIP_EMBED_MODEL } from './config.mjs';
import { embed } from './llm.js';

const CHUNK_WORDS = 150;
const OVERLAP_WORDS = 25;

// ---- sources -------------------------------------------------------------
function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    try { meta[kv[1]] = kv[2].startsWith('"') ? JSON.parse(kv[2]) : kv[2]; } catch { meta[kv[1]] = kv[2]; }
  }
  return { meta, body: md.slice(m[0].length) };
}

const mdFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => join(dir, f)) : []);
const firstHeading = (md) => md.match(/^#\s+(.+)$/m)?.[1].trim();

export function bellaSummary(b) {
  const names = (fn) => b.components.filter(fn).map((c) => c.name).join(', ') || 'none';
  const docs = [];
  docs.push(
    `BELLA component health summary (from data/bella.json, synced from bella@${b.source.commit}, version ${b.source.version}).\n` +
    `BELLA has ${b.components.length} components. Platforms: web only (React). BELLA has no iOS or Android implementation, so there is no iOS or Android parity data of any kind.\n` +
    `Components: ${b.components.map((c) => c.name).join(', ')}.\n` +
    `Components with no Storybook story: ${names((c) => !c.hasStory)}.\n` +
    `Components with no docs description: ${names((c) => !c.hasDocs)}.\n` +
    `Components with no Tier 3 contract: ${names((c) => !c.hasContract)}.\n` +
    `Components with no DSDS entry: ${names((c) => !c.inDsds)}.\n` +
    `Components failing contract parity: ${names((c) => c.health.contract.status === 'fail')}.\n` +
    `Components failing a contrast pair: ${names((c) => c.health.contrast.status === 'fail')}.\n` +
    `Gates: contrast-pairs ${b.gates.contrastPairs.ok ? 'OK' : 'FAILED'}; contract-parity ${b.gates.contractParity.ok ? 'OK' : 'FAILED'}; audit:visual not run.`
  );
  docs.push(
    'BELLA AI-readiness stations (10). Measured scores come from real data; self-assessed stations have no score.\n' +
    b.stations.map((s) => `- ${s.name}: ${s.score === null ? 'no score (self-assessed)' : s.score + '%'}. ${s.basis}.`).join('\n')
  );
  docs.push(
    'BELLA components, one line each.\n' +
    b.components.map((c) =>
      `- ${c.name}: story ${c.hasStory ? 'yes' : 'no'}; docs ${c.hasDocs ? 'yes' : 'no'}; contract ${c.health.contract.status}; contrast ${c.health.contrast.status}; ` +
      `${c.tokens.count} tokens; composes ${c.composedFrom.join(', ') || 'nothing'}; variants ${c.variants.join(', ') || 'none'}.`
    ).join('\n')
  );
  return docs;
}

function collectSources() {
  const out = []; // { title, url?, path, text }
  for (const f of mdFiles(NOTION_DIR)) {
    const { meta, body } = frontMatter(readFileSync(f, 'utf8'));
    out.push({ title: meta.title || basename(f, '.md'), url: meta.url || null, path: relative(ROOT, f), text: body });
  }
  for (const f of mdFiles(join(ROOT, 'docs'))) {
    const md = readFileSync(f, 'utf8');
    out.push({ title: firstHeading(md) || basename(f, '.md'), url: null, path: relative(ROOT, f), text: md });
  }
  const bellaFiles = [...mdFiles(join(BELLA_DIR, 'docs')), join(BELLA_DIR, 'AGENTS.md'), join(BELLA_DIR, 'bella.dsds.yaml')];
  for (const f of bellaFiles.filter(existsSync)) {
    const md = readFileSync(f, 'utf8');
    out.push({ title: 'BELLA · ' + (f.endsWith('.md') ? firstHeading(md) || basename(f) : basename(f)), url: null, path: 'bella/' + relative(BELLA_DIR, f), text: md });
  }
  if (existsSync(BELLA_JSON)) {
    bellaSummary(JSON.parse(readFileSync(BELLA_JSON, 'utf8'))).forEach((text, i) =>
      out.push({ title: 'BELLA health (data/bella.json)', url: null, path: 'data/bella.json', text, single: true, part: i }));
  }
  return out;
}

// ---- chunking -------------------------------------------------------------
export function chunk(text) {
  const words = text.replace(/\r/g, '').split(/(?<=\s)/); // keep whitespace so line breaks survive
  const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    let end = start, n = 0;
    while (end < words.length && n < CHUNK_WORDS) { if (words[end].trim()) n++; end++; }
    chunks.push(words.slice(start, end).join('').trim());
    if (end >= words.length) break;
    let back = end, m = 0;
    while (back > start && m < OVERLAP_WORDS) { back--; if (words[back].trim()) m++; }
    start = back;
  }
  return chunks.filter((c) => wordCount(c) > 0);
}

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

// ---- build ----------------------------------------------------------------
export async function buildIndex({ log = () => {} } = {}) {
  const prev = loadIndex();
  const cache = new Map((prev?.model === CHIP_EMBED_MODEL ? prev.chunks : []).map((c) => [c.hash, c.embedding]));

  const pending = [];
  for (const src of collectSources()) {
    const pieces = src.single ? [src.text] : chunk(src.text);
    pieces.forEach((text, i) => {
      const embedText = `${src.title}\n\n${text}`;
      pending.push({ id: `${src.path}#${src.part ?? i}`, title: src.title, url: src.url, path: src.path, hash: sha(embedText), text, embedText });
    });
  }

  const fresh = pending.filter((c) => !cache.has(c.hash));
  log(`index: ${pending.length} chunks from ${new Set(pending.map((c) => c.path)).size} files · ${fresh.length} to embed`);
  if (fresh.length) {
    const vectors = await embed(fresh.map((c) => c.embedText), 'document');
    fresh.forEach((c, i) => cache.set(c.hash, vectors[i].map((v) => Math.round(v * 1e6) / 1e6)));
  }

  const chunks = pending.map(({ embedText, ...c }) => ({ ...c, embedding: cache.get(c.hash) }));
  const index = { model: CHIP_EMBED_MODEL, builtAt: new Date().toISOString(), chunks };
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(index));
  _index = index; _mtime = statSync(INDEX_FILE).mtimeMs;
  return { chunks: chunks.length, embedded: fresh.length };
}

// ---- search ---------------------------------------------------------------
let _index = null, _mtime = 0;
export function loadIndex() {
  if (!existsSync(INDEX_FILE)) return null;
  const mtime = statSync(INDEX_FILE).mtimeMs;
  if (!_index || mtime !== _mtime) { _index = JSON.parse(readFileSync(INDEX_FILE, 'utf8')); _mtime = mtime; }
  return _index;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function search(query, k = 6) {
  const index = loadIndex();
  if (!index || !index.chunks.length) throw new Error('No index yet. Run `chip sync`.');
  const [q] = await embed([query], 'query');
  return index.chunks
    .map((c) => ({ ...c, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ embedding, ...c }) => c);
}
