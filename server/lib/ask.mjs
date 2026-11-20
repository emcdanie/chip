// Ask CHIP: retrieve top chunks from the local index, answer with the local
// model. Shared by the server (POST /ask) and the terminal (chip ask).
// Rules ported from server/AGENT_PROMPT.md, minus the Notion MCP protocol:
// Notion is now synced into the index, so retrieval replaces tool calls.
import { randomUUID } from 'node:crypto';
import { search } from './index.mjs';
import { chat } from './llm.js';
import { resolve, providers } from '../providers/index.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { listChecks } from './checks.mjs';
import { reviewCard, waitingChecks } from './review.mjs';
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
const MAX_PER_PAGE = 2;
// Below this cosine score the best match is weak: no model call, the closest
// three are shown instead. Measured 2026-10-03: off-topic questions top out
// at 0.51 to 0.55, on-topic ones start around 0.64.
export const WEAK_SCORE = 0.6;
const HISTORY_TURNS = 4; // messages kept per session (user + assistant); short keeps the prompt fast

const SYSTEM = `You are CHIP, a design systems assistant for Elleta, who runs the BELLA design system.

Tone: spare, declarative. No filler, no preamble, no praise, no emoji, no trailing offers. State the finding, then the implication.

Answer ONLY from the sources in the message (each starts with "[n] <title>"). Rules:
- Cite every claim with its source number in brackets, e.g. [1] or [2][3]. Each number is one source. Never write source titles in the answer.
- Cite only the source that states that claim. If no source states it, leave the claim out. Do not reuse [1] for claims that come from other sources.
- Never contradict a source or yourself: the verdict and every bullet must agree with each other and with the sources they cite. If the sources disagree, say which says what.
- If a pronoun (he, she, they, it, this) cannot be resolved from earlier turns or from the page the user is looking at, do not guess: ask who or what is meant, in one sentence, and stop.
- If the sources do not answer the question, say plainly: "Nothing in my sources covers that." Then stop, or add one line marked "General knowledge, not your sources:".
- Never invent data: no numbers, percentages, ticket IDs, dates, people or platform status that are not in the sources.
- BELLA is web only (React). There is no iOS or Android implementation and no parity data for them. If asked, say there is no data; do not estimate.
- Some CHIP docs describe the April 2026 hackathon demo (47 components, iOS/Android parity, Jira tickets). That scenario is synthetic. Never report its numbers as real; if it is the only match, say it is demo data.
- Jira, Figma, Zeroheight and live Storybook are not connected. Say so if asked about them.

Format (answers are scanned, not read): the first line is the verdict, one sentence, with its key phrase in **bold**. Then at most 3 "- " bullets with the detail, each starting with a short bold label and a colon ("- **Contrast passes:** 373 pairs"), a real number where the sources give one. No headings, no other bold. Under 90 words. Last line: "Next: " then two short follow-up questions the same sources can answer, separated by " | ".`;

// the SYSTEM prompt's fallback line, cut where it starts (a record's answer never carries it)
export const withoutFallback = (t) => String(t).split(/\n?\s*General knowledge, not your sources:/i)[0].trim();

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
  const name = page.match(/^(?:Atlas|Components) · (\w+)$/)?.[1];
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
// A question about the gate, a check or a failure gets the live check
// results as its first source (data/checks, the review card's why and fix),
// so OBI answers from what the gate said tonight, not from the docs' general
// rules. Public BELLA data: it may go to Claude.
const ABOUT_CHECKS = /\b(gate|checks?|fail\w*|pass\w*|contrast|wash|bench|stor(y|ies)|tests?|wee-dote|blocked|merge|baseline)\b/i;
function checksChunk() {
  const { gate, checks, base, head, staged } = listChecks({ waiting: waitingChecks() });
  const lines = [
    `The gate: ${gate.word}. ${gate.summary} Checked on ${base} @ ${head}${staged ? ` plus ${staged.files} staged files` : ''}.`,
    ...checks.map((c) => `${c.name}: ${c.word}. ${(c.status === 'failed' ? c.failures?.join('; ') : c.summary) ?? ''}`),
  ];
  for (const c of checks.filter((x) => x.status === 'failed')) {
    try {
      const card = reviewCard(c.id);
      if (card.why) lines.push(`Why ${c.name.toLowerCase()} fails: ${card.why}`);
      if (card.change?.sentence) lines.push(`The change CHIP proposes: ${card.change.sentence}`);
      if (card.lastAttempt?.rules?.length) lines.push(`Last Accept was refused by the gate: ${card.lastAttempt.rules.map((r) => `${r.story}: ${r.rule} (${r.measured})`).join('; ')}.`);
    } catch {}
  }
  return { title: 'CHIP checks · live', path: 'data/checks', text: lines.join('\n'), score: 1 };
}

