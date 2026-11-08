// Tool registry: one list of every tool CHIP can call, whatever kind of
// adapter it comes from (an MCP server or a CLI tool). OBI and the Connectors
// page only ever talk to this file.
//
// Servers come from chip.config.local.json ("servers"; see
// chip.config.example.json). Secrets never sit in that file: write
// "${FIGMA_ACCESS_TOKEN}" and the value comes from server/.env or the shell.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DATA_DIR, ROOT } from '../lib/config.mjs';
import { logUsage, lastToolUses } from '../lib/usage.mjs';
import { McpServer } from './mcp.js';
import { CliServer } from './cli.js';
import { FigmaRestServer } from './figma-rest.js';
import { NotionApiServer } from './notion-api.js';
import { guard, take, writeBlocked } from './guard.js';

// "${NAME}" -> process.env.NAME; "~/" -> the home folder
const fill = (v) =>
  typeof v === 'string'
    ? v.replace(/\$\{(\w+)\}/g, (_, n) => process.env[n] ?? '').replace(/^~\//, `${homedir()}/`)
    : Array.isArray(v)
      ? v.map(fill)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]))
        : v;

// Built in, so it needs no config: Figma read over REST, the path that works
// without the Figma app open. A config entry with the same name replaces it.
const BUILT_IN = [
  {
    name: 'figma-rest',
    kind: 'rest',
    url: 'https://api.figma.com/v1',
    env: { FIGMA_ACCESS_TOKEN: '${FIGMA_ACCESS_TOKEN}', FIGMA_FILE_KEY: '${FIGMA_FILE_KEY}' },
    allow: ['read'],
    note: 'Figma REST API with a personal access token from server/.env. Works without the Figma app open. Read only.',
  },
  // Notion's hosted MCP needs a browser sign-in CHIP can't do; an internal
  // integration token can be read from server/.env like Figma's. The same
  // token npm run sync:notion uses.
  {
    name: 'notion',
    kind: 'notion',
    url: 'https://api.notion.com/v1',
    env: { NOTION_API_TOKEN: '${NOTION_API_TOKEN}' },
    allow: ['read'],
    note: 'Notion API with an internal integration token from server/.env. Reads the pages shared with that integration. Read only.',
  },
];

// what each connector is for, in plain words, for the Connectors page
const ABOUT = {
  figma: { purpose: 'Reads the BELLA library from the Figma desktop app: components, variants, variables.', needs: 'The Figma app open with the file, and Dev Mode MCP on.', group: 'figma', path: 'Desktop app' },
  'figma-console': { purpose: 'Reads and edits Figma through the Desktop Bridge plugin: variables, components, screenshots.', needs: 'The Desktop Bridge plugin running in Figma.', group: 'figma', path: 'Desktop Bridge' },
  'figma-rest': { purpose: 'Reads the BELLA library over the internet, with no Figma app open.', needs: 'A personal access token in server/.env.', group: 'figma', path: 'REST API', optional: true },
  'figma-cli': { purpose: 'A Figma command-line tool. CHIP does not use one yet.', needs: 'A CLI named in chip.config.local.json.', unused: true },
  notion: { purpose: 'Reads your Notion pages shared with CHIP’s integration: notes, decisions, research.', needs: 'An internal integration token in server/.env, and the pages shared with it.' },
  git: { purpose: 'Reads git status and log for this repo. The test that CLI tools work.', needs: 'git on the PATH.' },
  'design-systems': { purpose: 'Searches Southleft’s open design-systems knowledge base for how other systems do it.', needs: 'The internet.' },
};

// a second read after the test, for what the connector can see right now
const PROBE = {
  // tools list without the plugin; the Desktop Bridge is what does the work
  'figma-console': async (a) => {
    const st = JSON.parse(await a.call('figma_get_status', {}));
    const f = st.transport?.websocket?.connectedFile ?? (st.currentFileName ? { fileName: st.currentFileName } : null);
    const others = st.transport?.websocket?.otherInstances?.length ?? 0;
    return f?.fileName && !f.fileName.startsWith('(')
      ? `Desktop Bridge connected to “${f.fileName}”.`
      : `Tools answer, but the Desktop Bridge isn’t connected to this CHIP: open the plugin in Figma${others ? ` (${others} other figma-console instance${others === 1 ? '' : 's'} running; the plugin may be talking to one of those)` : ''}.`;
  },
  figma: async (a) => {
    const xml = await a.call('get_metadata', { nodeId: '0:0' });
    const pages = (xml.match(/<canvas\s/g) ?? []).length;
    const vars = (xml.match(/<variable\s/g) ?? []).length;
    return `Reads the file open in Figma: ${pages} pages, ${vars} variables.`;
  },
};

// connectors turned on from the Connectors page, kept outside her config file
const OVERRIDES = join(DATA_DIR, 'connectors.json');
const overrides = () => {
  try {
    return JSON.parse(readFileSync(OVERRIDES, 'utf8'));
  } catch {
    return { enabled: {} };
  }
};

