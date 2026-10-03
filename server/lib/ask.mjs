// Ask CHIP: retrieve top chunks from the local index, answer with the local
// model. Shared by the server (POST /ask) and the terminal (chip ask).
// Rules ported from server/AGENT_PROMPT.md, minus the Notion MCP protocol:
// Notion is now synced into the index, so retrieval replaces tool calls.
import { randomUUID } from 'node:crypto';
import { search } from './index.mjs';
import { chat } from './llm.js';
import { resolve, providers } from '../providers/index.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { CHIP_CONTEXT_WORDS, CONTEXT_PACK } from './config.mjs';

// The Cowork context pack opens every local-model prompt (background on
// BELLA, CHIP and how Elleta works). Read fresh each time: it is small and
// her reviewer edits it. Local only: never sent to the cloud this way.
export function contextPack() {
  if (!existsSync(CONTEXT_PACK)) return '';
  return readFileSync(CONTEXT_PACK, 'utf8').trim();
}
// Does a local reply quote the pack? Any run of 8 words in common counts.
const words = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
export function quotesPack(reply) {
  const pack = contextPack();
  if (!pack || !reply) return false;
  const p = words(pack);
  const runs = new Set();
  for (let i = 0; i + 8 <= p.length; i++) runs.add(p.slice(i, i + 8).join(' '));
  const r = words(reply);
  for (let i = 0; i + 8 <= r.length; i++) if (runs.has(r.slice(i, i + 8).join(' '))) return true;
  return false;
}

const withPack = (system) => {
  const pack = contextPack();
  return pack ? `Background (from Elleta's context pack; not a numbered source, do not cite it):\n${pack}\n\n===\n\n${system}` : system;
};

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
      byKey.set(key, { n: byKey.size + 1, title: c.title, ...(c.url ? { url: c.url } : { path: c.path }), passage: excerpt(c.text.trim()), score: +c.score.toFixed(3), ...(c.localOnly ? { localOnly: true } : {}) });
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
// OBI Docs (obi-notes/) are private the same way.
const isPrivate = (c) => (c.path || '').startsWith('data/notion/') || (c.path || '').startsWith('obi-notes/') || /notion\.(so|com)/.test(c.url || '');
// Cowork exports (the context pack among them) never go to the cloud, not
// even with the yes for Notion: they are local answers' background only.
const isLocalOnly = (c) => (c.path || '').startsWith('docs/reference/cowork/') || c.localOnly === true;

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
  // a cloud model sees a locally answered turn only when that answer used no
  // private source (Notion, Cowork, docs); otherwise the pair stays local and
  // the answer says how many were left out. Pairs carry place and private.
  const stored = sessions.get(id) || [];
  const keep = (m) => !cloud || m.place !== 'local' || !m.private;
  const history = stored.filter(keep).map(({ role, content }) => ({ role, content }));
  const keptLocal = cloud ? stored.filter((m) => m.role === 'assistant' && !keep(m)).length : 0;
  const withPage = pointsAt(message, page);
  let found = await retrieve(message, TOP_K * (cloud ? 3 : 1), page, withPage);
  let heldBack = 0;
  if (cloud) found = found.filter((c) => !isLocalOnly(c));
  if (cloud && !includePrivate) {
    heldBack = found.filter(isPrivate).length;
    found = found.filter((c) => !isPrivate(c));
  }
  found = found.slice(0, TOP_K);
  const top = found[0]?.score ?? 0;
  if (top < WEAK_SCORE) {
    return { id, weak: true, top, heldBack, keptLocal, closest: [...numbered(found.slice(0, 3)).values()] };
  }
  const chunks = fitBudget(found);
  const nums = numbered(chunks);
  const context = chunks.map((c) => `[${nums.get(keyOf(c)).n}] ${c.title}\n${c.text}`).join('\n\n---\n\n');
  const where = withPage ? `The user is looking at: ${page}.\n\n` : '';
  const turns = [...history, { role: 'user', content: `Sources:\n\n${context}\n\n===\n\n${where}Question: ${message}` }];
  const messages = [{ role: 'system', content: withPack(SYSTEM) }, ...turns]; // non-streamed path is local only
  // history keeps the bare question, not the sources, where it was answered
  // and whether a private source went into it
  // private when a private source went in, when an earlier private turn was
  // in its history (it may restate it), or when a local reply quotes the
  // context pack (Cowork text)
  const usedPrivate = chunks.some((c) => isPrivate(c) || isLocalOnly(c)) || stored.some((m) => m.private);
  const remember = (reply, place = 'local') => {
    const priv = usedPrivate || (place === 'local' && quotesPack(reply));
    sessions.set(id, [...stored, { role: 'user', content: message, place, private: priv }, { role: 'assistant', content: reply, place, private: priv }].slice(-HISTORY_TURNS));
  };
  return { id, top, heldBack, keptLocal, messages, turns, sources: [...nums.values()], remember };
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
  if (prep.keptLocal) yield { type: 'kept', count: prep.keptLocal };
  if (prep.weak) {
    yield { type: 'weak', closest: prep.closest, top: prep.top, sessionId: prep.id };
    return;
  }
  let { id, turns, sources, remember } = prep;
  yield { type: 'sources', sources, sessionId: id, top: prep.top };
  const stats = {}; // { prompt, output } tokens, filled by the provider
  const run = async function* (p, m) {
    for await (const text of p.ask({ system: p.place === 'local' ? withPack(SYSTEM) : SYSTEM, messages: turns, model: m, stats })) yield text;
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
  const modelName = provider.id === 'claude' ? (await providers.claude.list())[0].label : model || (await providers.local.list()).find((x) => x.isDefault)?.label || 'local';
  yield { type: 'provider', id: provider.id, place: provider.place, model: modelName };
  if (!first.done) {
    reply += first.value;
    yield { type: 'token', text: first.value };
    for await (const text of gen) {
      reply += text;
      yield { type: 'token', text };
    }
  }
  remember(reply.trim(), provider.place);
  yield { type: 'done', reply: reply.trim(), sessionId: id, sources, provider: provider.id, place: provider.place, model: modelName, tokens: { prompt: stats.prompt ?? 0, output: stats.output ?? 0 } };
}
