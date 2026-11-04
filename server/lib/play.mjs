// The Playground (docs/plans/playground.md): a real page of any project, live,
// with a markup layer and BELLA's rules run against it.
// - A proxy on its own port serves the chosen project's dev server (the site's
//   Next server, BELLA's Storybook, CHIP itself) and adds one probe script to
//   each HTML page, so the page can postMessage its measurements to CHIP (the
//   iframe is cross-origin; this is the only way in). One target at a time:
//   asking for a project's map points the proxy at it. Bound to 127.0.0.1,
//   read-only: it never writes to the project.
// - The page's source is mapped to BELLA by how the project is built: a Next
//   page's JSX sections joined to the DOM by id, against BELLA's catalogue and
//   the sync manifest; a CHIP page's component and what it imports; a BELLA
//   docs page is BELLA's own component.
// - A brief (notes, picked elements, placed BELLA components, findings) is
//   written to data/playground/briefs/ for Claude in the project's terminal;
//   with dry it only returns the text, for the preview. CHIP never edits it.
import http from 'node:http';
import net from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BELLA_DIR, DATA_DIR, PORT } from './config.mjs';
import { bellaOf, pagesOf, projectOf, runState } from './projects.mjs';

export const PLAY_PORT = Number(process.env.CHIP_PLAY_PORT || PORT + 1);
export const PROXY = `http://127.0.0.1:${PLAY_PORT}`;
const BRIEFS = join(DATA_DIR, 'playground', 'briefs');
const PROBE = readFileSync(new URL('./play-probe.js', import.meta.url), 'utf8');

// the dev server the proxy serves: set by playTarget, one project at a time
let target = null;
export async function playTarget(id) {
  const p = projectOf(id);
  if (!p) return null;
  const run = await runState(p);
  if (run.url) target = new URL(run.url);
  return { project: p.id, name: p.name, url: run.url ?? null, state: run.state, command: run.command ?? null, proxy: PROXY };
}

/* ---------- the proxy ---------- */
export function startPlayProxy(appOrigins) {
  const probe = PROBE.replace('__CHIP_ORIGINS__', JSON.stringify(appOrigins));
  const server = http.createServer((req, res) => {
    if (req.url === '/__chip/probe.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      return res.end(probe);
    }
    if (!target) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      return res.end('Pick a project in the Playground first.');
    }
    const t = target;
    const headers = { ...req.headers, host: t.host, 'accept-encoding': 'identity' };
    delete headers.origin;
    delete headers.referer;
    const up = http.request({ host: t.hostname, port: t.port, path: req.url, method: req.method, headers }, (r) => {
      const type = r.headers['content-type'] || '';
      const h = { ...r.headers };
      // the page must be framable by CHIP
      delete h['x-frame-options'];
      delete h['content-security-policy'];
      if (!type.includes('text/html')) {
        res.writeHead(r.statusCode, h);
        return r.pipe(res);
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        const tag = '<script src="/__chip/probe.js" defer></script>';
        html = html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html;
        delete h['content-length'];
        delete h['transfer-encoding'];
        res.writeHead(r.statusCode, h);
        res.end(html);
      });
    });
    up.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Nothing is running at ${t.origin}.`);
    });
    req.pipe(up);
  });
  // hot reload: pipe the dev server's websocket straight through
  server.on('upgrade', (req, socket, head) => {
    if (!target) return socket.destroy();
    const t = target;
    const up = net.connect(Number(t.port) || 80, t.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries({ ...req.headers, host: t.host })) if (k !== 'origin') lines.push(`${k}: ${v}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  server.on('error', (e) => console.warn(`[CHIP] Playground proxy not started on ${PLAY_PORT}: ${e.code}`));
  server.listen(PLAY_PORT, '127.0.0.1', () => console.log(`[CHIP] Playground proxy at ${PROXY}`));
  return server;
}

/* ---------- which pages can be loaded ---------- */
// the project's pages, as /projects reads them; a dynamic template can't be loaded
export function playPages(id) {
  const p = projectOf(id);
  return p ? pagesOf(p).filter((x) => !x.dynamic) : [];
}

