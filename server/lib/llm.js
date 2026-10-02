// Local model over the Ollama HTTP API. Chat and embeddings; nothing leaves
// the machine. Model names and URL come from server/.env via config.mjs.
import { OLLAMA_URL, CHIP_MODEL, CHIP_EMBED_MODEL } from './config.mjs';

async function post(path, body) {
  let res;
  try {
    res = await fetch(OLLAMA_URL + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Ollama not reachable at ${OLLAMA_URL} (is it running? \`ollama serve\`)`);
  }
  if (!res.ok) throw new Error(`Ollama ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// messages: [{ role: 'system' | 'user' | 'assistant', content }]
export async function chat(messages, { numCtx = 8192, temperature = 0.2 } = {}) {
  const data = await post('/api/chat', {
    model: CHIP_MODEL,
    messages,
    stream: false,
    think: false,
    options: { num_ctx: numCtx, temperature },
  });
  return (data.message?.content || '').trim();
}

// nomic-embed-text expects task prefixes: search_document / search_query
export async function embed(texts, kind = 'document') {
  const prefix = kind === 'query' ? 'search_query: ' : 'search_document: ';
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const data = await post('/api/embed', { model: CHIP_EMBED_MODEL, input: texts.slice(i, i + 32).map((t) => prefix + t) });
    out.push(...data.embeddings);
  }
  return out;
}

export async function listModels() {
  const res = await fetch(OLLAMA_URL + '/api/tags').catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()).models.map((m) => m.name);
}

export { CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL };
