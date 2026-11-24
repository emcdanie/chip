// System > Docs and each part's Contract (Elleta, 23 Nov: "where can we see all the docs behind the system"). Read only.
// Lists and serves files from an allow-list of folders in the two checkouts (BELLA's docs and specs, CHIP's own docs);
// an id is only ever a key of the listing built from that allow-list, so no path a caller types is opened.
// A doc whose text matches ~/.claude/nda-terms.txt is never listed or served (skipped silently, no term named).
// Everything is measured from the files: title and first paragraph from the text, "updated" from git, size from the file.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { codeProps, mismatchOf, specProps } from './drift.mjs';

const require = createRequire(import.meta.url);
// js-yaml is installed in the BELLA checkout (the specs' own parser); CHIP carries none of its own
function loadYaml(theme) {
  for (const base of [theme, join(homedir(), 'DEV', 'bella-chip-theme')]) {
    try {
      return createRequire(join(base, 'package.json'))('js-yaml');
    } catch {}
  }
  try {
    return require('js-yaml');
  } catch {
    return null;
  }
}

export const KINDS = ['Principles', 'Tokens', 'Typography', 'Motion', 'Decisions', 'Agents', 'Component specs', 'Reference', 'CHIP'];

/** The scan list: one word or phrase per line, "#" lines ignored; word-boundary, case-insensitive. */
export function readTerms(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  } catch {
    return [];
  }
}
const private_ = (text, terms) => terms.some((r) => r.test(text));

/* ------- markdown -> structured sections (never raw markdown on screen) ------- */
const stripInline = (s) => s.replace(/`([^`]*)`/g, '$1').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(?<![\w*])\*([^*\n]+)\*(?!\w)/g, '$1').replace(/<[^>]+>/g, '');
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => stripInline(c.trim()));

/** Markdown text -> { title, sections: [{ title, level, blocks }] }. Blocks: p, ul, ol, quote, code, table. */
export function structure(md) {
  const body = String(md).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = body.split('\n');
  const sections = [];
  let title = null;
  let cur = { title: null, level: 0, blocks: [] };
  const flush = () => {
    if (cur.blocks.length || cur.title) sections.push(cur);
  };
  let para = [];
  const endPara = () => {
    if (para.length) cur.blocks.push({ t: 'p', text: stripInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = l.match(/^\s*```+\s*(\w*)/);
    if (fence) {
      endPara();
      const code = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      cur.blocks.push({ t: 'code', lang: fence[1] || 'text', text: code.join('\n') });
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (h) {
      endPara();
      if (h[1].length === 1 && !title) {
        title = stripInline(h[2]);
        continue;
      }
      flush();
      cur = { title: stripInline(h[2]), level: h[1].length, blocks: [] };
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      endPara();
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      cur.blocks.push({ t: 'table', head, rows });
      continue;
    }
    const li = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      endPara();
      const ordered = /\d/.test(li[1]);
      const items = [stripInline(li[2])];
      while (i + 1 < lines.length) {
        const n = lines[i + 1];
        const m = n.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (m) items.push(stripInline(m[2]));
        else if (/^\s{2,}\S/.test(n) && items.length) items[items.length - 1] += ` ${stripInline(n.trim())}`;
        else break;
        i++;
      }
      cur.blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (/^\s*>/.test(l)) {
      endPara();
      const q = [l.replace(/^\s*>\s?/, '')];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) q.push(lines[++i].replace(/^\s*>\s?/, ''));
      cur.blocks.push({ t: 'quote', text: stripInline(q.join(' ')) });
      continue;
    }
    if (!l.trim()) {
      endPara();
      continue;
    }
    if (/^\s*(<!--|-{3,}\s*$)/.test(l)) continue;
    para.push(l.trim());
  }
  endPara();
  flush();
  return { title, sections };
}

const firstParagraph = (md) => {
  for (const s of structure(md).sections) for (const b of s.blocks) if (b.t === 'p' && b.text.length > 12) return b.text.slice(0, 180);
  return '';
};

