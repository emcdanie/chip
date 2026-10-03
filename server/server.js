// CHIP local server: serves the app and answers POST /ask with the local
// model over the local index. Nothing here calls a paid or remote API.
import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, PORT, CHIP_MODEL, CHIP_EMBED_MODEL, OLLAMA_URL } from './lib/config.mjs';
import { ask, askStream } from './lib/ask.mjs';
import { warm } from './lib/llm.js';
import { loadIndex } from './lib/index.mjs';

const app = express();
app.use(express.json());

// Local-only server; reflect every origin including null (file:// pages).
app.use(cors({ origin: true, credentials: false }));

// The built app (npm run app:build) at /, real BELLA data at /data. The old
// static bridge is archived in docs/archive/chip-bridge-v0.
app.use(express.static(join(ROOT, 'app/dist')));
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

// POST /cmd runs one of the four chip commands and streams its output as
// plain text, ending with "[exit N]". Only these four, as an argv to node
// bin/chip.mjs: no shell, no other programs. One at a time. A page on another
// origin can't drive it (the browser sends its Origin; anything not this
// app's is refused). Contract: { cmd: 'ask'|'sync'|'audit'|'status', question? }
const COMMANDS = new Set(['ask', 'sync', 'audit', 'status']);
const APP_ORIGINS = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173', `http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`,
]);
const CMD_TIMEOUT_MS = 10 * 60 * 1000;
let running = null;

app.post('/cmd', (req, res) => {
  const origin = req.get('origin');
  if (origin && !APP_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin not allowed' });
  const { cmd, question } = req.body || {};
  if (!COMMANDS.has(cmd)) return res.status(400).json({ error: 'cmd must be one of ask, sync, audit, status' });
  const argv = [join(ROOT, 'bin/chip.mjs'), cmd];
  if (cmd === 'ask') {
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'question is required for ask' });
    argv.push(question.trim().slice(0, 2000));
  }
  if (running) return res.status(409).json({ error: `chip ${running} is still running` });

  running = cmd;
  const child = spawn(process.execPath, argv, { cwd: ROOT, shell: false, env: { ...process.env, NO_COLOR: '1' } });
  const timer = setTimeout(() => child.kill('SIGTERM'), CMD_TIMEOUT_MS);
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  child.stdout.on('data', (d) => res.write(d));
  child.stderr.on('data', (d) => res.write(d));
  child.on('error', (err) => res.write(`chip: ${err.message}\n`));
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    running = null;
    res.end(`\n[exit ${code ?? signal}]\n`);
  });
  // the page went away: stop the command rather than run it unseen
  res.on('close', () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  });
});

// Bound to localhost: nothing on the network can reach /ask or /cmd.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[CHIP] http://localhost:${PORT} · model ${CHIP_MODEL} · embeddings ${CHIP_EMBED_MODEL} · ${OLLAMA_URL}`);
  const t = Date.now();
  warm().then(() => console.log(`[CHIP] models warm (${((Date.now() - t) / 1000).toFixed(1)}s)`))
    .catch((err) => console.error('[CHIP] warm-up failed:', err.message));
});
