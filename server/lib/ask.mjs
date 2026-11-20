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
import { BELLA_JSON, CHIP_CONTEXT_WORDS, CONTEXT_PACK } from './config.mjs';

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
- If the sources do not answer the question, say plainly: "Nothing in my sources covers that." Then stop. Never add general knowledge.
- Never invent data: no numbers, percentages, ticket IDs, dates, people or platform status that are not in the sources.
- BELLA is web only (React). There is no iOS or Android implementation and no parity data for them. If asked, say there is no data; do not estimate.
- Some CHIP docs describe the April 2026 hackathon demo (47 components, iOS/Android parity, Jira tickets). That scenario is synthetic. Never report its numbers as real; if it is the only match, say it is demo data.
- Jira, Figma, Zeroheight and live Storybook are not connected. Say so if asked about them.

Format (answers are scanned, not read): the first line is the verdict, one sentence, with its key phrase in **bold**. Then at most 3 "- " bullets with the detail, each starting with a short bold label and a colon ("- **Label:** the fact"), with numbers only as the sources give them, never from this example.
- The verdict states the key fact the bullets rest on. Never write "not stated" or "not mentioned" in a verdict whose bullets give facts. No headings, no other bold. Under 90 words. Last line: "Next: " then two short follow-up questions the same sources can answer, separated by " | ".`;

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
    texts.set(n, `${texts.get(n) ?? ''} ${c.text}`); // the source's own words, never its title
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
const WORD = /[a-z][a-z0-9:./-]{2,}[a-z0-9]/g; // a word never ends in its punctuation ("selection.")
const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'their', 'there', 'which', 'would', 'could', 'should', 'about', 'into', 'than', 'then', 'them', 'also', 'more', 'most', 'some', 'each', 'every', 'only', 'other', 'were', 'what', 'when', 'where', 'will', 'your', 'bella', 'chip']);
export function checkCitations(reply, texts) {
  return checkClaims(reply, texts).reply;
}
export function checkClaims(reply, texts) {
  const backs = new Map(); // n -> [{ claim, line }]: the source's own line each kept claim rests on
  if (!texts?.size) return { reply, backs };
  // "no failing" is passing: a double negative never reads as a fault (audit 21 Nov: "missing
  // contrast-pairs checks" was pinned to "no failing contrast pair … (contrast-pairs: OK)")
  const polar = (t) => String(t).toLowerCase().replace(/\bno (failing|failed|fails?|errors?|gaps?)\b/g, 'passing');
  const NEG = /\b(missing|lacks?|lacking|without|no|not|fails?|failed|failing|unchecked|none|never)\b/;
  const POS = /\b(ok|pass(es|ed|ing)?|true|all)\b/;
  const content = (t) => [...new Set((String(t).toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)))];
  // names (PascalCase parts), quoted phrases and numbers a claim states: its line must hold each one
  const musts = (t) => [
    ...(t.match(/\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g) ?? []),
    ...[...t.matchAll(/["“`]([^"”`]{3,})["”`]/g)].map((m) => m[1]),
    ...(t.match(/\d[\d.,]*\d|\d/g)?.filter((x) => !/^[0-3]$/.test(x)) ?? []),
  ].map((x) => x.toLowerCase());
  // a source's lines: each sentence with the one before it in the same list item or paragraph,
  // so a claim is checked against what one place in the source says, never the whole page
  const items = new Map(
    [...texts].map(([n, t]) => [
      n,
      String(t)
        .split(/\n+|\s+[-*•]\s+(?=\S)/)
        .flatMap((item) => {
          const ss = item.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
          return ss.map((x, i) => (i ? `${ss[i - 1]} ${x}` : x));
        })
        .filter((x) => x.length > 8),
    ]),
  );
  // one clause is held by one line of the source: every name, quote and number in it, most of its
  // words, and never the opposite of what the line says
  const held = (n, clause) => {
    const want = content(clause);
    const need = musts(clause);
    if (!want.length && !need.length) return ''; // a bare label or connective
    return (items.get(n) ?? []).find((line) => {
      const low = line.toLowerCase();
      if (!need.every((x) => low.includes(x))) return false;
      if (want.length && want.filter((w) => low.includes(w)).length / want.length < 0.6) return false;
      const c = polar(clause), l = polar(line);
      if (NEG.test(c) && !NEG.test(l) && POS.test(l)) return false;
      if (!NEG.test(c) && POS.test(c) && NEG.test(l) && !POS.test(l)) return false;
      return true;
    }) ?? null;
  };
  // what the opened source shows: of the two sentences that held it, the one that holds the claim
  // (both only when its names, quotes and numbers are split across them), starting at a sentence
  const shownLine = (unit, claim) => {
    // a first sentence that starts mid-way (lower case, a chunk cut in two) is never shown
    const all = unit.split(/(?<=[.!?])\s+/).filter(Boolean);
    const ss = all.length > 1 && /^[a-z)]/.test(all[0]) ? all.slice(1) : all;
    if (ss.length < 2) return ss[0] ?? unit;
    const want = content(claim);
    const need = musts(claim);
    const score = (x) => want.filter((w) => x.toLowerCase().includes(w)).length + 2 * need.filter((m) => x.toLowerCase().includes(m)).length;
    const best = ss.reduce((a, x) => (score(x) > score(a) ? x : a));
    return need.every((m) => best.toLowerCase().includes(m)) ? best : ss.join(' ');
  };
  // a line's claim as its label and clauses; what a source holds of it, or null
  const keepFor = (n, line) => {
    const lead = line.match(/^\s*(?:[-*•]\s+)?(?:\*\*[^*]+\*\*:?\s*)?/)[0];
    const body = line.slice(lead.length).replace(/\s*\[\d+\]/g, '').replace(/\s+$/, '');
    const end = /[.!?]$/.test(body) ? body.slice(-1) : '';
    const clauses = (end ? body.slice(0, -1) : body).split(/;\s+/);
    const label = lead.replace(/^\s*[-*•]\s+/, '').replace(/\*\*|:/g, ' ');
    const lines = [];
    const kept = clauses.filter((c) => {
      const claim = `${label} ${c.replace(/\*\*/g, '')}`;
      const line = held(n, claim);
      if (line) lines.push(shownLine(line, claim));
      return line != null;
    });
    if (!kept.length) return null;
    // never two full stops: the kept words lose their own end mark, the claim gets one
    let text = kept.join('; ').replace(/[.!?]+(\**)$/, '$1');
    // a bold the model left open (or closed twice) never shows its stars
    if (((lead + text).match(/\*\*/g) ?? []).length % 2) text = text.replace(/\*\*(?=[^*]*$)/, '');
    return { lead, text, end: end || '.', lines: [...new Set(lines)] };
  };
  let verdictDropped = false;
  const out = [];
  for (const line of String(reply).split('\n')) {
    if (!line.trim() || /^\s*(?:[-*•]\s*)?\**Next\**:/i.test(line)) continue;
    const bullet = /^\s*[-*•]\s/.test(line);
    const cited = [...new Set([...line.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
    // the sources it cites first, then any other that holds it; one pin, the first that does
    let got = null;
    for (const n of [...cited, ...[...texts.keys()].filter((k) => !cited.includes(k))]) {
      const k = keepFor(n, line);
      if (k) {
        got = { n, ...k };
        break;
      }
    }
    // a claim no source line holds is never shown: a bullet goes, a verdict gives way to its first held bullet
    if (!got) {
      if (!bullet) verdictDropped = true;
      continue;
    }
    const shown = `${got.lead}${got.text} [${got.n}]${got.end}`;
    out.push(shown);
    // the line her pin opens is the one that held this claim, nothing else
    if (got.lines.length) backs.set(got.n, [...(backs.get(got.n) ?? []), { claim: shown.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim(), line: got.lines.join(' … ') }]);
  }
  if (verdictDropped || !out.length || /^\s*[-*•]\s/.test(out[0])) {
    const b = out.findIndex((l) => /^\s*[-*•]\s/.test(l));
    if (b < 0) return { reply: out.length ? out.join('\n') : 'Nothing in my sources covers that.', backs };
    const first = out[b].replace(/^\s*[-*•]\s+/, '');
    return { reply: [first, ...out.filter((_, k) => k !== b)].join('\n'), backs };
  }
  return { reply: out.join('\n'), backs };
}

// A verdict that hedges ("not directly stated") over bullets that state facts: the first bullet's
// fact becomes the verdict, its label the key phrase (chip-code, 21 Nov).
const HEDGE = /\b(not (directly |explicitly )?(stated|mentioned|specified|covered)|(sources|they) (do not|don['’]t) (say|state))\b/i;
export function verdictFirst(reply) {
  const lines = String(reply).split('\n');
  const v = lines.findIndex((l) => l.trim() && !/^\s*[-*•]\s/.test(l));
  const b = lines.findIndex((l) => /^\s*[-*•]\s/.test(l));
  if (v < 0 || b < 0 || !HEDGE.test(lines[v])) return reply;
  const first = lines[b].replace(/^\s*[-*•]\s+/, '');
  return [first, ...lines.filter((_, i) => i !== v && i !== b)].join('\n');
}

// Streaming: { type: 'provider' } (who answers), { type: 'private' } when
// Notion sources were held back from the cloud, { type: 'sources' }, then
// { type: 'token' } pieces and { type: 'done' }. A weak best match yields one
// { type: 'weak', closest } and no model call. If Claude cannot answer, a
// { type: 'fallback', reason } precedes the local model's answer.
// opts: { provider: 'local:<model>' | 'claude', includePrivate, record: { id, title, text } }
// Questions CHIP's own data answers are answered from that data, never by a model (audit 21 Nov:
// "Which components lack a11y notes?" got two parts that have them). One router for every chat
// surface, since Ask BELLA, the terminal chat and every page ask through here: which parts lack
// (or have) a story, docs, a spec entry, a contract or a11y notes, how many, and which gates fail.
// Anything else goes to the model. The answer is in the answer shape, its one source is
// data/bella.json with a mark per part, and its follow-ups are questions this router answers.
const CHECKS = [
  { key: 'hasA11yNotes', words: /\b(a11y|accessibility)( notes?)?\b/i, noun: 'a11y notes' },
  { key: 'hasStory', words: /\bstor(y|ies)\b/i, noun: 'a story' },
  { key: 'hasDocs', words: /\bdoc(s|umentation| pages?)?\b/i, noun: 'a doc page' },
  { key: 'inDsds', words: /\b(spec|dsds)\b/i, noun: 'a spec entry' },
  { key: 'hasContract', words: /\bcontracts?\b/i, noun: 'a contract' },
];
const PARTS = /\b(components?|parts?)\b/i;
const LACK = /\b(lack|lacks|lacking|missing|miss|without|no|don['’]?t have|do not have|doesn['’]?t have|need|needs)\b/i;
const HAVE = /\b(have|has|with)\b/i;
// the contrast gate in the words its numbers allow: "429 checks across 105 pairs in 4 themes, OK"
const contrastWords = (cp) => {
  const themes = String(cp.summary ?? '').match(/across (\d+) themes/)?.[1];
  const ok = cp.ok === false ? 'failing' : 'OK';
  return cp.checked != null && cp.pairs != null ? `${cp.checked} checks across ${cp.pairs} pairs${themes ? ` in ${themes} themes` : ''}, ${ok}` : String(cp.summary ?? '').replace(/^contrast pairs:\s*/i, '').split(';')[0];
};
const list = (names, max = 6) => (names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', '));
// the readiness stations, by the words a question uses for them
const STATIONS = [
  ['a11y', /\b(a11y|accessib\w*)\b/i],
  ['coverage', /\bcoverage\b/i],
  ['best-practices', /\bbest practices?\b/i],
  ['shared-language', /\bshared language\b/i],
  ['testing', /\btest(ing|s)?\b/i],
  ['orchestration', /\borchestration\b/i],
  ['governance', /\bgovernance\b/i],
  ['machine-readable', /\bmachine.?readable\b/i],
  ['agent-access', /\bagent access\b/i],
  ['docs', /\bdocs?\b/i],
];
export function dataAnswer(message) {
  const q = String(message ?? '');
  if (!existsSync(BELLA_JSON)) return null;
  let d;
  try {
    d = JSON.parse(readFileSync(BELLA_JSON, 'utf8'));
  } catch {
    return null;
  }
  const when = d.source?.committedAt ?? null;
  const source = (findings, passage, backsFor) => ({ n: 1, title: 'BELLA data (data/bella.json)', path: 'data/bella.json', when, passage, findings, score: 1, ...(backsFor ? { backsFor } : {}) });
  // a data answer's claim and the data line it rests on, for the pin on that claim (audit 21 Nov:
  // "A11y: 61%" and "Contrast" opened the parts list, not their own lines)
  const claimOf = (line) => line.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim();
  // a station's score: what it is, and how to raise it (her mock: "Add a11y notes to ScaledFrame and SectionHeader")
  if (/\bscore\b/i.test(q) && /\b(raise|improve|increase|boost|fix|lift|why|what|how)\b/i.test(q)) {
    const id = STATIONS.find(([, re]) => re.test(q))?.[0];
    const st = (d.stations ?? []).find((x) => x.id === id);
    if (st) {
      if (id === 'a11y') {
        const parts = d.components ?? [];
        const without = parts.filter((c) => !c.hasA11yNotes).map((c) => c.name);
        const cp = d.gates?.contrastPairs;
        // said truly (audit 21 Nov): checks across pairs, never "N pairs pass" (429 checks are 105 pairs in 4 themes)
        const contrast = cp ? contrastWords(cp) : null;
        const findings = [...without.slice(0, 8).map((n) => ({ text: `**${n}** has no a11y notes`, ok: false })), ...(without.length > 8 ? [{ text: `${without.length - 8} more without a11y notes`, ok: false }] : []), { text: `**${parts.length - without.length} others** have a11y notes`, ok: true }, ...(cp ? [{ text: `Contrast pairs: ${contrast}`, ok: cp.ok !== false }] : [])];
        const a11yLine = `- **A11y:** ${st.score}%${/^(\d+)\/(\d+)/.test(st.basis) ? `, ${st.basis.match(/^(\d+)\/(\d+)/)[1]} of ${st.basis.match(/^(\d+)\/(\d+)/)[2]} parts have a11y notes and no failing contrast pair` : ''} [1].`;
        const contrastLine = cp ? `- **Contrast:** ${contrast} [1].` : null;
        const reply = [without.length ? `**Add a11y notes** to the ${without.length} parts without them [1].` : `**Every part has a11y notes** [1].`, a11yLine, without.length ? `- **Without notes:** ${list(without)} [1].` : null, contrastLine].filter(Boolean).join('\n');
        const backsFor = [{ claim: claimOf(a11yLine), line: `A11y station: ${st.score}% (${st.assessment}). ${st.basis}.`, ok: st.score >= 90 }, ...(cp ? [{ claim: claimOf(contrastLine), line: `Contrast pairs: ${contrastWords(cp)}${/exempt/i.test(cp.summary ?? '') ? `; ${String(cp.summary).split(';').slice(1).join(';').trim()}` : ''}`, ok: cp.ok !== false }] : [])];
        return { reply, sources: [source(findings, `A11y station: ${st.score}% (${st.assessment}). ${st.basis}.`, backsFor)], next: ['Which parts lack a11y notes?', 'Which gates fail?'] };
      }
      const reply = st.score == null
        ? `**${st.name} has no score**: it is ${st.assessment} [1].\n- **Why:** ${st.basis} [1].`
        : `**${st.name} is at ${st.score}%** [1].\n- **Measured:** ${st.basis} [1].`;
      return { reply, sources: [source([{ text: `**${st.name}**: ${st.score == null ? 'no score' : `${st.score}%`} (${st.assessment})`, ok: st.score != null && st.score >= 90 }, { text: st.basis }], `${st.name}: ${st.basis}.`)], next: ['How could BELLA raise its A11y score?', 'Which gates fail?'] };
    }
  }
  // the contrast gate: how many, does it pass (the model once said "429 pairs pass"; it is 429 checks across 105 pairs)
  if (/\bcontrast\b/i.test(q) && /\b(how many|pass|passes|passing|fail|fails|failing|status|ok|checked)\b/i.test(q) && d.gates?.contrastPairs) {
    const cp = d.gates.contrastPairs;
    const exempt = String(cp.summary ?? '').match(/(\d+) exempt/)?.[1];
    const reply = [`**${contrastWords(cp)}** [1].`, exempt ? `- **Exempt:** ${exempt} by the inset rule, every consumer classified [1].` : null].filter(Boolean).join('\n');
    return { reply, sources: [source([{ text: `**Contrast pairs:** ${contrastWords(cp)}`, ok: cp.ok !== false }, ...(exempt ? [{ text: `${exempt} exempt by the inset rule` }] : [])], String(cp.summary ?? ''))], next: ['Which gates fail?', 'How could BELLA raise its A11y score?'] };
  }
  if (!/\b(which|what|how many|list|count)\b/i.test(q)) return null;
  // which gates fail: CHIP's own checks, the one source Health's Gate card reads (audit 21 Nov:
  // Ask said "All 3 gates" from data/bella.json while Health said 5 of 5)
  if (/\bgates?\b/i.test(q) && /\b(fail|failing|failed|red|broken)\b/i.test(q)) {
    let g;
    try {
      ({ gate: g } = listChecks({ waiting: waitingChecks() }));
    } catch {
      return null;
    }
    const members = g?.members ?? [];
    if (!members.length) return null;
    const WORD = { passed: 'passed', failed: 'failed', waiting: 'waiting on you', 'not-run': 'not run yet', running: 'running' };
    const bad = members.filter((m) => m.status === 'failed' || m.status === 'waiting');
    const notRun = members.filter((m) => m.status === 'not-run');
    const findings = members.map((m) => ({ text: `${m.name}: ${WORD[m.status] ?? m.status}`, ok: m.status === 'passed' }));
    const of = members.length;
    const reply = bad.length
      ? `**${bad.length} of ${of}** gate checks fail [1].\n- **Failing:** ${list(bad.map((m) => m.name))} [1].`
      : notRun.length
        ? `**${g.counts.passed} of ${of}** gate checks pass; ${notRun.length} not run yet [1].\n- **Not run yet:** ${list(notRun.map((m) => m.name))} [1].`
        : `**All ${of}** gate checks pass [1].\n- **Checks:** ${list(members.map((m) => m.name))} [1].`;
    const src = { n: 1, title: 'CHIP checks (the gate)', path: 'Health · Gate card', when: g.ranAt ?? when, passage: findings.map((f) => f.text).join(' · '), findings, score: 1 };
    return { reply, sources: [src], next: ['Which parts lack a11y notes?', 'How many parts lack a story?'] };
  }
  if (!PARTS.test(q)) return null;
  const check = CHECKS.find((c) => c.words.test(q));
  if (!check) return null;
  const parts = d.components ?? [];
  const lacking = parts.filter((c) => !c[check.key]).map((c) => c.name);
  const having = parts.filter((c) => c[check.key]).map((c) => c.name);
  const wantHave = !LACK.test(q) && HAVE.test(q);
  const shown = wantHave ? having : lacking;
  const findings = [...lacking.slice(0, 8).map((n) => ({ text: `**${n}** has no ${check.noun.replace(/^an? /, '')}`, ok: false })), ...(lacking.length > 8 ? [{ text: `${lacking.length - 8} more without`, ok: false }] : []), { text: `**${having.length} others** have ${check.noun}`, ok: true }];
  const verdict = shown.length
    ? `**${shown.length} of ${parts.length} parts** ${wantHave ? 'have' : 'lack'} ${check.noun} [1].`
    : `**No part** ${wantHave ? 'has' : 'lacks'} ${check.noun} [1].`;
  const bullets = shown.length ? [`- **${wantHave ? 'With' : 'Without'}:** ${list(shown)} [1].`, `- **${wantHave ? 'Without' : 'With'}:** ${wantHave ? lacking.length : having.length} parts [1].`] : [];
  // the count bullet opens its own count; the list and the verdict open the parts, one mark each
  const countLine = bullets[1] ? [{ claim: claimOf(bullets[1]), line: `${wantHave ? lacking.length : having.length} of ${parts.length} parts ${wantHave ? 'have no' : 'have'} ${wantHave ? check.noun.replace(/^an? /, '') : check.noun}.`, ok: !wantHave }] : undefined;
  const others = CHECKS.filter((c) => c !== check).slice(0, 2).map((c) => `Which parts lack ${c.noun}?`);
  return { reply: [verdict, ...bullets].join('\n'), sources: [source(findings, `${parts.length} parts in BELLA ${d.source?.version ?? ''} (${d.source?.commit ?? ''}). ${check.key}: ${having.length} true, ${lacking.length} false.`, countLine)], next: others };
}

export async function* askStream(message, sessionId, page, opts = {}) {
  // CHIP's data first: a question it answers never reaches a model (no record question: that is about one change)
  const fromData = opts.record ? null : dataAnswer(message);
  if (fromData) {
    yield { type: 'sources', sources: fromData.sources, sessionId };
    yield { type: 'provider', id: 'data', place: 'data', model: 'CHIP’s data' };
    yield { type: 'done', next: fromData.next, reply: fromData.reply, sessionId, sources: fromData.sources, provider: 'data', place: 'data', model: 'CHIP’s data', tokens: { prompt: 0, output: 0 } };
    return;
  }
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
  reply = withoutFallback(reply); // every answer is its sources' only, never "General knowledge"
  // the "Next:" line is the follow-up questions, never part of the answer: it goes out on its own
  // follow-ups stay on the question's topic: each shares a word with what she asked
  const asked = new Set((String(message).toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)));
  const next = (reply.match(/^\s*(?:[-*•]\s*)?\**Next\**:\**\s*(.+)$/im)?.[1] ?? '')
    .split('|')
    .map((q) => q.replace(/\*\*/g, '').trim())
    .filter((q) => q.length > 3 && q.length < 80 && (q.toLowerCase().match(WORD) ?? []).some((w) => asked.has(w)))
    // only a follow-up CHIP's data answers (audit 21 Nov: "the maximum allowed contrast ratio" has no answer)
    .filter((q) => dataAnswer(q));
  // none left: the data router's own questions on what was asked
  const TOPICS = [
    [/\b(a11y|accessib\w*)\b/i, 'Which parts lack a11y notes?'],
    [/\bcontrast\b/i, 'Which gates fail?'],
    [/\bstor(y|ies)\b/i, 'Which parts lack a story?'],
    [/\bdocs?\b/i, 'Which parts lack a doc page?'],
    [/\bcontracts?\b/i, 'Which parts lack a contract?'],
    [/\b(spec|dsds)\b/i, 'Which parts lack a spec entry?'],
    [/\b(score|station|readiness)\b/i, 'How could BELLA raise its A11y score?'],
  ];
  for (const [re, q] of TOPICS) if (next.length < 2 && re.test(`${message} ${reply}`) && !next.includes(q) && q.toLowerCase() !== String(message).trim().toLowerCase()) next.push(q);
  next.splice(2);
  const checked = checkClaims(reply.replace(/^\s*(?:[-*•]\s*)?\**Next\**:.*$/gim, ''), texts);
  reply = checked.reply;
  reply = verdictFirst(reply);
  sources = sources.map((x) => (checked.backs.has(x.n) ? { ...x, backs: checked.backs.get(x.n)[0].line, backsFor: checked.backs.get(x.n) } : x));
  yield { type: 'done', next, reply: reply.trim(), sessionId: id, sources, provider: provider.id, place: provider.place, model: modelName, tokens: { prompt: stats.prompt ?? 0, output: stats.output ?? 0 } };
}