/* ------- the allow-list ------- */
/** roots: { theme, chip, chipMain } absolute checkout folders. Every entry names its folder and extension. */
function sources(roots) {
  const md = (root, dir) => ({ root, dir, ext: '.md' });
  return [
    { kind: 'Principles', root: 'theme', files: ['docs/principles.md'] },
    { kind: 'Tokens', root: 'theme', files: ['docs/tokens.md'] },
    { kind: 'Typography', root: 'theme', files: ['docs/typography.md'] },
    { kind: 'Motion', root: 'theme', files: ['docs/motion-system.md'] },
    { kind: 'Decisions', ...md('theme', 'docs/decisions') },
    { kind: 'Agents', root: 'theme', files: ['AGENTS.md', 'docs/agents/maintaining.md'] },
    { kind: 'Agents', ...md('theme', 'docs/agents/rules') },
    { kind: 'Component specs', root: 'theme', dir: 'specs/components', ext: '.spec.yaml' },
    { kind: 'Reference', ...md('theme', 'docs/reference') },
    { kind: 'CHIP', ...md('chip', 'docs/plans') },
    { kind: 'CHIP', root: 'chip', files: ['docs/host.md', 'docs/layout-foundation.md'] },
    // the feature list lives with the main CHIP checkout; this one file is the only thing read from there
    { kind: 'CHIP', root: 'chipMain', files: ['docs/reference/designed-features.md'] },
  ].filter((s) => roots[s.root]);
}

/** The last commit date of every file under a checkout's folders, one git call per checkout. */
function gitDates(root) {
  const out = new Map();
  try {
    const text = execFileSync('git', ['-C', root, 'log', '--name-only', '--format=@@%cI', '--', 'docs', 'specs', 'AGENTS.md'], { encoding: 'utf8', maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] });
    let at = null;
    for (const l of text.split('\n')) {
      if (l.startsWith('@@')) at = l.slice(2);
      else if (l && at && !out.has(l)) out.set(l, at);
    }
  } catch {}
  return out;
}