async function prepare(message, sessionId, page, { cloud = false, includePrivate = false, record = null } = {}) {
  const id = sessionId || randomUUID();
  // a cloud model sees a locally answered turn only when that answer used no
  // private source (Notion, Cowork, docs); otherwise the pair stays local and
  // the answer says how many were left out. Pairs carry place and private.
  const stored = sessions.get(id) || [];
  const keep = (m) => !cloud || m.place !== 'local' || !m.private;
  const history = stored.filter(keep).map(({ role, content }) => ({ role, content }));
  const keptLocal = cloud ? stored.filter((m) => m.role === 'assistant' && !keep(m)).length : 0;
  const withPage = pointsAt(message, page);
  // asked about one record (History): that record is the only source, so the answer comes from
  // the commit's own words and files, never a guess from other docs
  let found = record ? [] : await retrieve(message, TOP_K * 3, page, withPage); // extra room for the per-page cap and the cloud filters
  let heldBack = 0;
  if (cloud) found = found.filter((c) => !isLocalOnly(c));
  if (cloud && !includePrivate) {
    heldBack = found.filter(isPrivate).length;
    found = found.filter((c) => !isPrivate(c));
  }
  // at most two chunks per page, so one long page can't fill every slot and
  // the answer still hears from the next-best pages
  const perPage = new Map();
  found = found.filter((c) => {
    const n = (perPage.get(keyOf(c)) ?? 0) + 1;
    perPage.set(keyOf(c), n);
    return n <= MAX_PER_PAGE;
  }).slice(0, TOP_K);
  // a page can hand over the thing being asked about (History: the commit's own words) as source 1
  if (record) found = [{ title: record.title, path: `record:${record.id}`, text: record.text, score: 1 }, ...found].slice(0, TOP_K);
  // a record is the only source: the live checks summary never takes its [1] (audit 21 Nov)
  if (!record && ABOUT_CHECKS.test(message)) {
    try {
      found = [checksChunk(), ...found].slice(0, TOP_K);
    } catch {}
  }
  const top = found[0]?.score ?? 0;
  if (top < WEAK_SCORE) {
    return { id, weak: true, top, heldBack, keptLocal, closest: [...numbered(found.slice(0, 3)).values()] };
  }
  const chunks = fitBudget(found);
  const nums = numbered(chunks);
  const context = chunks.map((c) => `[${nums.get(keyOf(c)).n}] ${c.title}\n${c.text}`).join('\n\n---\n\n');
  const where = (withPage ? `The user is looking at: ${page}.\n\n` : '') + (record ? 'Source [1] is the commit the user is looking at: its title, its own description and its files. Explain it in plain words from source [1] only, and put [1] after each claim. "Explain" or "I don\'t understand" means: say what changed and why in simpler words than the commit, for someone who wasn\'t there; don\'t repeat its title. Only if source [1] has nothing on the question, say "The commit doesn\'t say." and stop. Never add a "General knowledge" line here.\n\n' : '');
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
  // each source's full text as the model saw it, for checking what the answer cites
  const texts = new Map();
  for (const c of chunks) {
    const n = nums.get(keyOf(c)).n;
    texts.set(n, `${texts.get(n) ?? ''} ${c.title} ${c.text}`);
  }
  return { id, top, heldBack, keptLocal, messages, turns, sources: [...nums.values()], texts, remember };
}

export async function ask(message, sessionId, page) {
  const prep = await prepare(message, sessionId, page);
  if (prep.weak) return { weak: true, reply: null, sessionId: prep.id, sources: [], closest: prep.closest, top: prep.top };
  const { id, messages, sources, remember } = prep;
  const reply = await chat(messages);
  remember(reply);
  return { reply, sessionId: id, sources };
}

// An answer true to its sources (audit 21 Nov: three bullets all cited [1], which said none of
// them). Each line's pins are checked against the sources' own text: a pin stays where that
// source holds the line's numbers (or, with none, shares its words); otherwise the line is
// pinned to the source that does; a bullet whose numbers no source holds is dropped. The
// verdict keeps its words and loses only pins that don't hold.
const WORD = /[a-z][a-z0-9:./-]{3,}/g;
const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'their', 'there', 'which', 'would', 'could', 'should', 'about', 'into', 'than', 'then', 'them', 'also', 'more', 'most', 'some', 'each', 'every', 'only', 'other', 'were', 'what', 'when', 'where', 'will', 'your', 'bella', 'chip']);
export function checkCitations(reply, texts) {
  if (!texts?.size) return reply;
  const lower = new Map([...texts].map(([n, t]) => [n, t.toLowerCase()]));
  const holds = (n, nums, words) => {
    const t = lower.get(n);
    if (!t) return 0;
    if (nums.length) return nums.every((x) => t.includes(x)) ? 2 : 0;
    return words.filter((w) => t.includes(w)).length >= Math.min(2, words.length) ? 1 : 0;
  };
  return String(reply)
    .split('\n')
    .map((line) => {
      const cited = [...line.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (!cited.length || /^\s*Next:/i.test(line)) return line;
      const bare = line.replace(/\[\d+\]/g, '').replace(/\*\*/g, '');
      const nums = bare.match(/\d[\d.,]*\d|\d/g)?.filter((x) => !/^[0-3]$/.test(x)) ?? [];
      const words = [...new Set((bare.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)))];
      const good = [...new Set(cited.filter((n) => holds(n, nums, words)))];
      const bullet = /^\s*[-*•]\s/.test(line);
      let keep = good;
      if (!keep.length) {
        const best = [...lower.keys()].map((n) => [n, holds(n, nums, words)]).filter(([, h]) => h).sort((a, b) => b[1] - a[1])[0];
        keep = best ? [best[0]] : [];
      }
      if (!keep.length && bullet && nums.length) return null; // a number no source holds: never shown
      const pins = keep.map((n) => `[${n}]`).join('');
      // the pins go where the model put its first one
      const at = line.search(/\s*\[\d+\]/);
      const without = line.replace(/\s*\[\d+\]/g, '');
      return pins ? `${without.slice(0, at)} ${pins}${without.slice(at)}`.replace(/\s+$/, '') : without;
    })
    .filter((l) => l != null)
    .join('\n');
}

