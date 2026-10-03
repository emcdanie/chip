// Ask CHIP: retrieve top chunks from the local index, answer with the local
// model. Shared by the server (POST /ask) and the terminal (chip ask).
// Rules ported from server/AGENT_PROMPT.md, minus the Notion MCP protocol:
// Notion is now synced into the index, so retrieval replaces tool calls.
import { randomUUID } from 'node:crypto';
import { search } from './index.mjs';
import { chat } from './llm.js';
import { resolve, providers } from '../providers/index.mjs';
import { CHIP_CONTEXT_WORDS } from './config.mjs';

const TOP_K = 6;
// Below this cosine score the best match is weak: no model call, the closest
// three are shown instead. Measured 2026-10-03: off-topic questions top out
// at 0.51 to 0.55, on-topic ones start around 0.64.
export const WEAK_SCORE = 0.6;
const HISTORY_TURNS = 4; // messages kept per session (user + assistant); short keeps the prompt fast

const SYSTEM = `You are CHIP, a design systems assistant for Elleta, who runs the BELLA design system.

Tone: spare, declarative. No filler, no preamble, no praise, no emoji, no trailing offers. State the finding, then the implication.

Answer ONLY from the sources in the message (each starts with "[n] <title>"). Rules:
- Cite every claim with its source number in brackets, e.g. [1] or [2][3]. Each number is one source. Never write source titles in the answer.
- If a pronoun (he, she, they, it, this) cannot be resolved from earlier turns or from the page the user is looking at, do not guess: ask who or what is meant, in one sentence, and stop.
- If the sources do not answer the question, say plainly: "Nothing in my sources covers that." Then stop, or add one line marked "General knowledge, not your sources:".
- Never invent data: no numbers, percentages, ticket IDs, dates, people or platform status that are not in the sources.
- BELLA is web only (React). There is no iOS or Android implementation and no parity data for them. If asked, say there is no data; do not estimate.
- Some CHIP docs describe the April 2026 hackathon demo (47 components, iOS/Android parity, Jira tickets). That scenario is synthetic. Never report its numbers as real; if it is the only match, say it is demo data.
- Jira, Figma, Zeroheight and live Storybook are not connected. Say so if asked about them.

Format: markdown, under 200 words unless the question needs more. Bold sparingly, "- " bullets.`;

const sessions = new Map(); // sessionId -> [{ role, content }]

// One numbered source per document, in rank order; the passage is the start
// of its best chunk, for the hover card.
const excerpt = (t) => (t.length > 320 ? t.slice(0, 320).replace(/\s+\S*$/, '') + '…' : t);
function numbered(chunks) {
  const byKey = new Map();
  for (const c of chunks) {
    const key = c.url || c.path;
    if (!byKey.has(key)) {
      byKey.set(key, { n: byKey.size + 1, title: c.title, ...(c.url ? { url: c.url } : { path: c.path }), passage: excerpt(c.text.trim()), score: +c.score.toFixed(3) });
    }
  }
  return byKey;
}
const keyOf = (c) => c.url || c.path;

// Fill the word budget with the top chunks in rank order; the last one may be
// cut. Only chunks actually sent to the model are reported as sources.
function fitBudget(chunks) {
  const picked = [];
  let left = CHIP_CONTEXT_WORDS;
  for (const c of chunks) {
    if (left <= 40) break;
    const words = c.text.split(/\s+/);
    picked.push({ ...c, text: words.slice(0, left).join(' ') });
    left -= Math.min(words.length, left);
  }
  return picked;
}

// Notion pages are Elleta's own workspace: they stay off the cloud unless she
// says yes for this session. Nothing in the index is marked public yet, so
// every Notion source counts as private (privacy first).
const isPrivate = (c) => (c.path || '').startsWith('data/notion/') || /notion\.(so|com)/.test(c.url || '');

// page: what the user is looking at ("Atlas · Button"). The question is
// searched on its own; the page joins (as a second search, merged, and as a
// line in the prompt) only when the question points at it ("this", "here",
// "it", or the component's name). Mixing it in always dragged unrelated
// questions toward the page and the model refused them (2026-10-03: "anything
// on dashboards" on Atlas · Button). cloud + includePrivate decide whether
// private sources may go to a cloud model.
function pointsAt(message, page) {
  if (!page) return false;
  const name = page.match(/^Atlas · (\w+)$/)?.[1];
  return /\b(this|here|it|its)\b/i.test(message) || (name ? new RegExp(`\\b${name}\\b`, 'i').test(message) : false);
}

