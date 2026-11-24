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

// systems by the site a passage comes from; anything else shows its host
const SYSTEMS = {
  'material.io': 'Material', 'm3.material.io': 'Material', 'fluent2.microsoft.design': 'Fluent 2', 'mantine.dev': 'Mantine',
  'carbondesignsystem.com': 'Carbon', 'primer.style': 'Primer', 'spectrum.adobe.com': 'Spectrum', 'polaris.shopify.com': 'Polaris',
  'atlassian.design': 'Atlassian', 'designsystem.digital.gov': 'USWDS', 'design-system.service.gov.uk': 'GOV.UK',
};
const systemOf = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return SYSTEMS[h] ?? h;
  } catch {
    return null;
  }
};

// the comparisons the lock asks for, each a query and the words a useful sentence must contain
const TOPICS = [
  { key: 'variants', label: 'Variant names', query: (n) => `${n} types primary secondary text variants`, match: /\b(types?|variants?|primary|secondary|tertiary|text buttons?)\b/i, needsName: true },
  { key: 'target', label: 'Target size', query: (n) => `${n} minimum touch target size`, match: /\btouch targets?\b|\btarget size\b|\b(44|48)\s*(x|×)\s*(44|48)\b/i, needsName: false },
  { key: 'states', label: 'States', query: (n) => `${n} states loading disabled`, match: /\bloading\b/i, needsName: true },
  { key: 'sizes', label: 'Sizes', query: (n) => `${n} sizes small medium large density`, match: /\bsizes?\b|\bdensity\b|\bcompact\b/i, needsName: true },
];
// a dictionary-style opening says what the thing is, not how a system does it
const DEFINITION = /\bis an? (reusable|fundamental|interactive|visual)\b|\bare fundamental\b/i;

// search_chunks answers in markdown: "**📄 Chunk n: Title** — _Content_", the text, then "🔗 Source: [url](url)"
function chunks(text) {
  return text.split(/\n---\n/).map((b) => {
    const title = b.match(/\*\*📄 Chunk \d+:\s*(.+?)\*\*/)?.[1];
    const url = b.match(/Source:\s*\[([^\]]+)\]/)?.[1];
    if (!title || !url) return null;
    const body = b.replace(/\*\*📄[^\n]*\n/, '').replace(/🔗 Source:[^\n]*/, '').replace(/#+\s/g, '').replace(/\s+/g, ' ').trim();
    return { title: title.trim(), url, body };
  }).filter(Boolean);
}

// candidate sentences (or list items) for a topic, scored: specifics and the
// component's name count; a dictionary definition never qualifies
function candidates(body, topic, named) {
  // a source's own numbered list of types ("1. Primary Buttons - … 2. Secondary Buttons - …")
  if (topic.key === 'variants') {
    const names = [...body.matchAll(/\d\.\s*([A-Z][a-z]+)\s+[A-Z][a-z]*s?\b(?=\s*-)/g)].map((m) => m[1].toLowerCase());
    if (names.length >= 2) return [{ text: `Its types: ${names.slice(0, -1).join(', ')} and ${names.at(-1)}.`, score: 10 }];
  }
  // a "Name: what it is" list item, e.g. "Loading: During async operations"
  if (topic.key === 'states') {
    const m = body.match(/\bLoading:\s*([^:]+?)(?=\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?:|$)/);
    if (m) return [{ text: `A loading state, ${m[1].trim().replace(/^D/, 'd').replace(/\.?$/, '.')}`, score: 10 }];
  }
  const parts = body.split(/(?<=[.!?])\s+|\s•\s/).map((x) => x.trim()).filter((x) => x.length > 30 && x.length < 320);
  return parts
    .filter((x) => topic.match.test(x) && !DEFINITION.test(x))
    .map((x) => ({
      text: x.replace(/^\d\.\s*/, ''),
      score: (topic.key === 'sizes' && !named.test(x) ? -20 : 0) + (named.test(x) ? 3 : 0) + (/\b\d{2}\s*(px|dp|×|x)|\b(XS|SM|MD|LG|XL)\b|\b(small|medium|large)\b/i.test(x) ? 3 : 0) + (topic.key === 'sizes' && /spacing|space\./i.test(x) ? -6 : 0),
    }));
}

/** "BELLA differs": built only from the contract, for the topics a source spoke to. */
function differs(c, keys) {
  const out = [];
  if (keys.has('variants')) out.push(`its tiers are ${(c.variants ?? []).join(', ') || 'not named'}`);
  if (keys.has('target')) out.push(c.minTarget ? `the minimum is ${c.minTarget.value} everywhere` : 'it has no recorded target minimum');
  if (keys.has('states')) out.push((c.states ?? []).includes('loading') ? 'it has a loading state' : 'it has no loading state yet');
  if (keys.has('sizes')) out.push((c.props ?? []).includes('size') ? 'it has a size prop' : 'it comes in one size');
  return out.length ? `${out.join('; ')}.` : null;
}

/** GET /compare/:id -> { findings: [{ topic, system, url, title, text }], differs } or { error } */
export async function compare(c) {
  if (cache.has(c.id)) return cache.get(c.id);
  const spoken = c.name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const named = new RegExp(`\\b${spoken.replace(' ', '\\s?')}s?\\b`, 'i');
  const findings = [];
  const used = new Set();
  for (const topic of TOPICS) {
    let res;
    try {
      res = await host.call({ server: 'design-systems', tool: 'search_chunks', args: { query: topic.query(spoken), limit: 8 }, purpose: `How others do it: ${c.name} · ${topic.key}` });
    } catch (e) {
      return { error: `The design-systems server can't be reached right now (${e.message.slice(0, 120)}).` };
    }
    if (!res?.ok) return { error: `The design-systems server can't be reached right now${res?.error ? ` (${res.error.slice(0, 120)})` : ''}.` };
    let best = null;
    for (const ch of chunks(res.text)) {
      if (topic.needsName && !named.test(`${ch.title} ${ch.body}`)) continue;
      if (/blueprints?|designsystems\.surf/i.test(`${ch.title} ${ch.url}`)) continue; // directory pages, not a system's guidance
      // a design system's own guidance counts over an article about one
      const known = Object.values(SYSTEMS).includes(systemOf(ch.url)) ? 2 : 0;
      for (const cand of candidates(ch.body, topic, named)) if (cand.score + known > 0 && (!best || cand.score + known > best.score)) best = { ...cand, score: cand.score + known, ch };
    }
    if (best) {
      findings.push({ topic: topic.label, key: topic.key, system: systemOf(best.ch.url), url: best.ch.url, title: best.ch.title, text: best.text });
      used.add(best.ch.url);
    }
  }
  const out = { findings, differs: findings.length ? differs(c, new Set(findings.map((f) => f.key))) : null };
  cache.set(c.id, out);
  return out;
}
