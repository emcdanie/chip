// Atlas · Spec and Figma lint (Lint & Spec lock, 2026-10-03). Spec comes
// from code: the props, their values and defaults from BELLA's own docgen
// manifest (built by its gate), the contract and bella.json. Figma lint
// reads Figma through whichever read path answers: the REST API (no app
// open; figma-rest) when it has a token, else the desktop Figma MCP. When
// Figma can't be read, it says so and shows no score.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BELLA } from './bella-work.mjs';
import { DATA_DIR, ROOT } from './config.mjs';
import * as host from '../host/registry.js';

const MANIFEST = join(BELLA, 'storybook-static/manifests/components.json');

/** GET /bella-spec/:id -> { props: [{ name, values, default, required, description }] } */
export function specOf(c) {
  if (!existsSync(MANIFEST)) return { props: null, note: "BELLA's Storybook manifest isn't built yet (it comes with BELLA's gate)." };
  const all = JSON.parse(readFileSync(MANIFEST, 'utf8')).components;
  const entry = (Array.isArray(all) ? all : Object.values(all)).find((x) => x.name === c.name);
  const props = entry?.reactDocgen?.props;
  if (!props) return { props: null, note: `No docgen props for ${c.name} in BELLA's manifest.` };
  return {
    props: Object.entries(props).map(([name, p]) => ({
      name,
      values: p.tsType?.raw ?? p.tsType?.name ?? 'unknown',
      default: p.defaultValue?.value ?? null,
      required: Boolean(p.required),
      description: (p.description ?? '').split('\n')[0],
    })),
  };
}

/* ---------- Figma lint ---------- */
const lintCache = new Map();
const FLOOR = 44;

async function figma(tool, args) {
  const r = await host.call({ server: 'figma', tool, args, purpose: `Figma lint: ${tool}` });
  if (!r?.ok) throw new Error(r?.error ?? r?.refused ?? 'no answer');
  return r.text;
}

// "<symbol id="1:2" name="Type=Primary, State=Hover" … height="44" />" and friends
// (the attributes are read one by one: optional groups in one pattern never matched the height)
const nodesIn = (xml) =>
  [...xml.matchAll(/<([a-z-]+)\s+id="([^"]+)"\s+name="([^"]*)"([^>]*?)\/?>/g)].map((m) => {
    const h = m[4].match(/\sheight="([\d.]+)"/);
    return { tag: m[1], id: m[2], name: m[3], height: h ? Number(h[1]) : null };
  });

/* desktop MCP: the open file's whole outline, kept five minutes like REST's */
let deskFile = null;
async function deskDoc(refresh) {
  if (!refresh && deskFile && Date.now() - deskFile.t < REST_MS) return deskFile.doc;
  // the whole document in one read (a bare get_metadata returns the selection instead)
  deskFile = { t: Date.now(), doc: await figma('get_metadata', { nodeId: '0:0' }) };
  return deskFile.doc;
}

// which read path to use: REST when it is connected or has a token to try,
// else the desktop app; a REST without a token is an optional upgrade, not
// a failure, so it never makes the reason
function restUsable() {
  const s = host.servers().find((x) => x.name === 'figma-rest');
  return Boolean(s && !s.disabled && !s.setup);
}

