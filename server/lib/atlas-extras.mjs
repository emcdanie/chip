// Atlas v4 extras: who sees what (data/visibility.json, simulated roles
// until CHIP is hosted) and "How others do it" from the design-systems MCP
// (a read-only host server; says so when it can't be reached).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import * as host from '../host/registry.js';

const VIS = join(ROOT, 'data/visibility.json');
const VISIBLE = ['everyone', 'editors', 'admins'];
const STATUS = ['draft', 'in-progress', 'ready'];

export function readVisibility() {
  try {
    return JSON.parse(readFileSync(VIS, 'utf8'));
  } catch {
    return { components: {} };
  }
}

/** PUT /visibility { component, section?, visibleTo?, status? } */
export function setVisibility({ component, section, visibleTo, status }) {
  if (!/^[a-z0-9-]+$/.test(String(component))) throw new Error('component must be a BELLA id');
  if (section != null && !/^[a-z0-9-]+$/.test(String(section))) throw new Error('section must be an id');
  if (visibleTo != null && !VISIBLE.includes(visibleTo)) throw new Error(`visibleTo must be one of ${VISIBLE.join(', ')}`);
  if (status != null && !STATUS.includes(status)) throw new Error(`status must be one of ${STATUS.join(', ')}`);
  const v = readVisibility();
  const c = (v.components[component] ??= {});
  const target = section ? ((c.sections ??= {})[section] ??= {}) : c;
  if (visibleTo != null) target.visibleTo = visibleTo;
  if (status != null) target.status = status;
  writeFileSync(VIS, `${JSON.stringify(v, null, 2)}\n`);
  return v;
}

/* ---------- How others do it ---------- */
const cache = new Map();
const COMPARE = ['loading', 'icon', 'size', 'small', 'large', 'toggle', 'destructive', 'danger', 'outline', 'ghost'];

// the server answers in markdown: one block per entry, "**🔍 n. Title**",
// "🏷️ System: …", "🔗 Source: [url](url)", then the text
function parse(text) {
  return text.split(/\n---\n/).map((b) => {
    const title = b.match(/\*\*🔍\s*\d+\.\s*(.+?)\*\*/)?.[1];
    if (!title) return null;
    const system = b.match(/System:\s*(.+)/)?.[1]?.trim();
    const url = b.match(/Source:\s*\[([^\]]+)\]/)?.[1];
    const body = (b.split(/Source:.*\n/)[1] ?? '').replace(/#+\s[^\n]*/g, '').trim().replace(/\s+/g, ' ');
    return { title: title.trim(), system: system && system !== 'N/A' ? system : null, url, body };
  }).filter(Boolean);
}

const sentences = (s, n) => (s.match(/[^.!?]+[.!?]+/g) ?? [s]).slice(0, n).join(' ').trim();

/** GET /compare/:id -> { findings: [{ title, system, url, summary }], differs } or { error } */
export async function compare(c) {
  if (cache.has(c.id)) return cache.get(c.id);
  let res;
  try {
    res = await host.call({ server: 'design-systems', tool: 'search_design_knowledge', args: { query: `${c.name.replace(/([a-z])([A-Z])/g, '$1 $2')} component`, category: 'components', limit: 8 }, purpose: `How others do it: ${c.name}` });
  } catch (e) {
    return { error: `The design-systems server can't be reached right now (${e.message.slice(0, 120)}).` };
  }
  if (!res?.ok) return { error: `The design-systems server can't be reached right now${res?.error ? ` (${res.error.slice(0, 120)})` : ''}.` };
  // "SegmentedControl" is "Segmented control" in other systems' words
  const name = c.name.replace(/([a-z])([A-Z])/g, '$1 ?$2').toLowerCase();
  const entries = parse(res.text).filter((e) => new RegExp(`^${name}\\b`, 'i').test(e.title) && !/blueprints?/i.test(e.title)).slice(0, 4);
  const findings = entries.map((e) => ({ title: e.title, system: e.system, url: e.url, summary: sentences(e.body, 2) }));
  // what the others mention that BELLA's contract does not have (word match, no guessing)
  const ours = [...(c.variants ?? []), ...(c.states ?? []), ...(c.props ?? []), ...(c.shapes ?? [])].join(' ').toLowerCase();
  const theirs = entries.map((e) => e.body.toLowerCase()).join(' ');
  const missing = COMPARE.filter((w) => new RegExp(`\\b${w}\\b`).test(theirs) && !ours.includes(w));
  const out = {
    findings,
    differs: findings.length ? (missing.length ? `the sources mention ${missing.join(', ')}; ${c.name}'s contract has none of these.` : 'nothing the sources mention is missing from the contract.') : null,
  };
  cache.set(c.id, out);
  return out;
}
