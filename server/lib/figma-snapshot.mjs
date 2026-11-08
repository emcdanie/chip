// Figma matches the code (plan: docs/plans/figma-bridge.md, 8 Nov).
//
// One snapshot, many readers: this check reads BellaComponents and Foundations
// once and writes data/checks/figma.json. Today, Coverage, Drift, Components,
// Foundations and the component pages read that file; none of them call Figma.
//
// Read paths, in order: the REST API when it has a token (components only;
// Figma's REST variables need an Enterprise plan), then the Desktop Bridge,
// pinned to each file by key (fixed-reads.js). A REST failure falls through to
// the Bridge. The desktop Figma MCP is never used here: it reads whatever
// file is open.
//
// What "match" means is said in the snapshot: components by set name, then
// each variant property's values against the contract's variants, shapes and
// states; variables by name in the semantic collection against BELLA's
// semantic colour roles. Values per mode are not compared yet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';
import { BELLA } from './bella-work.mjs';
import * as host from '../host/registry.js';
import { FIXED_SCRIPTS, allowedFiles } from '../host/fixed-reads.js';

export const STALE_DAYS = 7;
// suggested only: a pair counts once Elleta confirms it (data stays honest until then)
const MAYBE_SAME = { Columns: 'Grid', SidebarLayout: 'Sidebar' };
// sets in Figma that hold a component's per-item states: their axes count as the component's
const PARTS = { Tabs: ['Tab'], SegmentedControl: ['Segment'], NavList: ['Nav item'], ScoreStrip: ['Score cell'], ChatThread: ['ChatThreadTimestamp', 'ChatThreadDelivered'] };

/* ---------- reading ---------- */
// a Bridge error can name other open files (client files among them): never keep its text
function why(e) {
  if (e?.reason) return e.reason;
  const m = String(e?.message ?? e ?? '');
  if (/not connected|no .*plugin|not found among connected|no connected/i.test(m)) return 'not-open';
  if (/ECONNREFUSED|closed|timed? ?out|no answer|websocket/i.test(m)) return 'no-bridge';
  return 'error';
}
const SAY = {
  'not-open': (file) => `${file} isn’t open with the Desktop Bridge. Open the plugin in that file, then run this check again.`,
  'no-bridge': () => 'The Desktop Bridge isn’t answering CHIP. It may be connected to another session; close that session’s Figma tools, or open the plugin again.',
  'no-port': () => 'Every Desktop Bridge port (9223–9232) is taken by other Claude sessions, so CHIP can’t open one. Close a session’s Figma tools, then run this check again.',
  'no-key': (file) => `No file key for ${file} in server/.env.`,
  error: (file) => `Figma didn’t answer for ${file}.`,
};