export function createSystemDocs({ roots, parts, termsFile = join(homedir(), '.claude', 'nda-terms.txt') }) {
  const yaml = loadYaml(roots.theme);
  let cache = null;
  const TTL = 30e3;

  function build() {
    const terms = readTerms(termsFile);
    const dates = Object.fromEntries(Object.entries(roots).map(([k, r]) => [k, gitDates(r)]));
    const byId = new Map();
    for (const s of sources(roots)) {
      const base = roots[s.root];
      const rels = s.files ?? (existsSync(join(base, s.dir)) ? readdirSync(join(base, s.dir)).filter((f) => f.endsWith(s.ext)).map((f) => `${s.dir}/${f}`) : []);
      for (const rel of rels) {
        const path = join(base, rel);
        if (!existsSync(path) || !statSync(path).isFile()) continue;
        const text = readFileSync(path, 'utf8');
        if (private_(text, terms) || private_(rel, terms)) continue;
        const isSpec = rel.endsWith('.spec.yaml');
        const name = rel.split('/').pop();
        const st = statSync(path);
        const spec = isSpec ? specSummary(text, yaml) : null;
        byId.set(`${s.root}/${rel}`, {
          id: `${s.root}/${rel}`,
          kind: s.kind,
          title: isSpec ? name.replace(/\.spec\.yaml$/, '') : structure(text).title ?? name.replace(/\.md$/, ''),
          line: isSpec ? spec.line : firstParagraph(text),
          updated: dates[s.root].get(rel) ?? st.mtime.toISOString(),
          bytes: st.size,
          path: rel,
          root: s.root,
          isSpec,
        });
      }
    }
    return byId;
  }
  const index = () => {
    if (!cache || Date.now() - cache.at > TTL) cache = { at: Date.now(), byId: build() };
    return cache.byId;
  };

  function list() {
    const docs = [...index().values()].map(({ id, kind, title, line, updated, bytes }) => ({ id, kind, title, line, updated, bytes }));
    docs.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.kind === 'Decisions' ? b.id.localeCompare(a.id) : a.title.localeCompare(b.title)));
    return { at: new Date().toISOString(), kinds: KINDS, docs };
  }

  /** One doc as structure. null when the id is not in the listing (so a typed path never reaches the disk). */
  function read(id) {
    const e = index().get(String(id));
    if (!e) return null;
    const text = readFileSync(join(roots[e.root], e.path), 'utf8');
    const head = { id: e.id, kind: e.kind, title: e.title, updated: e.updated, bytes: e.bytes, path: e.path };
    if (e.isSpec) return { ...head, contract: contractOf(e.title) };
    return { ...head, ...structure(text) };
  }

  /* ------- a part's contract: tokens/contracts.json (BELLA parts) + its spec (BELLA docs checkout) ------- */
  function specSummary(text, y = yaml) {
    let d = null;
    try {
      d = y?.load(text);
    } catch {}
    const props = d?.props?.length ?? 0;
    return { line: d?.lead?.text ? String(d.lead.text) : `${props} properties`, doc: d };
  }
  const contractsFile = () => join(roots.parts, 'tokens/contracts.json');
  // the doc's first sentences up to about 40 characters ("Tier." alone says nothing)
  const sentence = (t) => {
    let out = '';
    for (const s of String(t ?? '').replace(/`/g, '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)) {
      out = out ? `${out} ${s}` : s;
      if (out.length >= 40) break;
    }
    return out.slice(0, 220);
  };
  // the published Storybook page as a frame address (its ?path=/docs/<id> is the manager; iframe.html?id=<id> is the story alone)
  const frame = (u) => {
    const m = String(u ?? '').match(/^(https:\/\/[^/]+\/[^?]*?)\/?\?path=\/(docs|story)\/([\w-]+)/);
    return m ? `${m[1]}/iframe.html?id=${m[3]}&viewMode=${m[2]}` : null;
  };
  const pretty = (t) => String(t ?? '').replace(/'/g, '').replace(/\s*\|\s*/g, ' or ');

  // a spec lists variants as { prop: { values, default } } or, for a part drawn as one set, { count, default, names: [...] }
  function variantsOf(v) {
    if (!v || typeof v !== 'object') return [];
    if (Array.isArray(v.names)) return [{ name: 'Looks', values: v.names.map(String), default: v.default == null ? null : String(v.default) }];
    return Object.entries(v)
      .filter(([, x]) => x && typeof x === 'object' && Array.isArray(x.values))
      .map(([k, x]) => ({ name: k, values: x.values.map(String), default: x.default == null ? null : String(x.default) }));
  }

  function contractOf(name) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(String(name))) return null;
    let block = null;
    try {
      const all = JSON.parse(readFileSync(contractsFile(), 'utf8')).component ?? {};
      block = Object.values(all).map((c) => c?.$extensions?.bella).find((b) => b?.name === name) ?? null;
    } catch {}
    const specFile = join(roots.theme, 'specs/components', `${name}.spec.yaml`);
    const specText = existsSync(specFile) ? readFileSync(specFile, 'utf8') : null;
    const spec = specText ? specSummary(specText).doc : null;
    // in sync / behind the code, by the same rule as /drift: the props the spec lists against the props the code exports
    const srcFile = join(roots.parts, 'src/components', name, `${name}.tsx`);
    const code = existsSync(srcFile) ? codeProps(readFileSync(srcFile, 'utf8'), name) : null;
    const sp = specText ? specProps(specText) : [];
    const behind = code ? [...code.filter((p) => !sp.includes(p)).map((p) => `${p}: in the code, not in the spec`), ...sp.filter((p) => !code.includes(p)).map((p) => `${p}: in the spec, not in the code`)] : [];
    const mm = specText ? mismatchOf(specText) : { compared: false, fields: [] };
    const differ = mm.fields.filter((f) => !f.sameValue).length;
    const state = !specText ? 'no-spec' : behind.length ? 'behind' : 'sync';
    const props = (Array.isArray(spec?.props) ? spec.props : []).map((p) => ({
      name: p.name,
      type: pretty(p.type),
      default: p.default == null ? null : String(p.default),
      values: Array.isArray(p.values) ? p.values.map(String) : [],
      required: !!p.required,
      says: sentence(p.doc),
      slot: /ReactNode|ReactElement/.test(String(p.type)),
    }));
    return {
      name,
      found: !!(block || spec),
      contract: block ? { usage: block.usage ?? [], dont: block.dont ?? [], a11y: block.a11y ?? null, states: block.states ?? [], variants: block.variants ?? [] } : null,
      spec: spec ? { path: `specs/components/${name}.spec.yaml`, id: `theme/specs/components/${name}.spec.yaml`, lead: spec.lead?.text ?? null, storybook: spec.links?.storybook ?? null, frame: frame(spec.links?.storybook) } : null,
      props: props.filter((p) => !p.slot),
      slots: props.filter((p) => p.slot),
      variants: variantsOf(spec?.variants),
      states: { contract: [spec?.states?.contract, block?.states].find(Array.isArray) ?? [], css: Array.isArray(spec?.states?.css) ? spec.states.css : [] },
      status: { state, behind, differ, compared: mm.compared },
      measuredAt: specText ? statSync(specFile).mtime.toISOString() : null,
    };
  }

  return { list, read, contract: contractOf, invalidate: () => (cache = null) };
}

/** Express handlers, mounted behind the origin guard in server.js (server/test/system-docs.test.mjs proves the guard and the allow-list). */
export function mountSystemDocs(app, docs) {
  app.get('/system-docs', (_req, res) => res.json(docs.list()));
  app.get('/system-docs/doc', (req, res) => {
    const d = docs.read(req.query.id);
    if (!d) return res.status(404).json({ error: 'not a listed doc' });
    res.json(d);
  });
  app.get('/system-docs/contract/:name', (req, res) => {
    const c = docs.contract(req.params.name);
    if (!c) return res.status(404).json({ error: 'not a part name' });
    res.json(c);
  });
}