/* REST: the file as JSON, kept five minutes (one library file, many components) */
const REST_MS = 5 * 60 * 1000;
let restFile = null;
async function restDoc(refresh) {
  if (!refresh && restFile && Date.now() - restFile.t < REST_MS) return restFile.doc;
  const r = await host.call({ server: 'figma-rest', tool: 'get_file', purpose: 'Figma lint: get_file' });
  if (!r?.ok) throw new Error(r?.error ?? r?.refused ?? 'no answer');
  restFile = { t: Date.now(), doc: JSON.parse(r.text).document };
  return restFile.doc;
}
const hex = ({ r, g, b }) => `#${[r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
// solid fills and strokes in a subtree with no variable bound to their colour
function unbound(n, out = new Set()) {
  for (const p of [...(n.fills ?? []), ...(n.strokes ?? [])]) {
    if (p.type === 'SOLID' && p.visible !== false && !p.boundVariables?.color) out.add(hex(p.color));
  }
  for (const k of n.children ?? []) unbound(k, out);
  return out;
}
function restHit(doc, want) {
  for (const page of doc.children ?? []) {
    const stack = [...(page.children ?? [])];
    while (stack.length) {
      const n = stack.shift();
      if (['COMPONENT_SET', 'COMPONENT'].includes(n.type) && want.test(n.name.trim())) {
        const node = { id: n.id, name: n.name, height: n.absoluteBoundingBox?.height ?? null };
        const variants = (n.children ?? []).filter((k) => k.type === 'COMPONENT' && k.name.includes('=')).map((k) => ({ id: k.id, name: k.name, height: k.absoluteBoundingBox?.height ?? null }));
        return { page: { name: page.name }, node, variants, raw: n };
      }
      stack.push(...(n.children ?? []));
    }
  }
  return null;
}

/** GET /figma-lint/:id[?refresh=1] -> { read, found, via, score?, findings?, figmaNames?, reason? } */
export async function figmaLint(c, { refresh = false, codeProps = [] } = {}) {
  if (!refresh && lintCache.has(c.id)) return lintCache.get(c.id);
  const at = new Date().toISOString();
  const want = new RegExp(`(^|/)\\s*${c.name}$`, 'i');
  let hit = null;
  let variants = [];
  let via = 'rest';
  let pageCount = 0;
  let restError = null;
  // REST first when it can work: no Figma app needed
  if (restUsable()) {
    try {
      const doc = await restDoc(refresh);
      pageCount = doc.children?.length ?? 0;
      hit = restHit(doc, want);
      if (hit) variants = hit.variants;
    } catch (e) {
      restError = e.message;
    }
  } else restError = 'no token';
  // the desktop MCP when REST has no token or couldn't read
  if (restError) {
    via = 'desktop';
    let doc;
    try {
      doc = await deskDoc(refresh);
    } catch (e) {
      const rest = restError === 'no token' ? 'REST has no token (optional).' : `Over REST: ${restError.slice(0, 220)}`;
      const out = { read: false, at, reason: `Figma can't be read. The desktop app isn't answering (${e.message.slice(0, 80)}): open Figma with the BELLA library. ${rest}` };
      lintCache.set(c.id, out);
      return out;
    }
    const nodes = nodesIn(doc);
    pageCount = nodes.filter((n) => n.tag === 'canvas').length;
    // a component set comes through as a frame whose children are the
    // "variant=primary, state=hover" symbols; a single component as a symbol
    let page = null;
    const cands = [];
    for (const n of nodes) {
      if (n.tag === 'canvas') page = n;
      if (['symbol', 'frame', 'component-set', 'component_set'].includes(n.tag) && want.test(n.name.trim())) cands.push({ page: page ?? { name: 'the file' }, node: n });
    }
    for (const cand of cands.slice(0, 4)) {
      const sub = await figma('get_metadata', { nodeId: cand.node.id }).catch(() => '');
      const vs = nodesIn(sub).filter((n) => n.tag === 'symbol' && n.name.includes('='));
      if (cand.node.tag === 'frame' && !vs.length) continue; // a docs frame with the same name
      hit = cand;
      variants = vs;
      break;
    }
  }
  if (!hit) {
    const out = { read: true, found: false, via, at, pages: pageCount, reason: `Figma reads, but none of its ${pageCount} pages has a component named ${c.name}.${via === 'rest' ? ' Check FIGMA_FILE_KEY in server/.env points at the BELLA library.' : ' (Read from the file open in the Figma app.)'}` };
    lintCache.set(c.id, out);
    return out;
  }
  const props = {};
  for (const v of variants) for (const pair of v.name.split(',')) {
    const [k, val] = pair.split('=').map((x) => x.trim());
    if (k && val) (props[k] ??= new Set()).add(val);
  }
  const where = (extra) => `${hit.page.name} › ${hit.node.name}${extra ? ` › ${extra}` : ''}`;
  const findings = [];
  // names: Figma properties against code props, and variant values against the contract
  const lower = (s) => s.toLowerCase();
  const figmaNames = {};
  for (const [k, vals] of Object.entries(props)) {
    const prop = codeProps.find((p) => lower(p) === lower(k)) ?? (/^(type|kind|variant|hierarchy|emphasis)$/i.test(k) && codeProps.includes('variant') ? 'variant' : null);
    if (prop) figmaNames[prop] = k;
    if (/^state$/i.test(k)) continue;
    if (!prop || lower(prop) !== lower(k)) {
      findings.push({ check: 'Names', ok: false, what: `Figma calls a property "${k}"; code has ${prop ? `"${prop}"` : 'no such prop'}.`, where: where('properties'), fix: prop ? `Rename "${k}" to "${prop}".` : `Map "${k}" to a code prop or remove it.` });
    }
    if (prop === 'variant') {
      const code = (c.variants ?? []).map(lower);
      const extra = [...vals].filter((v) => !code.includes(lower(v)));
      if (extra.length) findings.push({ check: 'Names', ok: false, what: `Variant values ${extra.map((v) => `"${v}"`).join(', ')} aren't in the contract (${c.variants.join(', ')}).`, where: where(k), fix: 'Rename them to the contract values.' });
    }
  }
  // states: in the contract, missing from Figma's State values
  const stateProp = Object.keys(props).find((k) => /^state$/i.test(k));
  const figmaStates = stateProp ? [...props[stateProp]].map(lower) : [];
  const missing = (c.states ?? []).filter((s) => s !== 'default' && !figmaStates.some((f) => f === s || (s === 'active' && f === 'pressed')));
  findings.push(missing.length
    ? { check: 'States', ok: false, what: `The contract has ${missing.join(', ')}; Figma has ${stateProp ? `no State=${missing.join(', State=')}` : 'no State property'}.`, where: where(stateProp ?? 'variants'), fix: `Add ${missing.map((m) => `State=${m[0].toUpperCase()}${m.slice(1)}`).join(', ')}.` }
    : { check: 'States', ok: true, what: 'Every contract state has a Figma variant.', where: where(stateProp) });
  // target size: variants shorter than the floor
  // no variants: the component itself is the one size there is
  const sized = variants.length ? variants : [hit.node];
  const short = sized.filter((v) => v.height != null && v.height < FLOOR);
  // no height in the metadata: say so and leave it out of the score, never pass it by default
  findings.push(!sized.some((v) => v.height != null)
    ? { check: 'Target size', ok: null, what: 'Not measured: Figma gave no height for this component.', where: where() }
    : short.length
    ? { check: 'Target size', ok: false, what: `${short.length} variant${short.length === 1 ? ' is' : 's are'} under ${FLOOR}px (${short.slice(0, 3).map((v) => `${v.name}: ${v.height}px`).join('; ')}).`, where: where(short[0].name), fix: `Raise them to ${FLOOR}px.` }
    : { check: 'Target size', ok: true, what: variants.length ? `Every variant is at least ${FLOOR}px tall.` : `It is ${hit.node.height}px tall, at least ${FLOOR}px.`, where: where() });
  // bindings: colours in the design that no variable explains
  const bindings = (loose) =>
    loose.length
      ? { check: 'Bindings', ok: false, what: `${loose.length} colour${loose.length === 1 ? ' is' : 's are'} hard-coded, not bound to a variable (${loose.slice(0, 4).join(', ')}).`, where: where(), fix: 'Bind each to its BELLA variable.', preview: { before: loose[0], after: 'the matching BELLA variable' } }
      : { check: 'Bindings', ok: true, what: 'Every colour is bound to a variable.', where: where() };
  if (via === 'rest') findings.unshift(bindings([...unbound(hit.raw)]));
  else try {
    const vars = await figma('get_variable_defs', { nodeId: hit.node.id });
    const ctx = await figma('get_design_context', { nodeId: hit.node.id, excludeScreenshot: true, clientFrameworks: 'react', clientLanguages: 'javascript' });
    const bound = new Set([...vars.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => lower(m[0])));
    const used = [...new Set([...ctx.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => lower(m[0])))];
    findings.unshift(bindings(used.filter((h) => !bound.has(h))));
  } catch (e) {
    // the raw error is often a JSON schema dump: log it, show words
    console.warn('figma lint bindings:', e.message);
    findings.unshift({ check: 'Bindings', ok: null, what: "Not measured: Figma didn't return this component's variables.", where: where() });
  }
  // contrast: from code (the contract's verified pairs)
  const ct = c.health.contrast;
  findings.push(ct.status === 'fail'
    ? { check: 'Contrast', ok: false, what: `Failing pairs in code: ${ct.failing.join('; ')}`, where: 'BELLA contrast pairs' }
    : ct.pairs
    ? { check: 'Contrast', ok: true, what: `${ct.pairs} pairs pass in code; Figma matches once its colours are bound.`, where: 'BELLA contrast pairs' }
    : { check: 'Contrast', ok: null, what: 'Not measured: no contrast pair in code reads its tokens yet.', where: 'BELLA contrast pairs' });
  // score: bindings and states weigh most, then names and target, then contrast
  const weight = { Bindings: 3, States: 3, Names: 2, 'Target size': 2, Contrast: 1 };
  const total = findings.filter((f) => f.ok !== null).reduce((n, f) => n + weight[f.check], 0);
  const lost = findings.filter((f) => f.ok === false).reduce((n, f) => n + weight[f.check], 0);
  const out = { read: true, found: true, via, at, where: where(), variants: variants.length, score: total ? Math.round(100 * (1 - lost / total)) : null, findings, figmaNames };
  lintCache.set(c.id, out);
  return out;
}