// The plugin finds a new Bridge server within seconds, so a server CHIP has
// just started waits for it. The status is read for counts only, never file
// names (a client file can be connected too). A file's key in the status can
// differ from the key in its link (seen for BellaComponents, 8 Nov), so
// readiness is "any file connected", then the pinned read is tried until the
// deadline.
const WAIT_MS = 40000;
async function bridgeState() {
  const r = await host.call({ server: 'figma-console', tool: 'figma_get_status', args: {}, purpose: 'Figma check: is the Bridge connected' });
  if (!r?.ok) return 'no-bridge';
  const w = JSON.parse(r.text ?? '{}').transport?.websocket ?? {};
  if (!w.port || w.available === false) return 'no-port';
  return Array.isArray(w.connectedFiles) && w.connectedFiles.length ? 'ready' : 'waiting';
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function bridge(kind, fileKey) {
  const end = Date.now() + WAIT_MS;
  // a server that has just started may not have bound its port or met the plugin yet
  let s = await bridgeState();
  while ((s === 'waiting' || s === 'no-port') && Date.now() < end) {
    await pause(1500);
    s = await bridgeState();
  }
  if (s !== 'ready') throw Object.assign(new Error(s), { reason: s === 'waiting' ? 'not-open' : s });
  for (;;) {
    const r = await host.call({ server: 'figma-console', tool: 'figma_execute', args: { code: FIXED_SCRIPTS[kind], fileKey, timeout: 30000 }, purpose: `Figma check: ${kind}` });
    if (r?.pending || r?.refused) throw new Error('needed a Confirm: not a fixed read');
    let body = null;
    try {
      body = r?.ok ? JSON.parse(r.text) : null;
    } catch {
      body = null;
    }
    if (body?.success !== false && body?.result) return body.result;
    const reason = why(new Error(body?.error ?? r?.error ?? 'no answer'));
    // this file's plugin may still be finding the server: try again until the deadline
    if (reason === 'not-open' && Date.now() < end) {
      await pause(2500);
      continue;
    }
    throw Object.assign(new Error(reason), { reason });
  }
}

function restUsable() {
  const s = host.servers().find((x) => x.name === 'figma-rest');
  return Boolean(s && !s.disabled && !s.setup);
}
async function restComponents() {
  const r = await host.call({ server: 'figma-rest', tool: 'get_file', purpose: 'Figma check: components' });
  if (!r?.ok) throw new Error(r?.error ?? 'no answer');
  const doc = JSON.parse(r.text).document;
  const comps = [];
  for (const page of doc.children ?? []) {
    if (/archive|changelog/i.test(page.name)) continue;
    const stack = [...(page.children ?? [])];
    while (stack.length) {
      const n = stack.shift();
      if (n.type === 'COMPONENT_SET') comps.push({ page: page.name, name: n.name, id: n.id, type: n.type, variants: (n.children ?? []).map((k) => k.name), props: Object.keys(n.componentPropertyDefinitions ?? {}).map((k) => k.split('#')[0]) });
      else if (n.type === 'COMPONENT') comps.push({ page: page.name, name: n.name, id: n.id, type: n.type, variants: [], props: [] });
      else stack.push(...(n.children ?? []));
    }
  }
  return { file: JSON.parse(r.text).name, comps };
}

/** Reads one part; returns { data, via } or { error: reason }. */
async function read(kind) {
  const key = allowedFiles()[kind];
  const label = kind === 'components' ? 'BellaComponents' : 'Foundations';
  if (kind === 'components' && restUsable()) {
    try {
      return { data: await restComponents(), via: 'REST API' };
    } catch {
      /* a timeout, rate limit or rejected token falls through to the Bridge */
    }
  }
  if (!key) return { error: SAY['no-key'](label) };
  try {
    return { data: await bridge(kind, key), via: 'Desktop Bridge' };
  } catch (e) {
    return { error: SAY[why(e)](label) };
  }
}

/* ---------- comparing ---------- */
function codeSide() {
  const b = JSON.parse(readFileSync(join(DATA_DIR, 'bella.json'), 'utf8'));
  let colourVars = null;
  try {
    colourVars = new Set([...readFileSync(join(BELLA, 'tokens', 'bella.css'), 'utf8').matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]));
  } catch {
    colourVars = null;
  }
  const roles = Object.keys(b.palette ?? {}).filter((k) => k.startsWith('--color-semantic-')).map((k) => k.slice('--color-semantic-'.length));
  return { components: b.components ?? [], roles, colourVars };
}

// "variant=primary, shape=pill, state=hover" -> { variant: Set, shape: Set, state: Set }
function axesOf(variantNames) {
  const axes = {};
  for (const name of variantNames) {
    for (const part of name.split(',')) {
      const [k, v] = part.split('=').map((x) => x?.trim());
      if (!k || v === undefined) continue;
      (axes[k] ??= new Set()).add(v);
    }
  }
  return axes;
}
const CODE_AXES = { variant: 'variants', shape: 'shapes', state: 'states' };

export function compareComponents(code, figma) {
  const byName = new Map(figma.comps.map((c) => [c.name, c]));
  const codeNames = new Set(code.map((c) => c.name));
  const rows = code.map((c) => {
    const f = byName.get(c.name);
    if (!f) return { name: c.name, inFigma: false, maybe: MAYBE_SAME[c.name] && byName.has(MAYBE_SAME[c.name]) ? MAYBE_SAME[c.name] : null };
    const axes = axesOf([...f.variants, ...(PARTS[c.name] ?? []).flatMap((p) => byName.get(p)?.variants ?? [])]);
    const diffs = [];
    // a lone component can't carry the contract's variants: its axes all show as missing
    const needsSet = Object.values(CODE_AXES).some((field) => (c[field] ?? []).filter(Boolean).length > 1);
    if (f.type !== 'COMPONENT_SET' && needsSet && !PARTS[c.name]) diffs.push({ axis: 'set', codeOnly: [], figmaOnly: [], note: 'a single component, not a component set' });
    for (const [axis, field] of Object.entries(CODE_AXES)) {
      const want = (c[field] ?? []).filter(Boolean);
      if (!want.length) continue;
      // the contract files values under variants, shapes and states, but the
      // component's own prop can be named otherwise (Heading's tier): use the
      // Figma axis of the same name, else the one that holds those values
      const name = axes[axis] ? axis : Object.keys(axes).find((k) => !Object.values(CODE_AXES).includes(k) && !Object.keys(CODE_AXES).includes(k) && want.every((v) => axes[k].has(v)));
      if (!name) {
        // one value (a lone "default") needs no axis; more than one does
        if (want.length > 1) diffs.push({ axis, codeOnly: want, figmaOnly: [], note: `Figma has no ${axis} property` });
        continue;
      }
      const have = [...axes[name]];
      const codeOnly = want.filter((v) => !axes[name].has(v));
      const figmaOnly = have.filter((v) => !want.includes(v));
      if (codeOnly.length || figmaOnly.length) diffs.push({ axis: name, codeOnly, figmaOnly });
    }
    return { name: c.name, inFigma: true, id: f.id, page: f.page, variants: f.variants.length, axes: Object.fromEntries(Object.entries(axes).map(([k, s]) => [k, [...s]])), diffs };
  });
  const figmaOnly = figma.comps.filter((f) => !codeNames.has(f.name) && f.type === 'COMPONENT_SET').map((f) => f.name);
  const matched = rows.filter((r) => r.inFigma).length;
  return { total: code.length, matched, inStep: rows.filter((r) => r.inFigma && !r.diffs.length).length, rows, figmaOnly, compared: 'set name, then each variant property’s values against the contract’s variants, shapes and states' };
}

