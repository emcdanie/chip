// Tool registry: one list of every tool CHIP can call, whatever kind of
// adapter it comes from (an MCP server or a CLI tool). OBI and the Connectors
// page only ever talk to this file.
//
// Servers come from chip.config.local.json ("servers"; see
// chip.config.example.json). Secrets never sit in that file: write
// "${FIGMA_ACCESS_TOKEN}" and the value comes from server/.env or the shell.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ROOT } from '../lib/config.mjs';
import { logUsage, lastToolUses } from '../lib/usage.mjs';
import { McpServer } from './mcp.js';
import { CliServer } from './cli.js';
import { guard, take } from './guard.js';

// "${NAME}" -> process.env.NAME; "~/" -> the home folder
const fill = (v) =>
  typeof v === 'string'
    ? v.replace(/\$\{(\w+)\}/g, (_, n) => process.env[n] ?? '').replace(/^~\//, `${homedir()}/`)
    : Array.isArray(v)
      ? v.map(fill)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]))
        : v;

function loadConfig() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'chip.config.local.json'), 'utf8'));
    return (cfg.servers ?? []).map(fill);
  } catch {
    return [];
  }
}

// Before a write, what does the thing look like now? A read tool per server,
// used for the preview only.
const BEFORE = {
  'figma-console': (tool) => (/variable/i.test(tool) ? ['figma_get_variables', {}] : null),
};

const live = new Map(); // name -> { adapter, status, error, tools }

function entry(cfg) {
  if (!live.has(cfg.name)) {
    const adapter = cfg.kind === 'cli' ? new CliServer(cfg) : new McpServer(cfg);
    live.set(cfg.name, { adapter, status: 'not tested', error: null, tools: null });
  }
  return live.get(cfg.name);
}

/** Every configured server with its status, for /tools and the Connectors page. */
export function servers() {
  const used = lastToolUses();
  return loadConfig().map((cfg) => {
    const e = cfg.disabled ? null : entry(cfg);
    return {
      name: cfg.name,
      kind: cfg.kind,
      transport: cfg.kind === 'cli' ? 'cli' : cfg.transport,
      where: cfg.url ?? [cfg.command, ...(cfg.args ?? [])].join(' '),
      allow: cfg.allow ?? [],
      note: cfg.note ?? null,
      disabled: Boolean(cfg.disabled),
      status: cfg.disabled ? 'disabled' : e.status,
      error: e?.error ?? null,
      tools: e?.tools ?? null,
      lastUsed: used[cfg.name] ?? null,
    };
  });
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
    e.tools = await e.adapter.listTools();
    e.status = 'connected';
    e.error = null;
  } catch (err) {
    e.status = 'error';
    e.error = err.message;
    await e.adapter.close?.();
  }
  return servers().find((s) => s.name === name);
}

async function run(cfg, toolName, args, purpose) {
  const e = entry(cfg);
  const t0 = Date.now();
  try {
    const text = await e.adapter.call(toolName, args);
    const ms = Date.now() - t0;
    logUsage({ type: 'tool', server: cfg.name, tool: toolName, purpose, ms, ok: true });
    return { ok: true, text, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    logUsage({ type: 'tool', server: cfg.name, tool: toolName, purpose, ms, ok: false, error: err.message.slice(0, 200) });
    return { ok: false, error: err.message, ms };
  }
}

/** Calls one tool through the guard. Returns a result, a refusal, or a pending write. */
export async function call({ server, tool, args = {}, purpose = null }) {
  const cfg = configOf(server);
  const e = entry(cfg);
  if (!e.tools) await test(server);
  const t = e.tools?.find((x) => x.name === tool);
  if (!t) {
    const why = `${server} has no tool called "${tool}"${e.error ? ` (${e.error})` : ''}`;
    logUsage({ type: 'tool', server, tool, purpose, ok: false, refused: why });
    throw new Error(why);
  }
  const reader = BEFORE[server]?.(tool);
  const g = await guard({ serverCfg: cfg, tool: t, args, purpose, readBefore: reader ? () => e.adapter.call(...reader) : null });
  if (g.refused) {
    logUsage({ type: 'tool', server, tool, purpose, ok: false, refused: g.refused });
    return { refused: g.refused };
  }
  if (g.pending) return g;
  return run(cfg, tool, args, purpose);
}

/** Confirm runs a pending write; Cancel drops it. */
export async function confirm(id) {
  const p = take(id);
  if (!p) throw new Error('That change has expired or was already handled. Ask again.');
  return run(configOf(p.server), p.tool, p.args, p.purpose);
}

export function cancel(id) {
  const p = take(id);
  if (p) logUsage({ type: 'tool', server: p.server, tool: p.tool, purpose: p.purpose, ok: false, cancelled: true });
  return { cancelled: Boolean(p) };
}