// Notion's hosted MCP (mcp.notion.com) can't sign in from CHIP: the built-in
// token connector takes its place
const hostedNotion = (c) => /mcp\.notion\.com/.test(c.url ?? '');

function rawConfig() {
  let list = [];
  try {
    list = JSON.parse(readFileSync(join(ROOT, 'chip.config.local.json'), 'utf8')).servers ?? [];
  } catch {}
  list = list.filter((c) => !hostedNotion(c));
  const on = overrides().enabled ?? {};
  return [...list, ...BUILT_IN.filter((b) => !list.some((c) => c.name === b.name))].map((c) => (c.disabled && on[c.name] ? { ...c, disabled: false } : c));
}

/** Turns a connector that is off in the config on (or back off), from the page. */
export function setEnabled(name, enabled) {
  const o = overrides();
  o.enabled = { ...(o.enabled ?? {}), [name]: Boolean(enabled) };
  if (!enabled) delete o.enabled[name];
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OVERRIDES, JSON.stringify(o, null, 2));
  if (!enabled) live.delete(name);
  return servers().find((s) => s.name === name);
}
const loadConfig = () => rawConfig().map(fill);

// any ${NAME} value the config uses, written back as ${NAME} in text we show
function redact(text) {
  if (typeof text !== 'string') return text;
  const names = new Set(JSON.stringify(rawConfig()).match(/\$\{(\w+)\}/g) ?? []);
  let out = text;
  for (const n of names) {
    const v = process.env[n.slice(2, -1)];
    if (v && v.length > 3) out = out.split(v).join(n);
  }
  return out;
}

// Before a write, what does the thing look like now? A read tool per server,
// used for the preview only.
const BEFORE = {
  'figma-console': (tool) => (/variable/i.test(tool) ? ['figma_get_variables', {}] : null),
};

const live = new Map(); // name -> { adapter, status, error, tools }

function entry(cfg) {
  if (!live.has(cfg.name)) {
    const adapter = cfg.kind === 'cli' ? new CliServer(cfg) : cfg.kind === 'rest' ? new FigmaRestServer(cfg) : cfg.kind === 'notion' ? new NotionApiServer(cfg) : new McpServer(cfg);
    live.set(cfg.name, { adapter, status: 'not tested', error: null, tools: null, testedAt: null, detail: null });
  }
  return live.get(cfg.name);
}

/** Closes every server CHIP started. A stdio child left running holds its
 * port after CHIP exits: a Desktop Bridge server took one of the plugin's
 * ten ports each time, until none was free (8 Nov). */
export async function closeAll() {
  await Promise.all([...live.values()].map((e) => e.adapter.close?.().catch(() => {})));
}

/** Every configured server with its status, for /tools and the Connectors page. */
export function servers() {
  const used = lastToolUses();
  const raw = new Map(rawConfig().map((c) => [c.name, c]));
  const list = loadConfig().map((cfg) => {
    const e = cfg.disabled ? null : entry(cfg);
    const r = raw.get(cfg.name) ?? {};
    return {
      name: cfg.name,
      kind: cfg.kind,
      transport: cfg.kind === 'cli' ? 'cli' : ['rest', 'notion'].includes(cfg.kind) ? 'https' : cfg.transport,
      where: r.url ?? [r.command, ...(r.args ?? [])].join(' '), // as written: ${NAME}, never the value
      allow: cfg.allow ?? [],
      note: cfg.note ?? null,
      disabled: Boolean(cfg.disabled),
      status: cfg.disabled ? 'disabled' : e.status,
      error: redact(e?.error ?? null),
      tools: e?.tools ?? null,
      lastUsed: used[cfg.name] ?? null,
      testedAt: e?.testedAt ?? null,
      detail: e?.detail ?? null, // what the test read: a file name, a page count
      about: ABOUT[cfg.name] ?? null,
      // not set up yet (a missing token), rather than broken
      setup: Boolean(e?.status === 'error' && /^Add \w+=/.test(e.error ?? '')),
    };
  });
  const figmaUp = list.some((s) => s.about?.group === 'figma' && s.status === 'connected');
  return list.map((s) => ({
    ...s,
    // the one word for what this connector is doing, for every count and every row
    state: s.disabled ? 'off' : s.setup ? 'not-set-up' : s.status === 'connected' ? 'answering' : s.status === 'error' ? 'not-answering' : 'not-tested',
    // another Figma path answers, so this one waits on nobody
    covered: figmaUp && s.about?.group === 'figma' && s.status !== 'connected',
  }));
}

/** The one count of connectors: the nav, the tab and the filters all read this. */
export function connectorCounts(list = servers()) {
  const n = (state) => list.filter((s) => s.state === state).length;
  const attention = list.filter((s) => (s.state === 'not-answering' || s.state === 'not-set-up') && !s.covered).map((s) => s.name);
  return { total: list.length, answering: n('answering'), notAnswering: n('not-answering'), notSetUp: n('not-set-up'), off: n('off'), notTested: n('not-tested'), attention };
}