// For each claim, the sentence of its source's own text that backs it (audit 21 Nov: the
// opened source led with its heading, then with one line per source for every bullet): each
// source gets backsFor, one { claim, line } per line of the answer that cites it, and backs,
// its first. Never a sentence the source doesn't hold.
function bestSentence(text, claim) {
  const low = claim.replace(/\[\d+\]|\*\*/g, '').toLowerCase();
  const want = [...new Set((low.match(WORD) ?? []).filter((w) => !STOP.has(w)))];
  const nums = low.match(/\d[\d.,]*\d|\d/g)?.filter((x) => !/^[0-3]$/.test(x)) ?? [];
  if (!want.length && !nums.length) return null;
  const best = String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((t) => t.replace(/^[#>*\-\s|]+/, '').trim())
    .filter((t) => t.length > 12 && t.length < 240)
    .map((t) => {
      const l = t.toLowerCase();
      return [t, want.filter((w) => l.includes(w)).length + 2 * nums.filter((x) => l.includes(x)).length];
    })
    .sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}
export function backingLines(reply, texts) {
  const out = new Map();
  if (!texts?.size) return out;
  const lines = String(reply).split('\n').filter((l) => /\[\d+\]/.test(l));
  for (const [n, text] of texts) {
    const backsFor = lines
      .filter((l) => l.includes(`[${n}]`))
      .map((l) => ({ claim: l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim(), line: bestSentence(text, l) }))
      .filter((b) => b.line);
    if (backsFor.length) out.set(n, { backs: backsFor[0].line, backsFor });
  }
  return out;
}

// Streaming: { type: 'provider' } (who answers), { type: 'private' } when
// Notion sources were held back from the cloud, { type: 'sources' }, then
// { type: 'token' } pieces and { type: 'done' }. A weak best match yields one
// { type: 'weak', closest } and no model call. If Claude cannot answer, a
// { type: 'fallback', reason } precedes the local model's answer.
// opts: { provider: 'local:<model>' | 'claude', includePrivate, record: { id, title, text } }
export async function* askStream(message, sessionId, page, opts = {}) {
  let { provider, model } = resolve(opts.provider);
  const prep = await prepare(message, sessionId, page, { cloud: provider.place === 'cloud', includePrivate: opts.includePrivate, record: opts.record });
  if (prep.heldBack) yield { type: 'private', heldBack: prep.heldBack };
  if (prep.keptLocal) yield { type: 'kept', count: prep.keptLocal };
  if (prep.weak) {
    yield { type: 'weak', closest: prep.closest, top: prep.top, sessionId: prep.id };
    return;
  }
  let { id, turns, sources, texts, remember } = prep;
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
    const again = await prepare(message, id, page, { record: opts.record });
    if (!again.weak) {
      ({ turns, sources, texts, remember } = again);
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
  // asked about one record, the answer is that record's only: a "General knowledge" line goes,
  // and with it anything after it (audit 21 Nov: "General knowledge, not your sources: The commit doesn't say.")
  if (opts.record) reply = withoutFallback(reply);
  // the "Next:" line is the follow-up questions, never part of the answer: it goes out on its own
  const next = (reply.match(/^\s*Next:\s*(.+)$/im)?.[1] ?? '').split('|').map((q) => q.replace(/\*\*/g, '').trim()).filter((q) => q.length > 3 && q.length < 80).slice(0, 2);
  reply = checkCitations(reply.replace(/^\s*Next:.*$/gim, ''), texts);
  const backs = backingLines(reply, texts);
  sources = sources.map((x) => (backs.has(x.n) ? { ...x, ...backs.get(x.n) } : x));
  yield { type: 'done', next, reply: reply.trim(), sessionId: id, sources, provider: provider.id, place: provider.place, model: modelName, tokens: { prompt: stats.prompt ?? 0, output: stats.output ?? 0 } };
}