async function retrieve(query, k, page, withPage) {
  const plain = await search(query, k);
  if (!withPage) return plain;
  const paged = await search(`${query} (${page})`, k);
  const best = new Map();
  for (const c of [...plain, ...paged]) {
    const key = `${c.path || c.url}#${c.text.slice(0, 40)}`;
    if (!best.has(key) || best.get(key).score < c.score) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
async function prepare(message, sessionId, page, { cloud = false, includePrivate = false } = {}) {
  const id = sessionId || randomUUID();
  const history = sessions.get(id) || [];
  const withPage = pointsAt(message, page);
  let found = await retrieve(message, TOP_K * (cloud && !includePrivate ? 3 : 1), page, withPage);
  let heldBack = 0;
  if (cloud && !includePrivate) {
    heldBack = found.filter(isPrivate).length;
    found = found.filter((c) => !isPrivate(c));
  }
  found = found.slice(0, TOP_K);
  const top = found[0]?.score ?? 0;
  if (top < WEAK_SCORE) {
    return { id, weak: true, top, heldBack, closest: [...numbered(found.slice(0, 3)).values()] };
  }
  const chunks = fitBudget(found);
  const nums = numbered(chunks);
  const context = chunks.map((c) => `[${nums.get(keyOf(c)).n}] ${c.title}\n${c.text}`).join('\n\n---\n\n');
  const where = withPage ? `The user is looking at: ${page}.\n\n` : '';
  const turns = [...history, { role: 'user', content: `Sources:\n\n${context}\n\n===\n\n${where}Question: ${message}` }];
  const messages = [{ role: 'system', content: SYSTEM }, ...turns];
  const remember = (reply) => // history keeps the bare question, not the sources
    sessions.set(id, [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-HISTORY_TURNS));
  return { id, top, heldBack, messages, turns, sources: [...nums.values()], remember };
}

export async function ask(message, sessionId, page) {
  const prep = await prepare(message, sessionId, page);
  if (prep.weak) return { weak: true, reply: null, sessionId: prep.id, sources: [], closest: prep.closest, top: prep.top };
  const { id, messages, sources, remember } = prep;
  const reply = await chat(messages);
  remember(reply);
  return { reply, sessionId: id, sources };
}

// Streaming: { type: 'provider' } (who answers), { type: 'private' } when
// Notion sources were held back from the cloud, { type: 'sources' }, then
// { type: 'token' } pieces and { type: 'done' }. A weak best match yields one
// { type: 'weak', closest } and no model call. If Claude cannot answer, a
// { type: 'fallback', reason } precedes the local model's answer.
// opts: { provider: 'local:<model>' | 'claude', includePrivate }
export async function* askStream(message, sessionId, page, opts = {}) {
  let { provider, model } = resolve(opts.provider);
  const prep = await prepare(message, sessionId, page, { cloud: provider.place === 'cloud', includePrivate: opts.includePrivate });
  if (prep.heldBack) yield { type: 'private', heldBack: prep.heldBack };
  if (prep.weak) {
    yield { type: 'weak', closest: prep.closest, top: prep.top, sessionId: prep.id };
    return;
  }
  let { id, turns, sources, remember } = prep;
  yield { type: 'sources', sources, sessionId: id, top: prep.top };
  const run = async function* (p, m) {
    for await (const text of p.ask({ system: SYSTEM, messages: turns, model: m })) yield text;
  };
  let reply = '';
  let gen = run(provider, model);
  let first;
  try {
    first = await gen.next();
  } catch (err) {
    if (provider.place !== 'cloud') throw err;
    yield { type: 'fallback', reason: err.message };
    provider = providers.local;
    model = undefined;
    // a local answer may read every source again, private ones included
    const again = await prepare(message, id, page);
    if (!again.weak) {
      ({ turns, sources, remember } = again);
      yield { type: 'sources', sources, sessionId: id, top: again.top };
    }
    gen = run(provider, model);
    first = await gen.next();
  }
  yield { type: 'provider', id: provider.id, place: provider.place, model: provider.id === 'claude' ? (await providers.claude.list())[0].label : model || (await providers.local.list()).find((x) => x.isDefault)?.label || 'local' };
  if (!first.done) {
    reply += first.value;
    yield { type: 'token', text: first.value };
    for await (const text of gen) {
      reply += text;
      yield { type: 'token', text };
    }
  }
  remember(reply.trim());
  yield { type: 'done', reply: reply.trim(), sessionId: id, sources, provider: provider.id };
}