/** Figma as one thing: connected when any read path answers. Compare reads over
 * REST or the desktop app only (spec-lint.mjs), never the Desktop Bridge. */
export function figmaSummary(list = servers()) {
  const paths = list.filter((s) => ABOUT[s.name]?.group === 'figma');
  const up = paths.filter((s) => s.status === 'connected');
  return {
    connected: up.length > 0,
    via: up.map((s) => s.name),
    canCompare: up.some((s) => s.name !== 'figma-console'),
    sentence: up.length
      ? `${up.length} of ${paths.length} read paths ${up.length === 1 ? 'answers' : 'answer'}: ${up.map((s) => ABOUT[s.name].path).join(' and ')}.`
      : paths.some((s) => s.status === 'not tested')
        ? 'Not tested yet.'
        : 'No Figma path answers. Open the Figma app with the BELLA library, or add a REST token.',
  };
}

/** Tests every connector that is on, at start and on Refresh. */
export async function testAll() {
  const on = loadConfig().filter((c) => !c.disabled);
  await Promise.all(on.map((c) => test(c.name).catch(() => {})));
  return servers();
}

function configOf(name) {
  const cfg = loadConfig().find((c) => c.name === name);
  if (!cfg) throw new Error(`No server called "${name}" in chip.config.local.json`);
  if (cfg.disabled) throw new Error(`${name} is turned off in chip.config.local.json${cfg.note ? ` (${cfg.note})` : ''}`);
  return cfg;
}

/** Connects and lists tools ("Test" on the Connectors page). */
export async function test(name) {
  const cfg = configOf(name);
  const e = entry(cfg);
  try {
    // allowed: a read, or a write on the allowlist
    e.tools = (await e.adapter.listTools()).map((t) => ({ ...t, allowed: t.kind === 'read' || !writeBlocked(cfg, t.name) }));
    e.status = 'connected';
    e.error = null;
    e.detail = e.adapter.detail ?? null;
    if (PROBE[name]) e.detail = await PROBE[name](e.adapter).catch(() => null);
  } catch (err) {
    e.status = 'error';
    e.error = err.message;
    e.detail = null;
    await e.adapter.close?.();
  }
  e.testedAt = new Date().toISOString();
  return servers().find((s) => s.name === name);
}

async function run(cfg, toolName, args, purpose) {
  const e = entry(cfg);
  const t0 = Date.now();
  try {
    const text = redact(await e.adapter.call(toolName, args));
    const ms = Date.now() - t0;
    logUsage({ type: 'tool', route: 'tool', server: cfg.name, tool: toolName, purpose, ms, ok: true });
    return { ok: true, text, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    const error = redact(err.message);
    logUsage({ type: 'tool', route: 'tool', server: cfg.name, tool: toolName, purpose, ms, ok: false, error: error.slice(0, 200) });
    return { ok: false, error, ms };
  }
}

/** Calls one tool through the guard. Returns a result, a refusal, or a pending write. */
export async function call({ server, tool, args = {}, purpose = null, session = null }) {
  const cfg = configOf(server);
  const e = entry(cfg);
  if (!e.tools || !e.adapter.client && cfg.kind === 'mcp') await test(server); // a closed client reconnects
  const t = e.tools?.find((x) => x.name === tool);
  if (!t) {
    const why = `${server} has no tool called "${tool}"${e.error ? ` (${e.error})` : ''}`;
    logUsage({ type: 'tool', route: 'tool', server, tool, purpose, ok: false, refused: why });
    throw new Error(why);
  }
  const reader = BEFORE[server]?.(tool);
  const g = await guard({ serverCfg: cfg, tool: t, args, purpose, readBefore: reader ? async () => redact(await e.adapter.call(...reader)) : null, session });
  if (g.refused) {
    logUsage({ type: 'tool', route: 'tool', server, tool, purpose, ok: false, refused: g.refused });
    return { refused: g.refused };
  }
  if (g.pending) return g;
  return run(cfg, tool, args, purpose);
}

/** Confirm runs a pending write; Cancel drops it. */
export async function confirm(id, session) {
  const p = take(id, session);
  if (!p) throw new Error('That change has expired or was already handled. Ask again.');
  const cfg = configOf(p.server);
  const why = writeBlocked(cfg, p.tool);
  if (why) throw new Error(`${why}; nothing ran.`);
  return run(cfg, p.tool, p.args, p.purpose);
}

export function cancel(id, session) {
  const p = take(id, session);
  if (p) logUsage({ type: 'tool', route: 'tool', server: p.server, tool: p.tool, purpose: p.purpose, ok: false, cancelled: true });
  return { cancelled: Boolean(p) };
}
