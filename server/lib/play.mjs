// The Playground (docs/plans/playground.md): a real site page, live, with a
// markup layer and BELLA's rules run against it.
// - A proxy on its own port serves the site's dev server and adds one probe
//   script to each HTML page, so the page can postMessage its measurements to
//   CHIP (the iframe is cross-origin; this is the only way in). Bound to
//   127.0.0.1, read-only: it never writes to the site.
// - The page's source is parsed (imports + JSX tags, not a full TS parse) into
//   sections joined to the DOM by id, and each component is classed against
//   BELLA's catalogue and the site's sync manifest.
// - A brief (notes, picked elements, findings) is written to
//   data/playground/briefs/ for Claude in the terminal. CHIP never edits the site.
import http from 'node:http';
import net from 'node:net';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { BELLA_DIR, DATA_DIR, PORT } from './config.mjs';

const env = process.env;
export const SITE_URL = (env.CHIP_PLAY_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
export const SITE_DIR = env.CHIP_PLAY_SITE_DIR || join(homedir(), 'DEV', 'ctrl-alt-design');
export const PLAY_PORT = Number(env.CHIP_PLAY_PORT || PORT + 1);
const BRIEFS = join(DATA_DIR, 'playground', 'briefs');
const PROBE = readFileSync(new URL('./play-probe.js', import.meta.url), 'utf8');

/* ---------- the proxy ---------- */
export function startPlayProxy(appOrigins) {
  const target = new URL(SITE_URL);
  const probe = PROBE.replace('__CHIP_ORIGINS__', JSON.stringify(appOrigins));
  const server = http.createServer((req, res) => {
    if (req.url === '/__chip/probe.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      return res.end(probe);
    }
    const headers = { ...req.headers, host: target.host, 'accept-encoding': 'identity' };
    delete headers.origin;
    delete headers.referer;
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (r) => {
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
      res.end(`The site isn't running at ${SITE_URL}.`);
    });
    req.pipe(up);
  });
  // hot reload: pipe the dev server's websocket straight through
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(Number(target.port), target.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries({ ...req.headers, host: target.host })) if (k !== 'origin') lines.push(`${k}: ${v}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  server.on('error', (e) => console.warn(`[CHIP] Playground proxy not started on ${PLAY_PORT}: ${e.code}`));
  server.listen(PLAY_PORT, '127.0.0.1', () => console.log(`[CHIP] Playground: ${SITE_URL} at http://127.0.0.1:${PLAY_PORT}`));
  return server;
}

/* ---------- which pages can be loaded ---------- */
export function playPages() {
  const app = join(SITE_DIR, 'app');
  if (!existsSync(app)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!/^[[(_@]/.test(e.name)) walk(join(dir, e.name));
      } else if (e.name === 'page.tsx') {
        const route = '/' + relative(app, dir).split('/').filter(Boolean).join('/');
        out.push({ route, file: relative(SITE_DIR, join(dir, e.name)) });
      }
    }
  };
  walk(app);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/* ---------- the source map ---------- */
// BELLA's catalogue: component names from its contracts (tokens/component.json)
function bellaCatalogue() {
  const pascal = (k) => k.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const json = JSON.parse(readFileSync(join(BELLA_DIR, 'tokens', 'component.json'), 'utf8'));
  return new Map(Object.entries(json.component).map(([k, v]) => [pascal(k), v.$extensions?.bella ?? {}]));
}

// files the site vendors from BELLA unedited (lib/bella/sync-manifest.json)
function syncedFiles() {
  const f = join(SITE_DIR, 'lib', 'bella', 'sync-manifest.json');
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

const fileOf = (mod) => {
  if (!mod.startsWith('@/')) return null;
  const base = join(SITE_DIR, mod.slice(2));
  return ['.tsx', '.ts', '/index.tsx'].map((x) => base + x).find(existsSync) ?? null;
};

/** How one site component stands against BELLA. */
function classify(name, mod, cat, synced) {
  const file = fileOf(mod);
  const rel = file ? relative(SITE_DIR, file) : mod;
  if (synced.includes(rel)) return { name, file: rel, kind: 'bella', note: 'Synced from BELLA, unedited', source: 'lib/bella/sync-manifest.json' };
  // the site's own parts it is built from that carry a BELLA name (not next/link and the like)
  const uses = file ? [...importsOf(readFileSync(file, 'utf8'))].filter(([n, m]) => m.startsWith('@/') && cat.has(n)).map(([n]) => n) : [];
  if (cat.has(name)) return { name, file: rel, kind: 'copy', note: `The site's own ${name}, not synced from BELLA`, source: 'lib/bella/sync-manifest.json', uses };
  return { name, file: rel, kind: 'site', note: uses.length ? `Site only, built from the site's ${uses.join(', ')}` : 'Site only, no BELLA-named parts', source: 'tokens/component.json', uses };
}

/** The page's sections: each JSX element with an id, its component and the components inside it. */
export function playMap(route) {
  const page = playPages().find((p) => p.route === route);
  if (!page) return null;
  const src = readFileSync(join(SITE_DIR, page.file), 'utf8');
  const imports = importsOf(src);
  const cat = bellaCatalogue();
  const synced = syncedFiles();
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
  const components = Object.fromEntries([...names].filter((n) => imports.has(n)).map((n) => [n, classify(n, imports.get(n), cat, synced)]));
  return {
    route,
    file: page.file,
    site: SITE_URL,
    proxy: `http://127.0.0.1:${PLAY_PORT}`,
    sections: sections.map(({ id, component, children }) => ({ id, component, children: children.filter((c) => components[c]) })),
    components,
    // what the brief and the findings may cite
    agents: join(BELLA_DIR, 'AGENTS.md'),
  };
}

/* ---------- the brief ---------- */
export function saveBrief({ route, width, notes = [], findings = [] }) {
  const map = playMap(route);
  if (!map) throw new Error(`No page at ${route}`);
  mkdirSync(BRIEFS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(BRIEFS, `${stamp}${route.replace(/\W+/g, '-')}.md`);
  const line = (fs) => (fs.length ? fs.map((f) => `- ${f.section ? `\`#${f.section}\` · ` : ''}**${f.rule}** (${f.source}): ${f.detail}. Instead: ${f.instead}`) : ['None.']);
  const lines = [
    `# Playground brief: ${route}`,
    '',
    `Marked up in CHIP's Playground at ${width}px wide, ${new Date().toDateString()}. Source: \`${map.file}\` in the site repo.`,
    '',
    '## How to work',
    '',
    "Follow this repo's CLAUDE.md: branch as it says, plan first, stop for Elleta's go, then a PR she approves with `OK #n`.",
    "Use BELLA's AGENTS.md rules. Don't change anything that isn't asked for below.",
    '',
    '## Her notes',
    '',
    ...(notes.length
      ? notes.flatMap((n, i) => [
          `${i + 1}. **${n.text || '(no note)'}**`,
          `   - Section \`#${n.section ?? '?'}\`${n.component ? ` (${n.component})` : ''}, box ${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.w)}×${Math.round(n.h)} in page px`,
          ...(n.picked ?? []).slice(0, 4).map((p) => `   - \`${p.selector}\`${p.text ? `: "${p.text}"` : ''}`),
        ])
      : ['None.']),
    '',
    "## BELLA's rules this page breaks (measured in the browser)",
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
  ];
  writeFileSync(file, lines.join('\n'));
  return { file, rel: relative(join(DATA_DIR, '..'), file) };
}