/* ---------- the source map ---------- */
// BELLA's catalogue: component names from its contracts (tokens/component.json)
function bellaCatalogue() {
  const pascal = (k) => k.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const json = JSON.parse(readFileSync(join(BELLA_DIR, 'tokens', 'component.json'), 'utf8'));
  return new Map(Object.entries(json.component).map(([k, v]) => [pascal(k), v.$extensions?.bella ?? {}]));
}

// files a project vendors from BELLA unedited (lib/bella/sync-manifest.json)
function syncedFiles(dir) {
  const f = join(dir, 'lib', 'bella', 'sync-manifest.json');
  return existsSync(f) ? Object.keys(JSON.parse(readFileSync(f, 'utf8')).files ?? {}) : [];
}

const IMPORT = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
function importsOf(src) {
  const out = new Map(); // local name → module path
  for (const m of src.matchAll(IMPORT)) {
    if (m[1]) out.set(m[1], m[3]);
    for (const n of (m[2] ?? '').split(',')) {
      const name = n.trim().split(/\s+as\s+/).pop();
      if (name && /^[A-Z]/.test(name)) out.set(name, m[3]);
    }
  }
  return out;
}

// the JSX tags a file draws, in order (for a page without section ids)
const tagsOf = (src) => [...new Set([...src.matchAll(/<([A-Z]\w*)\b(?!\.)/g)].map((m) => m[1]))].filter((n) => n !== 'React');

/** A Next page: its sections (JSX elements with an id), each component classed against BELLA. */
function nextMap(p, page) {
  const dir = p.src;
  const short = p.short;
  const fileOf = (mod) => {
    if (!mod.startsWith('@/')) return null;
    const base = join(dir, mod.slice(2));
    return ['.tsx', '.ts', '/index.tsx'].map((x) => base + x).find(existsSync) ?? null;
  };
  const cat = bellaCatalogue();
  const synced = syncedFiles(dir);
  const classify = (name, mod) => {
    const file = fileOf(mod);
    const rel = file ? relative(dir, file) : mod;
    if (synced.includes(rel)) return { name, file: rel, kind: 'bella', note: 'Synced from BELLA, unedited', source: 'lib/bella/sync-manifest.json' };
    // the project's own parts it is built from that carry a BELLA name (not next/link and the like)
    const uses = file ? [...importsOf(readFileSync(file, 'utf8'))].filter(([n, m]) => m.startsWith('@/') && cat.has(n)).map(([n]) => n) : [];
    if (cat.has(name)) return { name, file: rel, kind: 'copy', note: `${short}’s own ${name}, not synced from BELLA`, source: 'lib/bella/sync-manifest.json', uses };
    return { name, file: rel, kind: 'site', note: uses.length ? `${short} only, built from ${short}’s ${uses.join(', ')}` : `${short} only, no BELLA-named parts`, source: 'tokens/component.json', uses };
  };
  const src = readFileSync(join(dir, page.file), 'utf8');
  const imports = importsOf(src);
  const body = src.slice(src.indexOf('export default'));
  const tags = [...body.matchAll(/<(\/?)([A-Z]\w*)\b([^>]*?)(\/?)>/g)];
  const sections = [];
  const stack = [];
  for (const [, close, name, attrs, self] of tags) {
    if (close) {
      const i = stack.map((s) => s.name).lastIndexOf(name);
      if (i >= 0) stack.length = i;
      continue;
    }
    const id = attrs.match(/\bid="([\w-]+)"/)?.[1];
    const open = stack.find((s) => s.section);
    if (id && !open) {
      const s = { id, component: name, children: [], section: true, name };
      sections.push(s);
      if (!self) stack.push(s);
      continue;
    }
    if (open && !open.children.includes(name)) open.children.push(name);
    if (!self) stack.push({ name });
  }
  const names = new Set(sections.flatMap((s) => [s.component, ...s.children]));
  const components = Object.fromEntries([...names].filter((n) => imports.has(n)).map((n) => [n, classify(n, imports.get(n))]));
  return {
    sections: sections.map(({ id, component, children }) => ({ id, component, children: children.filter((c) => components[c]) })),
    components,
    how: 'Each section from the page’s source, matched to the page by its id.',
  };
}

