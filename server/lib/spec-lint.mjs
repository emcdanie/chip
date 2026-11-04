// Atlas · Spec and Figma lint (Lint & Spec lock, 2026-10-03). Spec comes
// from code: the props, their values and defaults from BELLA's own docgen
// manifest (built by its gate), the contract and bella.json. Figma lint
// reads Figma over its REST API (no app open; figma-rest), or through the
// desktop Figma MCP when REST has no token, and compares it with code; when
// Figma can't be read, it says so and shows no score.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BELLA } from './bella-work.mjs';
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
const nodesIn = (xml) =>
  [...xml.matchAll(/<([a-z-]+)\s+id="([^"]+)"\s+name="([^"]*)"[^>]*?(?:width="([\d.]+)")?[^>]*?(?:height="([\d.]+)")?[^>]*?(\/?)>/g)].map((m) => ({ tag: m[1], id: m[2], name: m[3], height: m[5] ? Number(m[5]) : null }));

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
  // REST first: works without the Figma app
  try {
    const doc = await restDoc(refresh);
    pageCount = doc.children?.length ?? 0;
    hit = restHit(doc, want);
    if (hit) variants = hit.variants;
  } catch (e) {
    restError = e.message;
  }
  // the desktop MCP only when REST couldn't read at all
  if (restError) {
    via = 'desktop';
    // the whole document in one read (a bare get_metadata returns the selection instead)
    let doc;
    try {
      doc = await figma('get_metadata', { nodeId: '0:0' });
    } catch (e) {
      const out = { read: false, at, reason: `Figma can't be read. Over REST: ${restError.slice(0, 220)} The desktop MCP isn't answering either (${e.message.slice(0, 80)}).` };
      lintCache.set(c.id, out);
      return out;
    }
    const nodes = nodesIn(doc);
    pageCount = nodes.filter((n) => n.tag === 'canvas').length;
    let page = null;
    for (const n of nodes) {
      if (n.tag === 'canvas') page = n;
      if (['symbol', 'component-set', 'component_set'].includes(n.tag) && want.test(n.name.trim())) {
        hit = { page: page ?? { name: 'the file' }, node: n, xml: doc };
        break;
      }
    }
    if (hit) {
      // the variants: "Type=Primary, State=Hover" children
      const sub = await figma('get_metadata', { nodeId: hit.node.id }).catch(() => hit.xml);
      variants = nodesIn(sub).filter((n) => n.tag === 'symbol' && n.name.includes('='));
    }
  }
  if (!hit) {
    const out = { read: true, found: false, via, at, pages: pageCount, reason: `Figma reads, but none of its ${pageCount} pages has a component named ${c.name}.${via === 'rest' ? ' Check FIGMA_FILE_KEY in server/.env points at the BELLA library.' : ' Open the BELLA library file in Figma and Read Figma again.'}` };
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
  findings.push({ check: 'Contrast', ok: c.health.contrast.status !== 'fail', what: c.health.contrast.status === 'fail' ? `Failing pairs in code: ${c.health.contrast.failing.join('; ')}` : `${c.health.contrast.pairs} pairs pass in code; Figma matches once its colours are bound.`, where: 'BELLA contrast pairs' });
  // score: bindings and states weigh most, then names and target, then contrast
  const weight = { Bindings: 3, States: 3, Names: 2, 'Target size': 2, Contrast: 1 };
  const total = findings.filter((f) => f.ok !== null).reduce((n, f) => n + weight[f.check], 0);
  const lost = findings.filter((f) => f.ok === false).reduce((n, f) => n + weight[f.check], 0);
  const out = { read: true, found: true, via, at, where: where(), variants: variants.length, score: total ? Math.round(100 * (1 - lost / total)) : null, findings, figmaNames };
  lintCache.set(c.id, out);
  return out;
}
