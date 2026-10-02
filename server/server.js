// CHIP local server: serves the bridge and answers POST /ask with the local
// model over the local index. Nothing here calls a paid or remote API.
import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { ROOT, PORT, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL } from './lib/config.mjs';
import { ask, askStream } from './lib/ask.mjs';
import { warm } from './lib/llm.js';
import { loadIndex } from './lib/index.mjs';

const app = express();
app.use(express.json());

// Local-only server; reflect every origin including null (file:// pages).
app.use(cors({ origin: true, credentials: false }));

// The bridge at /, real BELLA data at /data (the bridge loads ../../../data/bella.js)
app.use(express.static(join(ROOT, 'docs/artifacts/chip-bridge-v0')));
app.use('/data', express.static(join(ROOT, 'data'), { index: false }));

app.get('/health', (_req, res) => {
  const index = loadIndex();
  res.json({ ok: true, model: CHIP_MODEL, embedModel: CHIP_EMBED_MODEL, ollama: OLLAMA_URL,
    chunks: index ? index.chunks.length : 0, indexedAt: index ? index.builtAt : null });
});

// Contract: { message, sessionId } -> { reply, sessionId, sources: [{ title, url | path }] }
// With { stream: true }: NDJSON lines, { type: 'sources' } then { type: 'token', text }
// pieces, then { type: 'done', reply, sessionId, sources } (or { type: 'error' }).
app.post('/ask', async (req, res) => {
  const { message, sessionId, stream } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (stream) {
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    try {
      for await (const ev of askStream(message.trim(), sessionId)) res.write(JSON.stringify(ev) + '\n');
    } catch (err) {
      console.error('[CHIP server]', err.message);
      res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n');
    }
    return res.end();
  }
  try {
    res.json(await ask(message.trim(), sessionId));
  } catch (err) {
    console.error('[CHIP server]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Bound to localhost: nothing on the network can reach /ask.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[CHIP] http://localhost:${PORT} · model ${CHIP_MODEL} · embeddings ${CHIP_EMBED_MODEL} · ${OLLAMA_URL}`);
  const t = Date.now();
  warm().then(() => console.log(`[CHIP] models warm (${((Date.now() - t) / 1000).toFixed(1)}s)`))
    .catch((err) => console.error('[CHIP] warm-up failed:', err.message));
});