// Figma "color/semantic/surface" is CSS "--color-semantic-surface"; only colour
// variables are compared (the semantic collection also holds blur/surface).
const cssName = (figmaName) => `--${figmaName.replace(/\//g, '-')}`;
export function compareVariables(roles, figma, codeVars = null) {
  const sem = figma.collections.find((c) => /semantic/i.test(c.name));
  if (!sem) return { error: 'Foundations has no semantic collection.' };
  const colours = sem.names.map((n) => (typeof n === 'string' ? { name: n, type: 'COLOR' } : n)).filter((n) => n.type === 'COLOR').map((n) => n.name);
  const css = colours.map(cssName);
  const counts = css.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map());
  const have = new Set(css);
  const codeOnly = roles.filter((r) => !have.has(`--color-semantic-${r}`));
  // a Figma colour the code has under any --color- name is not Figma-only (accent-ink)
  const known = codeVars ?? new Set(roles.map((r) => `--color-semantic-${r}`));
  return {
    collection: sem.name,
    modes: sem.modes,
    total: roles.length,
    matched: roles.length - codeOnly.length,
    codeOnly,
    figmaOnly: [...have].filter((n) => !known.has(n)).map((n) => n.replace(/^--/, '')),
    twice: [...counts].filter(([, k]) => k > 1).map(([n]) => n.replace(/^--/, '')),
    compared: 'colour variables in the semantic collection, by full name, against BELLA’s CSS colour variables; values per mode not yet',
  };
}

/* ---------- the check ---------- */
const prevPart = (part) => {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, 'checks', 'figma.json'), 'utf8'))[part] ?? null;
  } catch {
    return null;
  }
};

/** The check's run(): the shape checks.mjs saves to data/checks/figma.json. */
export async function runFigmaCheck() {
  const code = codeSide();
  const now = new Date().toISOString();
  const [c, v] = await Promise.all([read('components'), read('variables')]);
  // each part keeps its own source and read time; a part that fails keeps its last reading
  const components = c.data
    ? { ...compareComponents(code.components, c.data), file: c.data.file, via: c.via, readAt: now }
    : { ...(prevPart('components') ?? {}), unread: c.error };
  const variables = v.data
    ? { ...compareVariables(code.roles, v.data, code.colourVars), file: v.data.file, via: v.via, readAt: now }
    : { ...(prevPart('variables') ?? {}), unread: v.error };
  const gotAny = Boolean(c.data || v.data);
  const compareErrors = [components.error, variables.error].filter(Boolean);
  const gaps = (components.total ?? 0) - (components.inStep ?? 0) + (variables.codeOnly?.length ?? 0) + (variables.figmaOnly?.length ?? 0) + (variables.twice?.length ?? 0);
  const parts = [];
  if (components.matched != null) parts.push(`${components.matched} of ${components.total} components in Figma, ${components.inStep} in step`);
  if (variables.matched != null) parts.push(`${variables.matched} of ${variables.total} colour roles`);
  return {
    ok: gotAny && !c.error && !v.error && !compareErrors.length && gaps === 0,
    summary: gotAny ? parts.join(' · ') : [c.error, v.error].filter(Boolean)[0],
    failures: [c.error, v.error, ...compareErrors].filter(Boolean),
    components,
    variables,
    ms: 0,
  };
}

/** For readers: the snapshot with each part's age and whether it is stale. */
export function figmaSnapshot(now = Date.now()) {
  let s;
  try {
    s = JSON.parse(readFileSync(join(DATA_DIR, 'checks', 'figma.json'), 'utf8'));
  } catch {
    return null;
  }
  for (const part of ['components', 'variables']) {
    const p = s[part];
    if (p?.readAt) {
      p.ageDays = Math.floor((now - Date.parse(p.readAt)) / 86400000);
      p.stale = p.ageDays >= STALE_DAYS;
    }
  }
  return s;
}