/** A CHIP page: the component App.jsx renders for the route, in <main id="main">, and the parts it imports. */
function hashMap(p, page) {
  const app = readFileSync(join(p.src, page.file), 'utf8');
  const ws = page.route.replace(/^#\//, '');
  const comp = app.match(new RegExp(`ws === '${ws}' \\? <(\\w+)`))?.[1];
  const mod = comp && importsOf(app).get(comp);
  const file = mod?.startsWith('./') ? join(p.src, 'app/src', mod.slice(2)) : null;
  if (!file || !existsSync(file)) return { sections: [], components: {}, unmapped: `CHIP’s ${page.label} page has no component of its own in ${page.file}, so there is nothing to map.` };
  const src = readFileSync(file, 'utf8');
  const imports = importsOf(src);
  const cat = bellaCatalogue();
  const used = tagsOf(src).filter((n) => imports.has(n));
  const classify = (name) => {
    const m = imports.get(name);
    if (m.startsWith('@bella/components/')) return { name, file: m, kind: 'bella', note: 'BELLA’s own, read in place from its checkout', source: 'app/vite.config.js' };
    const rel = m.startsWith('./') ? join('app/src', m.slice(2)) : m;
    if (cat.has(name)) return { name, file: rel, kind: 'copy', note: `CHIP’s own ${name}, not BELLA’s`, source: 'tokens/component.json' };
    return { name, file: rel, kind: 'site', note: 'CHIP only, not in BELLA’s catalogue', source: 'tokens/component.json' };
  };
  const components = Object.fromEntries([comp, ...used].filter((n) => n === comp || imports.has(n)).map((n) => [n, n === comp ? { name: n, file: relative(p.src, file), kind: 'site', note: `The ${page.label} page`, source: page.file } : classify(n)]));
  return {
    sections: [{ id: 'main', component: comp, children: used }],
    components,
    file: relative(p.src, file),
    how: `The page is one section, <main id="main">: ${comp} and the parts it imports. CHIP’s pages have no section ids of their own yet.`,
  };
}

/** A BELLA docs page: BELLA's own component, in Storybook's docs root. */
function storyMap(p, page) {
  const name = page.component;
  const own = { name, file: page.file, kind: 'bella', note: 'BELLA’s own component: this is its docs page', source: page.file };
  return {
    sections: [{ id: 'storybook-docs', component: name, children: [] }],
    components: { [name]: own },
    how: 'The docs page is one section, Storybook’s #storybook-docs. Changes go to BELLA itself.',
  };
}

/** The page's map, for any project. */
export function playMap(id, route) {
  const p = projectOf(id);
  if (!p) return null;
  const page = pagesOf(p).find((x) => x.route === route && !x.dynamic);
  if (!page) return null;
  const kind = p.pages?.kind;
  const m = kind === 'next' ? nextMap(p, page) : kind === 'hash' ? hashMap(p, page) : kind === 'storybook' ? storyMap(p, page) : { sections: [], components: {}, unmapped: `CHIP can’t map ${p.name}’s pages yet.` };
  const bella = bellaOf(p);
  return {
    project: p.id,
    name: p.name,
    short: p.short,
    repo: p.src,
    terminal: p.id,
    route,
    label: page.label,
    file: m.file ?? page.file,
    proxy: PROXY,
    bella: { kind: bella.kind, label: bella.label },
    // how a BELLA part reaches this project, for the findings and the brief
    getBella: bella.kind === 'synced' ? `through ${p.short}’s sync-bella.mjs` : bella.kind === 'in-place' ? 'by importing it from @bella/components' : bella.kind === 'self' ? 'in BELLA itself' : 'from BELLA',
    ...m,
    // what the brief and the findings may cite
    agents: join(BELLA_DIR, 'AGENTS.md'),
  };
}

/* ---------- the brief ---------- */
const px = (n) => Math.round(n);
const box = (b) => `${px(b.x)},${px(b.y)} ${px(b.w)}×${px(b.h)}`;

export function saveBrief({ project = 'site', route, width, notes = [], proposals = [], findings = [], dry = false, scope = 'all' }) {
  const map = playMap(project, route);
  if (!map) throw new Error(`No page at ${route} in ${project}`);
  const line = (fs) => (fs.length ? fs.map((f) => `- ${f.section ? `\`#${f.section}\` · ` : ''}**${f.rule}** (${f.source}): ${f.detail}. Instead: ${f.instead}`) : ['None.']);
  const one = scope === 'note';
  const lines = [
    `# Playground brief: ${map.name}, ${map.label === route ? route : `${map.label} (\`${route}\`)`}${one ? ' (one note)' : ''}`,
    '',
    `Marked up in CHIP's Playground at ${width}px wide, ${new Date().toDateString()}. Source: \`${map.file}\` in the ${map.name} repo (\`${map.repo}\`). Boxes are in page px, from the top of the page.`,
    '',
    '## How to work',
    '',
    "Follow this repo's CLAUDE.md: branch as it says, plan first, stop for Elleta's go, then a PR she approves with `OK #n`.",
    "Use BELLA's AGENTS.md rules. Don't change anything that isn't asked for below.",
    '',
    one ? '## The note' : '## Her notes',
    '',
    ...(notes.length
      ? notes.flatMap((n, i) => [
          `${i + 1}. **${n.text || '(no note)'}**`,
          `   - Pinned to \`#${n.section ?? '?'}\`${n.component ? ` (${n.component}${n.kind ? `, ${n.kind}` : ''})` : ''}, box ${box(n)}`,
          ...(n.picked ?? []).slice(0, 4).map((p) => `   - \`${p.selector}\`${p.text ? `: "${p.text}"` : ''}`),
          ...(n.suggest ? [`   - CHIP suggests: ${n.suggest.change}. Why: ${n.suggest.why}`] : []),
        ])
      : ['None.']),
    '',
    ...(proposals.length
      ? [
          '## BELLA components she placed',
          '',
          `Each is a proposal drawn on the page: build it with the BELLA component named, ${map.getBella}, the way the page's other BELLA parts arrive. Match the box as closely as the layout allows.`,
          '',
          ...proposals.flatMap((p, i) => [
            `${i + 1}. **${p.component}**${p.variant ? ` (variant="${p.variant}")` : ''} at ${box(p)}${p.section ? `, in \`#${p.section}\`` : ''}. ${p.replaces ? `It replaces \`#${p.replaces}\`: remove that section's current content.` : 'It is added; nothing it covers is removed.'}`,
            ...(p.note ? [`   - Her note: ${p.note}`] : []),
          ]),
          '',
        ]
      : []),
    ...(one
      ? ["## BELLA's rules where the note sits", '', ...line(findings), '']
      : [
          "## BELLA's rules this page breaks (measured in the browser, with her placements)",
          '',
          ...line(findings.filter((f) => f.tone === 'fail')),
          '',
          "## Parts that aren't BELLA's",
          '',
          ...line(findings.filter((f) => f.tone !== 'fail')),
          '',
          '## Sections and components',
          '',
          ...map.sections.map((s) => `- \`#${s.id}\` · ${[s.component, ...s.children].map((c) => `${c} (${map.components[c]?.note ?? 'not imported'})`).join(', ')}`),
          '',
        ]),
  ];
  const text = lines.join('\n');
  if (dry) return { text };
  mkdirSync(BRIEFS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(BRIEFS, `${stamp}-${map.project}${route.replace(/\W+/g, '-').slice(0, 60)}.md`);
  writeFileSync(file, text);
  return { file, rel: relative(join(DATA_DIR, '..'), file) };
}