/* ---------- the baseline: every component compared once ---------- */
const BASELINE = join(DATA_DIR, 'figma-baseline.json');
let baselineJob = null;

export function readBaseline() {
  let saved = null;
  try {
    saved = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {}
  return { ...(saved ?? { at: null }), running: baselineJob };
}

/** Compares every component in data/bella.json with Figma, one at a time, and keeps the result. */
export function runBaseline(propsOf) {
  if (baselineJob) return readBaseline();
  const comps = JSON.parse(readFileSync(join(ROOT, 'data/bella.json'), 'utf8')).components;
  baselineJob = { startedAt: new Date().toISOString(), done: 0, total: comps.length };
  (async () => {
    const rows = [];
    for (const c of comps) {
      let r;
      try {
        r = await figmaLint(c, { refresh: rows.length === 0, codeProps: propsOf(c) });
      } catch (e) {
        r = { read: false, reason: e.message };
      }
      rows.push({ id: c.id, name: c.name, read: r.read, found: r.found ?? false, via: r.via ?? null, score: r.score ?? null, where: r.where ?? null, variants: r.variants ?? 0, failing: (r.findings ?? []).filter((f) => f.ok === false).map((f) => ({ check: f.check, what: f.what })), reason: r.found ? null : r.reason ?? null });
      baselineJob.done = rows.length;
    }
    const found = rows.filter((r) => r.found);
    const scored = found.filter((r) => r.score != null);
    const byCheck = {};
    for (const r of found) for (const f of r.failing) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
    const out = {
      at: new Date().toISOString(),
      via: found[0]?.via ?? rows.find((r) => r.via)?.via ?? null,
      total: rows.length,
      found: found.length,
      notRead: rows.filter((r) => !r.read).length,
      average: scored.length ? Math.round(scored.reduce((n, r) => n + r.score, 0) / scored.length) : null,
      byCheck,
      rows,
    };
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(BASELINE, JSON.stringify(out, null, 2));
    baselineJob = null;
  })().catch(() => {
    baselineJob = null;
  });
  return readBaseline();
}

/** The last lint for one component, from this run or the baseline; never starts a read. */
export function lastLint(c) {
  if (lintCache.has(c.id)) return lintCache.get(c.id);
  try {
    const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const r = b.rows.find((x) => x.id === c.id);
    return r ? { ...r, at: b.at, findings: r.failing.map((f) => ({ ...f, ok: false })) } : null;
  } catch {
    return null;
  }
}
