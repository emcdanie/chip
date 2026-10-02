// Ask CHIP: retrieve top chunks from the local index, answer with the local
// model. Shared by the server (POST /ask) and the terminal (chip ask).
// Rules ported from server/AGENT_PROMPT.md, minus the Notion MCP protocol:
// Notion is now synced into the index, so retrieval replaces tool calls.
import { randomUUID } from 'node:crypto';
import { search } from './index.mjs';
import { chat, chatStream } from './llm.js';
import { CHIP_CONTEXT_WORDS } from './config.mjs';

const TOP_K = 6;
const HISTORY_TURNS = 4; // messages kept per session (user + assistant); short keeps the prompt fast

const SYSTEM = `You are CHIP, a design systems assistant for Elleta, who runs the BELLA design system.

Tone: spare, declarative. No filler, no preamble, no praise, no emoji, no trailing offers. State the finding, then the implication.

Answer ONLY from the sources in the message (each starts with "Source: <title>"). Rules:
- Cite the source title in brackets for every claim, e.g. [BELLA health (data/bella.json)]. Never cite by number.
- If the sources do not answer the question, say plainly: "Nothing in my sources covers that." Then stop, or add one line marked "General knowledge, not your sources:".
- Never invent data: no numbers, percentages, ticket IDs, dates, people or platform status that are not in the sources.
- BELLA is web only (React). There is no iOS or Android implementation and no parity data for them. If asked, say there is no data; do not estimate.
- Some CHIP docs describe the April 2026 hackathon demo (47 components, iOS/Android parity, Jira tickets). That scenario is synthetic. Never report its numbers as real; if it is the only match, say it is demo data.
- Jira, Figma, Zeroheight and live Storybook are not connected. Say so if asked about them.

Format: markdown, under 200 words unless the question needs more. Bold sparingly, "- " bullets.`;

const sessions = new Map(); // sessionId -> [{ role, content }]

function sourceList(chunks) {
  const seen = new Map();
  for (const c of chunks) {
    const key = c.url || c.path;
    if (!seen.has(key)) seen.set(key, c.url ? { title: c.title, url: c.url } : { title: c.title, path: c.path });
  }
  return [...seen.values()];
}

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

async function prepare(message, sessionId) {
  const id = sessionId || randomUUID();
  const history = sessions.get(id) || [];
  const chunks = fitBudget(await search(message, TOP_K));
  const context = chunks.map((c) => `Source: ${c.title}\n${c.text}`).join('\n\n---\n\n');
  const messages = [{ role: 'system', content: SYSTEM }, ...history,
    { role: 'user', content: `Sources:\n\n${context}\n\n===\n\nQuestion: ${message}` }];
  const remember = (reply) => // history keeps the bare question, not the sources
    sessions.set(id, [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-HISTORY_TURNS));
  return { id, messages, sources: sourceList(chunks), remember };
}

export async function ask(message, sessionId) {
  const { id, messages, sources, remember } = await prepare(message, sessionId);
  const reply = await chat(messages);
  remember(reply);
  return { reply, sessionId: id, sources };
}

// Streaming: { type: 'sources' } first, then { type: 'token' } pieces, then { type: 'done' }.
export async function* askStream(message, sessionId) {
  const { id, messages, sources, remember } = await prepare(message, sessionId);
  yield { type: 'sources', sources, sessionId: id };
  let reply = '';
  for await (const text of chatStream(messages)) { reply += text; yield { type: 'token', text }; }
  remember(reply.trim());
  yield { type: 'done', reply: reply.trim(), sessionId: id, sources };
}
