// Local model over the Ollama HTTP API. Chat (blocking or streamed) and
// embeddings; nothing leaves the machine. Settings come from config.mjs.
import { OLLAMA_URL, CHIP_MODEL, CHIP_EMBED_MODEL, CHIP_KEEP_ALIVE, CHIP_NUM_CTX } from './config.mjs';

async function request(path, body) {
  let res;
  try {
    res = await fetch(OLLAMA_URL + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keep_alive: CHIP_KEEP_ALIVE, ...body }),
    });
  } catch {
    throw new Error(`Ollama not reachable at ${OLLAMA_URL} (is it running? \`ollama serve\`)`);
  }
  if (!res.ok) throw new Error(`Ollama ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

const chatBody = (messages, stream, model = CHIP_MODEL) => ({
  model, messages, stream, think: false,
  options: { num_ctx: CHIP_NUM_CTX, temperature: 0.2 },
});

// messages: [{ role: 'system' | 'user' | 'assistant', content }]
export async function chat(messages) {
  const data = await (await request('/api/chat', chatBody(messages, false))).json();
  return (data.message?.content || '').trim();
}

// Yields text pieces as the model generates them (Ollama streams NDJSON).
// model: any installed Ollama model (the picker's choice); CHIP_MODEL by default
export async function* chatStream(messages, model) {
  const res = await request('/api/chat', chatBody(messages, true, model));
  const decoder = new TextDecoder();
  let buf = '';
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error('Ollama: ' + msg.error);
      if (msg.message?.content) yield msg.message.content;
    }
  }
}

// nomic-embed-text expects task prefixes: search_document / search_query
export async function embed(texts, kind = 'document') {
  const prefix = kind === 'query' ? 'search_query: ' : 'search_document: ';
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const res = await request('/api/embed', { model: CHIP_EMBED_MODEL, input: texts.slice(i, i + 32).map((t) => prefix + t) });
    out.push(...(await res.json()).embeddings);
  }
  return out;
}

// Load both models into memory so the first question doesn't pay for it.
export async function warm() {
  await Promise.all([
    request('/api/chat', { ...chatBody([], false) }).then((r) => r.json()),
    embed(['warm'], 'query'),
  ]);
}

export async function listModels() {
  const res = await fetch(OLLAMA_URL + '/api/tags').catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()).models.map((m) => m.name);
}

export { CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL };
